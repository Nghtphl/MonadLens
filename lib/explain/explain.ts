/**
 * AI explanation layer (CLAUDE.md §13). The AI never detects, scores or measures;
 * it only explains a finding that already exists, from the curated docs in
 * docs/monad. Whenever it can't (no key, API error, rate limit, a number it
 * could not have taken from its sources), the static explanation is returned.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { staticExplanation } from "./fallbacks";

export interface ExplainRequest {
  ruleId: string;
  severity: string;
  line: number;
  message: string;
  conflictNote?: string;
  variable?: string;
  functionName?: string;
  /** ±10 lines around the finding, as sent by the page (see snippetAround). */
  snippet: string;
  /** What the simulator measured about this variable, if anything (the AI must not contradict it). */
  measured?: string;
}

export interface ExplainResponse {
  kind: "ai" | "static";
  text: string;
  /** docs/monad section the text relies on, or "not covered by the provided docs". */
  section: string;
  cached: boolean;
  /** Why the static explanation was used. */
  reason?: string;
}

export interface ExplainDeps {
  apiKey?: string;
  model: string;
  docs: string;
  cache: Map<string, { text: string; section: string }>;
  /** Per-IP limiter for Gemini calls; false means use the static explanation. */
  allowAiCall: () => boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const DEFAULT_MODEL = "gemini-3.5-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_CACHE_ENTRIES = 500;

/** CLAUDE.md §13: cache by hash(ruleId + snippet). */
export function cacheKey(ruleId: string, snippet: string): string {
  return createHash("sha256").update(ruleId + snippet).digest("hex");
}

export { snippetAround } from "./snippet";

/** All docs/monad/*.md, each under a "=== file ===" header, for the prompt. */
export function loadMonadDocs(root = process.cwd()): string {
  const dir = join(root, "docs", "monad");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => `=== docs/monad/${f} ===\n${readFileSync(join(dir, f), "utf8").trim()}`)
    .join("\n\n");
}

export const SYSTEM_PROMPT = [
  "You explain one finding from MonadLens, a static analyzer for Solidity contracts moving from Ethereum to Monad.",
  "Rules:",
  "- Explain in 3 to 4 sentences, plain text, no headings or lists.",
  "- Rely only on the Monad documentation provided in the input. Do not use outside knowledge about Monad.",
  "- Do not invent numbers. Only use numbers that appear in the documentation, the finding or the code snippet.",
  "- Do not contradict the measured result if one is given.",
  "- If the documentation does not cover the question, say so in one sentence instead of guessing.",
  "- End with one last line exactly in the form `Source: docs/monad/<file>.md § <section heading>`, or",
  "  `Source: not covered by the provided docs`.",
].join("\n");

export function buildInput(req: ExplainRequest, docs: string): string {
  return [
    "Monad documentation:",
    docs,
    "",
    "Finding:",
    `- rule: ${req.ruleId} (${req.severity})`,
    `- line: ${req.line}${req.functionName ? ` in ${req.functionName}` : ""}${req.variable ? `, variable ${req.variable}` : ""}`,
    `- message: ${req.message}`,
    req.conflictNote ? `- conflict: ${req.conflictNote}` : "",
    req.measured ? `- measured: ${req.measured}` : "- measured: not measured",
    "",
    "Code (line numbers on the left):",
    req.snippet,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Text from an Interactions API response: the `model_output` steps' text parts
 * (`thought` steps are skipped). Also tolerates the SDK and legacy shapes.
 */
export function responseText(body: any): string {
  if (typeof body?.output_text === "string") return body.output_text;
  const pieces: string[] = [];
  for (const step of body?.steps ?? []) {
    if (step?.type !== "model_output") continue;
    for (const part of step.content ?? []) if (part?.type === "text" && typeof part.text === "string") pieces.push(part.text);
  }
  for (const out of body?.outputs ?? []) {
    if (typeof out?.text === "string") pieces.push(out.text);
    for (const part of out?.content?.parts ?? out?.parts ?? []) if (typeof part?.text === "string") pieces.push(part.text);
  }
  for (const part of body?.candidates?.[0]?.content?.parts ?? []) if (typeof part?.text === "string") pieces.push(part.text);
  return pieces.join("").trim();
}

const NUMBER = /\d[\d,._]*/g;

/** Numbers in `text` that appear in none of `sources` (EIP names and similar included). */
export function inventedNumbers(text: string, sources: string[]): string[] {
  const known = new Set(sources.flatMap((s) => s.match(NUMBER) ?? []).map((n) => n.replace(/[,_]/g, "")));
  return (text.match(NUMBER) ?? []).map((n) => n.replace(/[,_.]$/, "")).filter((n) => !known.has(n.replace(/[,_]/g, "")));
}

function splitSource(raw: string): { text: string; section: string } {
  const lines = raw.trim().split("\n");
  const last = lines[lines.length - 1]?.trim() ?? "";
  const match = last.match(/^Source:\s*(.+)$/i);
  if (!match) return { text: raw.trim(), section: "unspecified" };
  return { text: lines.slice(0, -1).join("\n").trim(), section: match[1].trim().replace(/^`|`$/g, "") };
}

function fallback(req: ExplainRequest, reason: string): ExplainResponse {
  const { text, section } = staticExplanation(req.ruleId);
  return { kind: "static", text, section, cached: false, reason };
}

export async function explain(req: ExplainRequest, deps: ExplainDeps): Promise<ExplainResponse> {
  const key = cacheKey(req.ruleId, req.snippet);
  const hit = deps.cache.get(key);
  if (hit) return { kind: "ai", ...hit, cached: true };

  if (!deps.apiKey) return fallback(req, "No GEMINI_API_KEY is set.");
  if (!deps.allowAiCall()) return fallback(req, "Too many AI explanation requests; try again in a minute.");

  let res: Response;
  try {
    res = await (deps.fetchImpl ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": deps.apiKey },
      body: JSON.stringify({
        model: deps.model,
        system_instruction: SYSTEM_PROMPT,
        input: buildInput(req, deps.docs),
        generation_config: { thinking_level: "low" },
      }),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 20_000),
    });
  } catch (e) {
    return fallback(req, e instanceof Error && e.name === "TimeoutError" ? "The AI service timed out." : "The AI service is unreachable.");
  }
  if (res.status === 429) return fallback(req, "The AI service is rate-limited.");
  if (!res.ok) {
    const detail = await res
      .json()
      .then((b: any) => (typeof b?.error?.message === "string" ? ` (${b.error.message.slice(0, 160)})` : ""))
      .catch(() => "");
    return fallback(req, `The AI service returned HTTP ${res.status}${detail}.`);
  }

  let raw: string;
  try {
    raw = responseText(await res.json());
  } catch {
    return fallback(req, "The AI service returned an unreadable response.");
  }
  if (!raw) return fallback(req, "The AI service returned no text.");

  const { text, section } = splitSource(raw);
  const invented = inventedNumbers(text, [deps.docs, req.snippet, req.message, req.conflictNote ?? "", req.measured ?? ""]);
  if (invented.length > 0) {
    return fallback(req, `The AI answer contained numbers not found in its sources (${invented.slice(0, 3).join(", ")}).`);
  }

  if (deps.cache.size >= MAX_CACHE_ENTRIES) deps.cache.delete(deps.cache.keys().next().value!);
  deps.cache.set(key, { text, section });
  return { kind: "ai", text, section, cached: false };
}
