"use client";

import type { Finding } from "@/lib/types";
import FindingExplanation from "./FindingExplanation";
import { findingTitle, isExpectedByDesign, SEVERITY_LABEL } from "./findingTitles";

export interface FindingCardProps {
  finding: Finding;
  id: string;
  expanded: boolean;
  onToggle(): void;
  onRevealLine(line: number): void;
  source: string;
  aiEnabled: boolean;
  /** The finding's variable was a hot slot in the latest measurement of this code. */
  measuredHot: boolean;
  /** Its fix template exists but could not be applied to this code. */
  fixFailed: boolean;
}

export function LineButton({ line, onRevealLine }: { line: number; onRevealLine(line: number): void }) {
  return (
    <button
      type="button"
      className="line-button"
      onClick={() => onRevealLine(line)}
      aria-label={`Line ${line}: show in editor`}
      title="Show this line in the editor"
    >
      <span className="line-button-label">Line</span>
      <span className="line-button-number">{line}</span>
    </button>
  );
}

export default function FindingCard({
  finding,
  id,
  expanded,
  onToggle,
  onRevealLine,
  source,
  aiEnabled,
  measuredHot,
  fixFailed,
}: FindingCardProps) {
  const titleId = `${id}-title`;
  const panelId = `${id}-panel`;
  const expected = isExpectedByDesign(finding);

  return (
    <article className="finding-card" data-severity={finding.severity} aria-labelledby={titleId}>
      <div className="finding-top">
        <span className={`sev sev-${finding.severity}`}>{SEVERITY_LABEL[finding.severity]}</span>
        <LineButton line={finding.line} onRevealLine={onRevealLine} />
      </div>
      <h3 id={titleId} className="finding-title">
        {findingTitle(finding.ruleId)}
      </h3>
      <button type="button" className="inspect-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
        Inspect
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div id={panelId} className="finding-inspection">
          <dl className="meta-grid">
            <div>
              <dt>Rule ID</dt>
              <dd className="mono">{finding.ruleId}</dd>
            </div>
            {finding.functionName && (
              <div>
                <dt>Function</dt>
                <dd className="mono">{finding.functionName}</dd>
              </div>
            )}
            {finding.variable && (
              <div>
                <dt>Variable</dt>
                <dd className="mono">{finding.variable}</dd>
              </div>
            )}
          </dl>
          <p className="finding-message">{finding.message}</p>
          <p className="finding-conflict">{finding.conflictNote}</p>

          {expected && (
            <p className="note note-expected">
              Expected by design: this contention comes from state every caller must share. MonadLens does not offer a
              fix for it.
            </p>
          )}

          {measuredHot && (
            <p className="measured-relation">
              <span className="tag tag-measured">Predicted &amp; measured</span>
              <span>
                <code>{finding.variable}</code> was a hot slot in the block measured for this code.
              </span>
            </p>
          )}

          <FindingExplanation
            finding={finding}
            source={source}
            aiEnabled={aiEnabled}
            measured={measuredHot ? `"${finding.variable}" was a hot slot in the block MonadLens measured for this code.` : undefined}
          />

          {finding.tradeoffs?.length ? (
            <div className="tradeoffs-inline">
              <h4>Fix trade-offs</h4>
              <ul>
                {finding.tradeoffs.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {fixFailed && (
            <div role="alert" className="note note-warn">
              This fix could not be applied to this code automatically. Fix it by hand, following the finding&apos;s
              description above.
            </div>
          )}
        </div>
      )}
    </article>
  );
}
