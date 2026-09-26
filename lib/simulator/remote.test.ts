import { describe, expect, it } from "vitest";
import { forwardMeasurement } from "./remote";

const base = { body: { source: "contract C {}", txCount: 100 }, clientIp: "1.2.3.4", timeoutMs: 1000 };

describe("forwardMeasurement", () => {
  it("posts to <service>/api/simulate and passes status and body through", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return Response.json({ error: "Too many measurements." }, { status: 429 });
    }) as unknown as typeof fetch;

    const result = await forwardMeasurement({ ...base, serviceUrl: "https://svc.example/", token: "t", fetchImpl });

    expect(seen?.url).toBe("https://svc.example/api/simulate");
    expect(JSON.parse(seen!.init.body as string)).toEqual(base.body);
    expect(seen!.init.headers).toMatchObject({ "x-monadlens-token": "t", "x-monadlens-client-ip": "1.2.3.4" });
    expect(result).toEqual({ status: 429, body: { error: "Too many measurements." } });
  });

  it("sends no client IP header without a token", async () => {
    let headers: Record<string, string> = {};
    const fetchImpl = (async (_: string, init: RequestInit) => {
      headers = init.headers as Record<string, string>;
      return Response.json({ state: { measured: true } });
    }) as unknown as typeof fetch;

    await forwardMeasurement({ ...base, serviceUrl: "https://svc.example", fetchImpl });
    expect(headers["x-monadlens-client-ip"]).toBeUndefined();
  });

  it("turns an unreachable service into Not measured", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    expect(await forwardMeasurement({ ...base, serviceUrl: "https://svc.example", fetchImpl })).toEqual({
      status: 200,
      body: { state: { measured: false, reason: "Measurement service is unreachable." } },
    });
  });

  it("turns a non-JSON reply into Not measured", async () => {
    const fetchImpl = (async () => new Response("<html>502</html>", { status: 502 })) as unknown as typeof fetch;
    const result = await forwardMeasurement({ ...base, serviceUrl: "https://svc.example", fetchImpl });
    expect(result.body).toEqual({
      state: { measured: false, reason: "Measurement service returned an invalid response (HTTP 502)." },
    });
  });
});
