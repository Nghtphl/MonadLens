"use client";

import { useMemo, useState } from "react";
import { removeSlitherDuplicates } from "@/lib/security/dedupe";
import type { SlitherResult } from "@/lib/security/slither";
import type { Finding } from "@/lib/types";
import { LineButton } from "./FindingCard";
import { findingTitle, SEVERITY_LABEL } from "./findingTitles";

export interface SecurityPanelProps {
  source: string;
  monadFindings: readonly Finding[];
  onRevealLine?: (line: number) => void;
}

export default function SecurityPanel({ source, monadFindings, onRevealLine }: SecurityPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SlitherResult | null>(null);
  const [scannedSource, setScannedSource] = useState<string | null>(null);

  const findings = useMemo(
    () => (result?.available ? removeSlitherDuplicates(monadFindings, result.findings) : []),
    [monadFindings, result]
  );
  const stale = scannedSource !== null && scannedSource !== source;

  const scan = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/security", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const body = (await response.json()) as SlitherResult;
      setResult(body);
      setScannedSource(source);
    } catch {
      setResult({ available: false, reason: "Security service is unreachable." });
      setScannedSource(source);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="block" aria-labelledby="slither-heading" aria-busy={loading}>
      <div className="block-head">
        <h2 id="slither-heading" className="block-title">
          General security (Slither)
        </h2>
        <span className="block-hint">Generic detectors; Monad-specific findings stay in the Monad tab</span>
      </div>
      <button type="button" onClick={scan} disabled={loading} aria-busy={loading} className="btn btn-secondary btn-block">
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Scanning…
          </>
        ) : (
          "Run Slither"
        )}
      </button>

      {result && !result.available && (
        <div className="notice notice-neutral" role="status">
          <div className="notice-title">Slither unavailable</div>
          <pre className="notice-pre">{result.reason}</pre>
        </div>
      )}

      {result?.available && (
        <div className={stale ? "is-stale" : undefined}>
          <div className="measured-head">
            <span className="tag tag-measured">Scanned</span>
            {stale && <span className="warn-text small">Code changed since this scan</span>}
          </div>
          {findings.length === 0 ? (
            <p className="muted">No additional Slither findings.</p>
          ) : (
            <div className="finding-list">
              {findings.map((finding, index) => (
                <article key={`${finding.ruleId}-${finding.line}-${index}`} className="finding-card" data-severity={finding.severity}>
                  <div className="finding-top">
                    <span className={`sev sev-${finding.severity}`}>{SEVERITY_LABEL[finding.severity]}</span>
                    {onRevealLine ? (
                      <LineButton line={finding.line} onRevealLine={onRevealLine} />
                    ) : (
                      <span className="mono muted small">Line {finding.line}</span>
                    )}
                  </div>
                  <h3 className="finding-title">{findingTitle(finding.ruleId)}</h3>
                  <details className="disclosure">
                    <summary>Inspect</summary>
                    <div className="disclosure-content">
                      <p className="mono small muted">{finding.ruleId}</p>
                      <p className="finding-message">{finding.message}</p>
                      <p className="finding-conflict">{finding.conflictNote}</p>
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
