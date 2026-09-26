/**
 * Remote measurement (CLAUDE.md §15): the Vercel frontend can't run anvil, so
 * when MEASURE_SERVICE_URL is set, /api/simulate forwards the request to the
 * measurement container, which runs the same route with a local anvil.
 */

export interface ForwardOptions {
  serviceUrl: string; // base URL, e.g. https://monadlens-measure.fly.dev
  body: unknown;
  clientIp: string;
  token?: string; // MEASURE_SERVICE_TOKEN: lets the service trust clientIp for its own rate limit
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export interface ForwardResult {
  status: number;
  body: unknown;
}

export async function forwardMeasurement({
  serviceUrl,
  body,
  clientIp,
  token,
  timeoutMs,
  fetchImpl = fetch,
}: ForwardOptions): Promise<ForwardResult> {
  const url = `${serviceUrl.replace(/\/+$/, "")}/api/simulate`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) {
    headers["x-monadlens-token"] = token;
    headers["x-monadlens-client-ip"] = clientIp;
  }

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return unmeasured(timedOut ? "Measurement service timed out." : "Measurement service is unreachable.");
  }

  try {
    return { status: res.status, body: await res.json() };
  } catch {
    return unmeasured(`Measurement service returned an invalid response (HTTP ${res.status}).`);
  }
}

// Service failures show as "Not measured" (§7), not as a broken request.
const unmeasured = (reason: string): ForwardResult => ({
  status: 200,
  body: { state: { measured: false, reason } },
});
