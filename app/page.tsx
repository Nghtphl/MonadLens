"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import Link from "next/link";
import { analyzeSolidityCode } from "@/lib/analyzer";
import type { Finding } from "@/lib/types";
import MeasurePanel, { type MeasuredHotVariables, type MeasurePanelHandle } from "@/components/MeasurePanel";
import DiffView from "@/components/DiffView";
import SecurityPanel from "@/components/SecurityPanel";
import FindingExplanation from "@/components/FindingExplanation";
import { getFixTemplate } from "@/lib/fixer/templates";
import { DEMO_CONTRACTS } from "./demoContracts";

const ANALYSIS_DEBOUNCE_MS = 300;

const SEVERITY_COLOR: Record<Finding["severity"], string> = {
  critical: "text-red-400 border-red-500/30",
  high: "text-orange-400 border-orange-500/30",
  medium: "text-yellow-400 border-yellow-500/30",
  info: "text-purple-300 border-purple-500/20",
  safe: "text-emerald-400 border-emerald-500/20",
};

// monaco.MarkerSeverity values (avoids importing the `monaco-editor` types package)
const MARKER_SEVERITY: Record<Finding["severity"], number> = {
  critical: 8, // Error
  high: 4, // Warning
  medium: 4, // Warning
  info: 2, // Info
  safe: 1, // Hint
};

