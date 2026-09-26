import { describe, expect, it } from "vitest";
import {
  buildInput,
  cacheKey,
  explain,
  inventedNumbers,
  loadMonadDocs,
  responseText,
  snippetAround,
  type ExplainDeps,
  type ExplainRequest,
} from "./explain";
import { STATIC_EXPLANATIONS } from "./fallbacks";

const req: ExplainRequest = {
  ruleId: "P1_GLOBAL_COUNTER",
  severity: "critical",
  line: 11,
  message: 'Global counter "totalSupply" is incremented directly.',
  variable: "totalSupply",
  functionName: "mint",
  snippet: "  11|         totalSupply++;",
};

const docs = "=== docs/monad/parallel-execution.md ===\n## Optimistic execution\nConflicting transactions are re-executed.";

function deps(overrides: Partial<ExplainDeps> = {}): ExplainDeps & { calls: number } {
  const d = {
    calls: 0,
    apiKey: "test-key",
    model: "test-model",
    docs,
    cache: new Map(),
    allowAiCall: () => true,
    ...overrides,
  } as ExplainDeps & { calls: number };
  return d;
}

const reply = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("explain: static fallback", () => {
  it("uses the static explanation when no key is set, without calling out", async () => {
    let called = false;
    const d = deps({ apiKey: undefined, fetchImpl: (async () => ((called = true), new Response("{}"))) as any });
    const res = await explain(req, d);
    expect(res).toMatchObject({ kind: "static", cached: false, reason: "No GEMINI_API_KEY is set." });
    expect(res.text).toBe(STATIC_EXPLANATIONS.P1_GLOBAL_COUNTER.text);
    expect(called).toBe(false);
  });

  it("falls back on API errors, Gemini rate limits, our own limit, and network failures", async () => {
    expect((await explain(req, deps({ fetchImpl: reply({}, 500) }))).reason).toBe("The AI service returned HTTP 500.");
    expect((await explain(req, deps({ fetchImpl: reply({ error: { message: "busy" } }, 503) }))).reason).toBe(
      "The AI service returned HTTP 503 (busy)."
    );
    expect((await explain(req, deps({ fetchImpl: reply({}, 429) }))).reason).toBe("The AI service is rate-limited.");
    expect((await explain(req, deps({ allowAiCall: () => false }))).reason).toMatch(/Too many AI explanation requests/);
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect((await explain(req, deps({ fetchImpl: down }))).reason).toBe("The AI service is unreachable.");
    expect((await explain(req, deps({ fetchImpl: reply({ outputs: [] }) }))).reason).toBe("The AI service returned no text.");
  });

  it("rejects an AI answer with a number that is in none of its sources", async () => {
    const res = await explain(
      req,
      deps({ fetchImpl: reply({ output_text: "Monad blocks take 400 ms.\nSource: docs/monad/parallel-execution.md § Optimistic execution" }) })
    );
    expect(res.kind).toBe("static");
    expect(res.reason).toContain("400");
  });
});

describe("explain: AI path and cache", () => {
  it("returns the AI text with its cited section, then serves it from the cache", async () => {
    let calls = 0;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls++;
      const sent = JSON.parse(init.body as string);
      expect(sent.system_instruction).toContain("Do not invent numbers");
      expect(sent.input).toContain(docs);
      expect(sent.input).toContain(req.snippet);
      return new Response(
        JSON.stringify({
          output_text:
            "Every mint writes totalSupply, so conflicting transactions are re-executed one after another.\nSource: docs/monad/parallel-execution.md § Optimistic execution",
        })
      );
    }) as unknown as typeof fetch;
    const d = deps({ fetchImpl });

    const first = await explain(req, d);
    expect(first).toMatchObject({ kind: "ai", cached: false, section: "docs/monad/parallel-execution.md § Optimistic execution" });
    expect(first.text).not.toContain("Source:");

    const second = await explain(req, d);
    expect(second).toMatchObject({ kind: "ai", cached: true, text: first.text });
    expect(calls).toBe(1);

    // A different snippet is a different cache entry.
    await explain({ ...req, snippet: req.snippet + " " }, d);
    expect(calls).toBe(2);
  });

  it("does not cache static fallbacks, so adding a key later takes effect", async () => {
    const cache = new Map();
    await explain(req, deps({ apiKey: undefined, cache }));
    expect(cache.size).toBe(0);
  });

  it("keys the cache by hash(ruleId + snippet)", () => {
    expect(cacheKey("P1", "x")).toBe(cacheKey("P1", "x"));
    expect(cacheKey("P1", "x")).not.toBe(cacheKey("P3", "x"));
    expect(cacheKey("P1", "x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("explain helpers", () => {
  it("reads text from Interactions, outputs[] and legacy shapes", () => {
    expect(responseText({ output_text: "a" })).toBe("a");
    expect(
      responseText({
        steps: [
          { type: "thought", signature: "x" },
          { type: "model_output", content: [{ type: "text", text: "OK" }] },
        ],
      })
    ).toBe("OK");
    expect(responseText({ outputs: [{ type: "text", text: "a" }, { text: "b" }] })).toBe("ab");
    expect(responseText({ candidates: [{ content: { parts: [{ text: "c" }] } }] })).toBe("c");
    expect(responseText({})).toBe("");
  });

  it("takes ±10 numbered lines around the finding", () => {
    const source = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");
    const lines = snippetAround(source, 15).split("\n");
    expect(lines).toHaveLength(21);
    expect(lines[0]).toBe("   5| line 5");
    expect(lines[20]).toBe("  25| line 25");
    expect(snippetAround(source, 2).split("\n")[0]).toBe("   1| line 1");
  });

  it("flags only numbers missing from the sources", () => {
    expect(inventedNumbers("128 KB and 300 ms", ["limit is 128 KB"])).toEqual(["300"]);
    expect(inventedNumbers("EIP-1153", ["EIP-1153"])).toEqual([]);
  });

  it("puts the docs, the finding, the measurement and the code in the input", () => {
    const input = buildInput({ ...req, measured: "hot slot: 100 of 100 txs write" }, docs);
    expect(input).toContain("rule: P1_GLOBAL_COUNTER (critical)");
    expect(input).toContain("measured: hot slot: 100 of 100 txs write");
    expect(input).toContain(req.snippet);
  });

  it("loads every docs/monad file", () => {
    const all = loadMonadDocs();
    for (const f of ["README.md", "parallel-execution.md", "blocks-and-time.md", "gas.md", "contracts-and-storage.md"]) {
      expect(all).toContain(`=== docs/monad/${f} ===`);
    }
  });
});
