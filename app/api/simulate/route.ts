import { clientIp, createRateLimiter } from "@/lib/ratelimit";
import { forwardMeasurement } from "@/lib/simulator/remote";

export const runtime = "nodejs";
// Compile limit + measurement limit + margin (§16).
export const maxDuration = 90;

const COMPILE_TIMEOUT_MS = 20_000;
const MEASURE_TIMEOUT_MS = 60_000;
const MAX_SOURCE_CHARS = 50_000;
const MAX_BODY_BYTES = 256 * 1024;
const MIN_TX = 2;
const MAX_TX = 200;

const MEASUREMENT_UNAVAILABLE_REASON = "Measurement runs locally, see README";

// Each measurement spawns anvil and traces ~200 calls; a few per minute is plenty for one person.
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export async function POST(request: Request) {
  const serviceUrl = process.env.MEASURE_SERVICE_URL;
  const ip = clientIp(request.headers, process.env.MEASURE_SERVICE_TOKEN);
  const decision = limiter.check(ip);
  if (!decision.allowed) {
    return Response.json(
      { error: `Too many measurements. Try again in ${decision.retryAfterSeconds}s.` },
      { status: 429, headers: { "retry-after": String(decision.retryAfterSeconds) } }
    );
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: `Body exceeds ${MAX_BODY_BYTES} bytes.` }, { status: 413 });
  }

  // anvil can't run on Vercel Functions (CLAUDE.md §15); static analysis and fixes still work.
  if (process.env.VERCEL && !serviceUrl) {
    return Response.json({ state: { measured: false, reason: MEASUREMENT_UNAVAILABLE_REASON } });
  }

  let body: { source?: unknown; txCount?: unknown; functionName?: unknown; contractName?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { source, txCount = 100, functionName, contractName } = body;
  if (typeof source !== "string" || source.trim() === "") {
    return Response.json({ error: "`source` must be a non-empty string." }, { status: 400 });
  }
  if (source.length > MAX_SOURCE_CHARS) {
    return Response.json({ error: `Source exceeds ${MAX_SOURCE_CHARS} characters.` }, { status: 413 });
  }
  if (typeof txCount !== "number" || !Number.isInteger(txCount) || txCount < MIN_TX || txCount > MAX_TX) {
    return Response.json({ error: `\`txCount\` must be an integer between ${MIN_TX} and ${MAX_TX}.` }, { status: 400 });
  }
  if (functionName !== undefined && typeof functionName !== "string") {
    return Response.json({ error: "`functionName` must be a string." }, { status: 400 });
  }
  if (contractName !== undefined && typeof contractName !== "string") {
    return Response.json({ error: "`contractName` must be a string." }, { status: 400 });
  }

  if (serviceUrl) {
    const forwarded = await forwardMeasurement({
      serviceUrl,
      body: { source, txCount, functionName, contractName },
      clientIp: ip,
      token: process.env.MEASURE_SERVICE_TOKEN,
      timeoutMs: (maxDuration - 5) * 1000,
    });
    return Response.json(forwarded.body, { status: forwarded.status });
  }

  const { measureContract } = await import("@/lib/simulator/trace");
  const result = await measureContract({
    source,
    txCount,
    functionName,
    contractName,
    compileTimeoutMs: COMPILE_TIMEOUT_MS,
    timeoutMs: MEASURE_TIMEOUT_MS,
  });
  return Response.json(result);
}
