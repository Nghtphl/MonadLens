import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "./ratelimit";

describe("createRateLimiter", () => {
  it("allows up to the limit per window, then blocks with Retry-After", () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => t });
    expect(rl.check("a")).toEqual({ allowed: true, remaining: 1 });
    expect(rl.check("a")).toEqual({ allowed: true, remaining: 0 });
    t = 15_000;
    expect(rl.check("a")).toEqual({ allowed: false, retryAfterSeconds: 45 });
  });

  it("keeps separate counts per key", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("b").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(false);
  });

  it("starts a fresh window once the old one has passed", () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    rl.check("a");
    expect(rl.check("a").allowed).toBe(false);
    t = 1000;
    expect(rl.check("a").allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("uses the last x-forwarded-for entry, which the client cannot forge", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then 'local'", () => {
    expect(clientIp(new Headers({ "x-real-ip": "5.5.5.5" }))).toBe("5.5.5.5");
    expect(clientIp(new Headers())).toBe("local");
  });

  it("trusts the forwarded client IP only with the right token", () => {
    const h = new Headers({
      "x-monadlens-token": "secret",
      "x-monadlens-client-ip": "9.9.9.9",
      "x-forwarded-for": "7.7.7.7",
    });
    expect(clientIp(h, "secret")).toBe("9.9.9.9");
    expect(clientIp(h, "other")).toBe("7.7.7.7");
    expect(clientIp(h)).toBe("7.7.7.7");
  });
});
