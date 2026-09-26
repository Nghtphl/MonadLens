"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import Link from "next/link";
import { analyzeSolidityCode } from "@/lib/analyzer";
import type { Finding } from "@/lib/types";
import MeasurePanel, { type MeasuredHotVariables, type MeasurePanelHandle } from "./MeasurePanel";
import SecurityPanel from "./SecurityPanel";
import FindingCard from "./FindingCard";
import FixReviewDialog from "./FixReviewDialog";
import { planFixes, type FixCandidate } from "./fixPlan";
import { findingTitle } from "./findingTitles";
import { defineMonadLensTheme, MONADLENS_THEME } from "./editorTheme";
import { DEMO_CONTRACTS } from "@/app/demoContracts";

const ANALYSIS_DEBOUNCE_MS = 300;
const SEVERITY_ORDER = ["critical", "high", "medium", "info", "safe"] as const;

// monaco.MarkerSeverity values (avoids importing the `monaco-editor` types package)
const MARKER_SEVERITY: Record<Finding["severity"], number> = {
  critical: 8, // Error
  high: 4, // Warning
  medium: 4, // Warning
  info: 2, // Info
  safe: 1, // Hint
};

type Tab = "monad" | "security";
const TABS: [Tab, string][] = [
  ["monad", "Monad analysis"],
  ["security", "Slither"],
];

