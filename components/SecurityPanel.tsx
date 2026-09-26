"use client";

import { useMemo, useState } from "react";
import { removeSlitherDuplicates } from "@/lib/security/dedupe";
import type { SlitherResult } from "@/lib/security/slither";
import type { Finding } from "@/lib/types";

const SEVERITY_COLOR: Record<Finding["severity"], string> = {
  critical: "border-red-500/30 text-red-400",
  high: "border-orange-500/30 text-orange-400",
  medium: "border-yellow-500/30 text-yellow-400",
  info: "border-purple-500/20 text-purple-300",
  safe: "border-emerald-500/20 text-emerald-400",
};

export interface SecurityPanelProps {
  source: string;
  monadFindings: readonly Finding[];
}

export default function SecurityPanel({ source, monadFindings }: SecurityPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SlitherResult | null>(null);
  const [scannedSource, setScannedSource] = useState<string | null>(null);

  const findings = useMemo(
    () =>
      result?.available
        ? removeSlitherDuplicates(monadFindings, result.findings)
        : [],
    [monadFindings, result]
  );
  const stale = scannedSource !== null && scannedSource !== source;

  const scan = async () => {
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
    <section className="flex flex-col gap-3 border-t border-purple-500/20 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            General Security (Slither)
          </span>

        </div>
        <button
          type="button"
          onClick={scan}
          disabled={loading}
          className="shrink-0 rounded border border-[#836EF9]/60 bg-[#836EF9]/15 px-4 py-2 text-sm font-medium text-zinc-100 transition-shadow hover:shadow-[0_0_14px_#836EF9] disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Scanning…" : "Run Slither"}
        </button>
      </div>

      {result && !result.available && (
        <div className="rounded border border-zinc-600/40 p-3 text-sm text-zinc-300">
          <div className="font-medium">Slither unavailable</div>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-zinc-400">
            {result.reason}
          </pre>
        </div>
      )}

      {result?.available && (
        <div className={stale ? "opacity-50" : ""}>
          <div className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
            <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-400">
              Scanned
            </span>
            {stale && <span className="text-yellow-400">Code changed since this scan</span>}
          </div>
          {findings.length === 0 ? (
            <p className="text-sm text-zinc-500">No additional Slither findings.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {findings.map((finding, index) => (
                <div
                  key={`${finding.ruleId}-${finding.line}-${index}`}
                  className={`rounded border p-3 text-sm ${SEVERITY_COLOR[finding.severity]}`}
                >
                  <div className="font-mono text-xs">
                    {finding.ruleId} · {finding.severity} · line {finding.line}
                  </div>
                  <details className="disclosure mt-2"><summary>Inspect</summary><p className="mt-2 whitespace-pre-wrap break-words text-zinc-200">{finding.message}</p><p className="mt-2 text-xs text-zinc-400">{finding.conflictNote}</p></details>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
