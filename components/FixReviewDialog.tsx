"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import DiffView from "./DiffView";
import type { FixCandidate } from "./fixPlan";
import { findingTitle } from "./findingTitles";

const FOCUSABLE =
  'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface FixReviewDialogProps {
  source: string;
  candidates: FixCandidate[];
  onApply(candidate: FixCandidate): void;
  onClose(): void;
  /** Why Apply is unavailable right now (e.g. a measurement is running), if it is. */
  applyBlockedReason?: string | null;
}

/**
 * One review window for every supported fix. Fixes are applied one at a
 * time: templates are never merged blindly, and the remaining fixes are
 * recomputed against the new code after each apply.
 */
export default function FixReviewDialog({ source, candidates, onApply, onClose, applyBlockedReason }: FixReviewDialogProps) {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const candidate = candidates[Math.min(index, candidates.length - 1)];

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === titleRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!candidate) return null;

  return (
    <div className="dialog-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fix-dialog-title"
        aria-describedby="fix-dialog-desc"
        className="dialog"
        onKeyDown={onKeyDown}
      >
        <header className="dialog-head">
          <div>
            <h2 id="fix-dialog-title" ref={titleRef} tabIndex={-1}>
              Review fixes
            </h2>
            <p id="fix-dialog-desc" className="dialog-sub">
              {candidates.length > 1
                ? `Fix ${index + 1} of ${candidates.length}. Fixes are applied one at a time; the rest are recomputed against the new code.`
                : "Review the suggested change and its costs before applying it."}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="dialog-body">
          {candidates.length > 1 && (
            <div role="group" aria-label="Supported fixes" className="fix-steps">
              {candidates.map((c, i) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={i === index}
                  onClick={() => setIndex(i)}
                  className="fix-step"
                >
                  <span className="fix-step-n">{i + 1}</span>
                  {c.template.title}
                </button>
              ))}
            </div>
          )}

          <div className="fix-covers">
            <span className="block-label-text">Covers</span>
            <ul>
              {candidate.covers.map((f, i) => (
                <li key={`${f.ruleId}-${f.line}-${i}`}>
                  <span>{findingTitle(f.ruleId)}</span>
                  <span className="mono muted">line {f.line}</span>
                </li>
              ))}
            </ul>
            {candidate.remaining.length > 0 && (
              <p className="note note-warn">
                Static analysis still reports {candidate.remaining.map((f) => findingTitle(f.ruleId)).join(", ")} after this
                change.
              </p>
            )}
            {candidate.introduced.length > 0 && (
              <p className="note note-warn">
                New after this change: {candidate.introduced.map((f) => `${findingTitle(f.ruleId)} (line ${f.line})`).join(", ")}.
              </p>
            )}
          </div>

          <DiffView
            key={candidate.key}
            original={source}
            modified={candidate.modified}
            tradeoffs={candidate.template.tradeoffs}
            title={candidate.template.title}
            height="min(52vh, 560px)"
          />
        </div>

        <footer className="dialog-foot">
          {applyBlockedReason && <span className="dialog-foot-note">{applyBlockedReason}</span>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => onApply(candidate)}
            disabled={Boolean(applyBlockedReason)}
          >
            Apply &amp; re-measure
          </button>
        </footer>
      </div>
    </div>
  );
}
