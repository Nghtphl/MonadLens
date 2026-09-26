"use client";

import { useState } from "react";
import type { ExplainResponse } from "@/lib/explain/explain";
import { snippetAround } from "@/lib/explain/snippet";
import type { Finding } from "@/lib/types";

export interface FindingExplanationProps {
  finding: Finding;
  source: string;
  /** A Gemini key is configured on the server: findings leave the machine. */
  aiEnabled: boolean;
  /** What the simulator measured about this finding's variable, if anything. */
  measured?: string;
}

/**
 * "Explain" for one finding (CLAUDE.md §13). The explanation is styled apart
 * from the deterministic finding and labeled "AI explanation" or "Static
 * explanation"; it is hidden again once the code changes.
 */
export default function FindingExplanation({ finding, source, aiEnabled, measured }: FindingExplanationProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ forSource: string; response: ExplainResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = result?.forSource === source ? result.response : null;

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ruleId: finding.ruleId,
          severity: finding.severity,
          line: finding.line,
          message: finding.message,
          conflictNote: finding.conflictNote,
          variable: finding.variable,
          functionName: finding.functionName,
          snippet: snippetAround(source, finding.line, 10),
          measured,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
      setResult({ forSource: source, response: body as ExplainResponse });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Explanation request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 font-sans text-xs text-sky-100 transition-shadow hover:shadow-[0_0_12px_#836EF9] disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Explaining…" : "Explain"}
        </button>
        {aiEnabled && (
          <span className="text-[11px] text-zinc-500">
            AI explanation sends this finding and ±10 lines of code to Google Gemini.
          </span>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {current && (
        <div
          data-testid="finding-explanation"
          className={`rounded border-l-2 p-2 text-xs ${
            current.kind === "ai" ? "border-sky-400/70 bg-sky-500/5" : "border-zinc-500/60 bg-zinc-500/5"
          }`}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 font-medium ${
                current.kind === "ai" ? "bg-sky-500/15 text-sky-200" : "bg-zinc-500/20 text-zinc-300"
              }`}
            >
              {current.kind === "ai" ? "AI explanation" : "Static explanation"}
            </span>
            {current.cached && <span className="text-zinc-500">cached</span>}
          </div>
          <p className="whitespace-pre-wrap text-zinc-300">{current.text}</p>
          <p className="mt-1 text-zinc-500">
            {current.section === "none" ? "No docs section." : `Source: ${current.section}`}
            {current.kind === "static" && current.reason && ` · ${current.reason}`}
          </p>
        </div>
      )}
    </div>
  );
}
