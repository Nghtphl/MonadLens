/**
 * Per-IP fixed-window rate limit, in memory (CLAUDE.md §16). One process, one
 * table: good enough for a single measurement container. Serverless instances
 * each keep their own table, so there it is only a first line of defence.
 */

export interface RateLimitOptions {
  limit: number; // requests allowed per window
  windowMs: number;
  now?: () => number; // injectable clock for tests
}

export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  check(key: string): RateLimitDecision;
}

export function createRateLimiter({ limit, windowMs, now = Date.now }: RateLimitOptions): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();

  return {
    check(key) {
      const t = now();
      let w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        // Drop expired entries now and then so the table can't grow without bound.
        if (windows.size > 10_000) {
          for (const [k, v] of windows) if (t - v.start >= windowMs) windows.delete(k);
        }
        w = { start: t, count: 0 };
        windows.set(key, w);
      }
      if (w.count >= limit) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((w.start + windowMs - t) / 1000)) };
      }
      w.count++;
      return { allowed: true, remaining: limit - w.count };
    },
  };
}

/**
 * Client IP for rate limiting. `x-forwarded-for` entries left of the last one
 * can be written by the client, so the last entry (added by the proxy in front
 * of us) is used. A trusted caller (the Vercel frontend forwarding to the
 * measurement service) passes the real client IP with a shared token.
 */
export function clientIp(headers: Headers, trustedToken?: string): string {
  if (trustedToken && headers.get("x-monadlens-token") === trustedToken) {
    const forwarded = headers.get("x-monadlens-client-ip")?.trim();
    if (forwarded) return forwarded;
  }
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return headers.get("x-real-ip")?.trim() || "local";
}