export default function Home() {
  const [source, setSource] = useState(DEMO_CONTRACTS[0].source);
  const [selectedDemo, setSelectedDemo] = useState(DEMO_CONTRACTS[0].id);
  const [score, setScore] = useState<number | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [tab, setTab] = useState<"monad" | "security">("monad");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const [fixSelection, setFixSelection] = useState<{
    templateId: string;
    finding: Finding;
  } | null>(null);
  const measurePanelRef = useRef<MeasurePanelHandle>(null);
  const [measuredHot, setMeasuredHot] = useState<MeasuredHotVariables | null>(null);
  const highlightRef = useRef<{ clear(): void } | null>(null);
  const staticVariables = useMemo(
    () => Array.from(new Set(findings.flatMap((f) => (f.variable ? [f.variable] : [])))),
    [findings]
  );
  const measuredVariables = measuredHot?.source === source ? measuredHot.variables : [];

  // Only whether a Gemini key is set, so the page can say findings go to Google.
  useEffect(() => {
    fetch("/api/explain")
      .then((r) => r.json())
      .then((b) => setAiEnabled(Boolean(b?.aiEnabled)))
      .catch(() => setAiEnabled(false));
  }, []);
  const fixAttempt = useMemo(() => {
    if (!fixSelection) return undefined;
    const template = getFixTemplate(fixSelection.templateId);
    if (!template) return { ok: false as const, finding: fixSelection.finding };
    try {
      const modified = template.apply(source, {
        variable: fixSelection.finding.variable,
        functionName: fixSelection.finding.functionName,
      });
      // A template that changes nothing did not apply either.
      if (modified === source) return { ok: false as const, finding: fixSelection.finding };
      return { ok: true as const, template, modified };
    } catch {
      return { ok: false as const, finding: fixSelection.finding };
    }
  }, [fixSelection, source]);
  const fixPreview = fixAttempt?.ok ? fixAttempt : undefined;
  const fixFailedFor = fixAttempt && !fixAttempt.ok ? fixAttempt.finding : null;

  useEffect(() => {
    const timeout = setTimeout(() => {
      const result = analyzeSolidityCode(source);
      setScore(result.error ? null : result.score);
      setFindings(result.error ? [] : result.findings);
      setParseError(result.error?.message ?? null);

      const monaco = monacoRef.current;
      const editor = editorRef.current;
      if (!monaco || !editor) return;
      const model = editor.getModel();
      if (!model) return;

      monaco.editor.setModelMarkers(
        model,
        "monadlens",
        result.error
          ? []
          : result.findings.map((finding) => ({
              startLineNumber: finding.line,
              startColumn: (finding.column ?? 0) + 1,
              endLineNumber: finding.line,
              endColumn: (finding.column ?? 0) + 2,
              message: `${finding.ruleId}: ${finding.message}`,
              severity: MARKER_SEVERITY[finding.severity],
            }))
      );
    }, ANALYSIS_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [source]);

  const handleDemoChange = (id: string) => {
    const demo = DEMO_CONTRACTS.find((d) => d.id === id);
    if (!demo) return;
    setSelectedDemo(id);
    setSource(demo.source);
    setMeasuredHot(null);
  };

  const revealLine = (line: number) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    highlightRef.current?.clear();
    const collection = editor.createDecorationsCollection([
      {
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: true, className: "monadlens-line-highlight" },
      },
    ]);
    highlightRef.current = collection;
    setTimeout(() => collection.clear(), 2500);
  };

  const applyFix = () => {
    if (!fixPreview) return;
    setSource(fixPreview.modified);
    setFixSelection(null);
    measurePanelRef.current?.remeasureWithBaseline(fixPreview.modified);
  };

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  return (
    <div className="flex flex-1 flex-col bg-[#0B0B0E] text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-500/20 bg-[#13111C]/80 px-6 py-4 backdrop-blur-md">
        <div>
          <h1 className="text-lg font-semibold">
            Monad<span className="text-[#836EF9]">Lens</span>
          </h1>
          <p className="text-sm text-zinc-400">
            Static parallel-execution and Monad-migration inspector for Solidity contracts.{" "}
            <Link href="/findings" className="text-[#836EF9] hover:underline">
              Findings on real contracts
            </Link>
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Demo contract
          <select
            value={selectedDemo}
            onChange={(e) => handleDemoChange(e.target.value)}
            className="rounded border border-purple-500/20 bg-[#0B0B0E] px-2 py-1 text-zinc-100"
          >
            {DEMO_CONTRACTS.map((demo) => (
              <option key={demo.id} value={demo.id}>
                {demo.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-purple-500/20 bg-[#13111C]/80 backdrop-blur-md">
          <Editor
            height="70vh"
            defaultLanguage="sol"
            theme="vs-dark"
            value={source}
            onChange={(value) => setSource(value ?? "")}
            onMount={handleMount}
            options={{ minimap: { enabled: false }, fontSize: 13 }}
          />
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto rounded-lg border border-purple-500/20 bg-[#13111C]/80 p-4 backdrop-blur-md">
          <div role="tablist" className="flex gap-1 border-b border-purple-500/20">
            {(
              [
                ["monad", "Monad Compatibility & Parallelism"],
                ["security", "General Security (Slither)"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                  tab === id
                    ? "border-[#836EF9] text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Both tabs stay mounted so switching keeps measurement and scan results. */}
          <div role="tabpanel" hidden={tab !== "security"}>
            <SecurityPanel source={source} monadFindings={findings} />
          </div>

          <div role="tabpanel" hidden={tab !== "monad"} className={tab === "monad" ? "flex flex-col gap-4" : "hidden"}>
          <div>
            <span className="text-xs uppercase tracking-wide text-zinc-500">
              Heuristic Parallel Score
            </span>
            <div className="text-3xl font-semibold text-[#836EF9]">
              {parseError ? "—" : score}
              {!parseError && <span className="text-base text-zinc-500"> / 100</span>}
            </div>
          </div>

          {parseError && (
            <div className="rounded border border-red-500/30 p-3 text-sm text-red-400">
              Syntax error: {parseError}
            </div>
          )}

          <MeasurePanel
            key={selectedDemo}
            ref={measurePanelRef}
            source={source}
            staticVariables={staticVariables}
            onRevealLine={revealLine}
            onMeasured={setMeasuredHot}
          />

          <div className="flex flex-col gap-3 border-t border-purple-500/20 pt-4">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Static findings</span>
            {findings.length === 0 && !parseError && (
              <p className="text-sm text-zinc-500">No findings.</p>
            )}
            {findings.map((finding, i) => (
              <div
                key={`${finding.ruleId}-${finding.line}-${i}`}
                className={`rounded border p-3 text-sm ${SEVERITY_COLOR[finding.severity]}`}
              >
                <div className="flex items-center justify-between gap-2 font-mono text-xs">
                  <span className="flex flex-wrap items-center gap-2">
                    {finding.ruleId} · {finding.severity} · line {finding.line}
                    {finding.variable && measuredVariables.includes(finding.variable) && (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-sans text-[11px] font-medium text-emerald-300">
                        Predicted &amp; measured
                      </span>
                    )}
                  </span>
                  {finding.fixTemplateId && getFixTemplate(finding.fixTemplateId) ? (
                    <button
                      type="button"
                      onClick={() =>
                        setFixSelection({ templateId: finding.fixTemplateId!, finding })
                      }
                      className="rounded border border-[#836EF9]/60 bg-[#836EF9]/15 px-2 py-0.5 font-sans text-xs text-zinc-100 transition-shadow hover:shadow-[0_0_12px_#836EF9]"
                    >
                      Fix
                    </button>
                  ) : (
                    finding.ruleId === "P8_INHERENT" && <span className="font-sans text-zinc-500">No fix: expected</span>
                  )}
                </div>
                <p className="mt-1 text-zinc-200">{finding.message}</p>
                <p className="mt-1 text-xs text-zinc-400">{finding.conflictNote}</p>
                <FindingExplanation
                  finding={finding}
                  source={source}
                  aiEnabled={aiEnabled}
                  measured={
                    finding.variable && measuredVariables.includes(finding.variable)
                      ? `"${finding.variable}" was a hot slot in the block MonadLens measured for this code.`
                      : undefined
                  }
                />
                {fixFailedFor === finding && (
                  <div
                    role="alert"
                    className="mt-2 flex items-start justify-between gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200"
                  >
                    <span>
                      This fix could not be applied to this code automatically. Fix it by hand, following the
                      finding&apos;s description above.
                    </span>
                    <button
                      type="button"
                      onClick={() => setFixSelection(null)}
                      className="shrink-0 text-amber-300 hover:text-amber-100"
                      aria-label="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          </div>
        </div>
      </main>

      {fixPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setFixSelection(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-full w-full max-w-6xl flex-col gap-3 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <DiffView original={source} modified={fixPreview.modified} tradeoffs={fixPreview.template.tradeoffs} title={fixPreview.template.title} height="55vh" />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-purple-500/20 bg-[#13111C] px-4 py-3">
              <p className="text-xs text-zinc-400">
                This template patches the relevant declarations and calculations in place.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFixSelection(null)}
                  className="rounded border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyFix}
                  className="rounded border border-[#836EF9]/60 bg-[#836EF9]/25 px-4 py-2 text-sm font-medium text-zinc-100 transition-shadow hover:shadow-[0_0_14px_#836EF9]"
                >
                  Apply &amp; re-measure
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