export default function Workspace({
  active,
  headingRef,
  onBackToIntro,
}: {
  active: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  onBackToIntro(): void;
}) {
  const [source, setSource] = useState(DEMO_CONTRACTS[0].source);
  const [selectedDemo, setSelectedDemo] = useState(DEMO_CONTRACTS[0].id);
  const [analysis, setAnalysis] = useState<{
    source: string;
    score: number | null;
    findings: Finding[];
    parseError: { message: string; line?: number } | null;
  } | null>(null);
  const [tab, setTab] = useState<Tab>("monad");
  const [inspected, setInspected] = useState<string[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [measuredHot, setMeasuredHot] = useState<MeasuredHotVariables | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const measurePanelRef = useRef<MeasurePanelHandle>(null);
  const highlightRef = useRef<{ clear(): void } | null>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ monad: null, security: null });

  const currentAnalysis = analysis?.source === source ? analysis : null;
  const findings = useMemo(() => currentAnalysis?.findings ?? [], [currentAnalysis]);
  const parseError = currentAnalysis?.parseError ?? null;
  const score = currentAnalysis?.score ?? null;
  const analyzing = currentAnalysis === null;
  const staticVariables = useMemo(
    () => Array.from(new Set(findings.flatMap((f) => (f.variable ? [f.variable] : [])))),
    [findings]
  );
  const measuredVariables = measuredHot?.source === source ? measuredHot.variables : [];
  const demoSource = DEMO_CONTRACTS.find((d) => d.id === selectedDemo)?.source;

  // Fixes come from lib/fixer templates, computed for the analyzed source only.
  const fixPlan = useMemo(
    () => (currentAnalysis && !currentAnalysis.parseError ? planFixes(currentAnalysis.source, currentAnalysis.findings) : { candidates: [], failed: [] }),
    [currentAnalysis]
  );
  const coveredCount = fixPlan.candidates.reduce((n, c) => n + c.covers.length, 0);

  // Only whether a Gemini key is set, so the page can say findings go to Google.
  useEffect(() => {
    fetch("/api/explain")
      .then((r) => r.json())
      .then((b) => setAiEnabled(Boolean(b?.aiEnabled)))
      .catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const result = analyzeSolidityCode(source);
      setAnalysis({
        source,
        score: result.error ? null : result.score,
        findings: result.error ? [] : result.findings,
        parseError: result.error ? { message: result.error.message, line: result.error.line } : null,
      });

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
              message: `${findingTitle(finding.ruleId)} (${finding.ruleId}): ${finding.message}`,
              severity: MARKER_SEVERITY[finding.severity],
            }))
      );
    }, ANALYSIS_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [source, editorReady]);

  const handleDemoChange = (id: string) => {
    const demo = DEMO_CONTRACTS.find((d) => d.id === id);
    if (!demo) return;
    setSelectedDemo(id);
    setInspected([]);
    setReviewOpen(false);
    setSource(demo.source);
    setMeasuredHot(null);
    const editor = editorRef.current;
    editor?.setScrollPosition({ scrollLeft: 0, scrollTop: 0 });
    // The new value lands on the next render; reset horizontal scroll again after it.
    requestAnimationFrame(() => editorRef.current?.setScrollPosition({ scrollLeft: 0, scrollTop: 0 }));
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
        options: { isWholeLine: true, className: "monadlens-line-highlight", linesDecorationsClassName: "monadlens-line-gutter" },
      },
    ]);
    highlightRef.current = collection;
    setTimeout(() => collection.clear(), 2500);
    // On narrow screens the editor sits above the results.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      editor.getContainerDomNode().scrollIntoView({ block: "center" });
    }
  };

  const applyFix = (candidate: FixCandidate) => {
    if (analysis?.source !== source || measuring) return;
    setReviewOpen(false);
    setSource(candidate.modified);
    measurePanelRef.current?.remeasureWithBaseline(candidate.modified);
    // After the dialog returns focus, move it to the measurement it started.
    setTimeout(() => measurePanelRef.current?.reveal(), 0);
  };

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setEditorReady(true);
  };
  const beforeMount: BeforeMount = (monaco) => defineMonadLensTheme(monaco);

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next: Tab = tab === "monad" ? "security" : "monad";
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const summary = parseError
    ? "Check contract syntax"
    : score === null
      ? "Analyzing…"
      : findings.length === 0
        ? "No issues detected"
        : SEVERITY_ORDER.flatMap((level) => {
            const count = findings.filter((f) => f.severity === level).length;
            return count ? [`${count} ${level}`] : [];
          }).join(" · ");

  const reviewDisabledReason = analyzing ? "Analyzing…" : null;

  return (
    <div className="workspace-shell" hidden={!active}>
      <header className="topbar">
        <button type="button" className="topbar-brand" onClick={onBackToIntro} aria-label="MonadLens, back to overview">
          <span className="wordmark-sm">
            Monad<span>Lens</span>
          </span>
        </button>
        <div role="group" aria-label="Demo contract" className="demo-chips">
          {DEMO_CONTRACTS.map((demo) => (
            <button
              key={demo.id}
              type="button"
              aria-pressed={selectedDemo === demo.id}
              onClick={() => handleDemoChange(demo.id)}
              title={demo.label}
            >
              {demo.id}
            </button>
          ))}
        </div>
        <Link href="/findings" className="topbar-link">
          Real-contract findings
        </Link>
      </header>

      <main className="workspace">
        <div className="workspace-intro">
          <button type="button" className="back-link" onClick={onBackToIntro}>
            <span aria-hidden="true">←</span> Overview
          </button>
          <h1 ref={headingRef} tabIndex={-1} className="workspace-title">
            Test your contract
          </h1>
          <p className="workspace-sub">Paste Solidity or pick a demo. Static analysis runs as you type.</p>
        </div>

        <div className="editor-panel">
          <div className="editor-heading">
            <span>Contract</span>
            <span className="mono">
              {selectedDemo}.sol{demoSource !== undefined && demoSource !== source ? " · edited" : ""}
            </span>
          </div>
          <div className="editor-host">
            <Editor
              height="100%"
              defaultLanguage="sol"
              theme={MONADLENS_THEME}
              beforeMount={beforeMount}
              value={source}
              onChange={(value) => setSource(value ?? "")}
              onMount={handleMount}
              loading={<p className="diff-loading">Loading editor…</p>}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineHeight: 21,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                padding: { top: 16, bottom: 16 },
                wordWrap: "off",
                renderLineHighlight: "line",
                scrollbar: { alwaysConsumeMouseWheel: false },
              }}
            />
          </div>
        </div>

        <div className="results-panel">
          <div role="tablist" aria-label="Analysis" className="tabs">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                ref={(el) => {
                  tabRefs.current[id] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-controls={`panel-${id}`}
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={onTabKey}
                className="tab"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Both tabs stay mounted so switching keeps measurement and scan results. */}
          <div role="tabpanel" id="panel-security" aria-labelledby="tab-security" hidden={tab !== "security"} className="tab-panel">
            <SecurityPanel source={source} monadFindings={findings} onRevealLine={revealLine} />
          </div>

          <div role="tabpanel" id="panel-monad" aria-labelledby="tab-monad" hidden={tab !== "monad"} className="tab-panel">
            <section className="block score-block" aria-labelledby="heuristic-heading">
              <div className="block-head">
                <h2 id="heuristic-heading" className="block-title">
                  Heuristic score
                </h2>
                <span className="tag tag-static">Static</span>
              </div>
              <div className="score-row">
                <div className="score-number">
                  {parseError || score === null ? "—" : score}
                  <span>/100</span>
                </div>
                <div className="score-side">
                  <p className="score-summary">{summary}</p>
                  <p className="block-hint">Estimated from static rules. Not a measurement.</p>
                </div>
              </div>
            </section>

            {parseError && (
              <div role="alert" className="notice notice-error">
                <div className="notice-title">
                  Syntax error{parseError.line ? ` · line ${parseError.line}` : ""}
                </div>
                <p className="notice-pre">{parseError.message}</p>
              </div>
            )}

            <MeasurePanel
              key={selectedDemo}
              ref={measurePanelRef}
              source={source}
              staticVariables={staticVariables}
              onRevealLine={revealLine}
              onMeasured={setMeasuredHot}
              onBusyChange={setMeasuring}
            />

            <section className="block findings-block" aria-labelledby="findings-heading">
              <div className="findings-head">
                <div className="block-head">
                  <h2 id="findings-heading" className="block-title">
                    Static findings
                  </h2>
                  {!analyzing && <span className="count-pill">{findings.length}</span>}
                </div>
                {fixPlan.candidates.length > 0 && (
                  <div className="fix-action">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setReviewOpen(true)}
                      disabled={Boolean(reviewDisabledReason)}
                      aria-describedby="fix-count"
                    >
                      Review fixes
                    </button>
                    <span id="fix-count" className="fix-count">
                      {fixPlan.candidates.length} supported fix{fixPlan.candidates.length === 1 ? "" : "es"} · covers{" "}
                      {coveredCount} finding{coveredCount === 1 ? "" : "s"}
                    </span>
                  </div>
                )}
              </div>

              {fixPlan.failed.length > 0 && (
                <p className="note note-warn" role="status">
                  A fix could not be applied to this code automatically for:{" "}
                  {fixPlan.failed.map((f) => `${findingTitle(f.ruleId)} (line ${f.line})`).join(", ")}. Fix it by hand,
                  following the finding&apos;s description.
                </p>
              )}

              {analyzing && <p role="status" className="empty">Analyzing…</p>}

              {findings.length === 0 && !parseError && !analyzing && <p className="empty">No findings.</p>}

              <div className="finding-list">
                {findings.map((finding, i) => {
                  const key = `${finding.ruleId}-${i}`;
                  const expanded = inspected.includes(key);
                  return (
                    <FindingCard
                      key={`${finding.ruleId}-${finding.line}-${i}`}
                      id={`finding-${i}`}
                      finding={finding}
                      expanded={expanded}
                      onToggle={() => setInspected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))}
                      onRevealLine={revealLine}
                      source={source}
                      aiEnabled={aiEnabled}
                      measuredHot={Boolean(finding.variable && measuredVariables.includes(finding.variable))}
                      fixFailed={fixPlan.failed.includes(finding)}
                    />
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </main>

      {reviewOpen && fixPlan.candidates.length > 0 && analysis && (
        <FixReviewDialog
          source={analysis.source}
          candidates={fixPlan.candidates}
          onApply={applyFix}
          onClose={() => setReviewOpen(false)}
          applyBlockedReason={measuring ? "Wait for the running measurement to finish." : analyzing ? "Analyzing…" : null}
        />
      )}
    </div>
  );
}
