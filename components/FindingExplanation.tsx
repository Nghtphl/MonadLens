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
    if (loading) return;
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
    <div className="explain">
      <div className="explain-row">
        <button type="button" onClick={run} disabled={loading} aria-busy={loading} className="btn btn-secondary btn-sm">
          {loading ? "Explaining…" : "Explain"}
        </button>
        {aiEnabled && (
          <span className="explain-note">AI explanation sends this finding and ±10 lines of code to Google Gemini.</span>
        )}
      </div>

      {error && (
        <p role="alert" className="explain-error">
          {error}
        </p>
      )}

      {current && (
        <div data-testid="finding-explanation" className={`explain-box ${current.kind === "ai" ? "is-ai" : "is-static"}`}>
          <div className="explain-head">
            <span className="explain-kind">{current.kind === "ai" ? "AI explanation" : "Static explanation"}</span>
            {current.cached && <span className="explain-meta">cached</span>}
          </div>
          <p className="explain-text">{current.text}</p>
          <p className="explain-meta">
            {current.section === "none" ? "No docs section." : `Source: ${current.section}`}
            {current.kind === "static" && current.reason && ` · ${current.reason}`}
          </p>
        </div>
      )}
    </div>
  );
}
