import { DEFAULT_MODEL, explain, loadMonadDocs, type ExplainRequest } from "@/lib/explain/explain";
import { clientIp, createRateLimiter } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_SNIPPET_CHARS = 8_000;
const MAX_TEXT_CHARS = 2_000;

// Per instance: AI answers by hash(ruleId + snippet) (CLAUDE.md §13), and a
// per-IP limit on Gemini calls. Cached answers and static fallbacks are free.
const cache = new Map<string, { text: string; section: string }>();
const aiLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
let docs: string | undefined;

const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : undefined);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const ruleId = str(body.ruleId, 100);
  const message = str(body.message, MAX_TEXT_CHARS);
  const snippet = str(body.snippet, MAX_SNIPPET_CHARS);
  const line = typeof body.line === "number" && Number.isInteger(body.line) ? body.line : undefined;
  if (!ruleId || !message || snippet === undefined || line === undefined) {
    return Response.json(
      { error: `\`ruleId\`, \`message\`, \`line\` and \`snippet\` (≤ ${MAX_SNIPPET_CHARS} chars) are required.` },
      { status: 400 }
    );
  }
  const req: ExplainRequest = {
    ruleId,
    message,
    snippet,
    line,
    severity: str(body.severity, 20) ?? "unknown",
    conflictNote: str(body.conflictNote, MAX_TEXT_CHARS),
    variable: str(body.variable, 200),
    functionName: str(body.functionName, 200),
    measured: str(body.measured, MAX_TEXT_CHARS),
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && docs === undefined) docs = loadMonadDocs();
  const ip = clientIp(request.headers);

  const result = await explain(req, {
    apiKey,
    model: process.env.GEMINI_MODEL ?? DEFAULT_MODEL,
    docs: docs ?? "",
    cache,
    allowAiCall: () => aiLimiter.check(ip).allowed,
  });
  return Response.json(result);
}

/** Whether AI explanations are on, so the page can say that findings go to Gemini. Never exposes the key. */
export async function GET() {
  return Response.json({ aiEnabled: Boolean(process.env.GEMINI_API_KEY) });
}
