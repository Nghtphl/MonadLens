"use client";

import { useEffect, useRef } from "react";
import { DiffEditor, type DiffOnMount, type DiffBeforeMount } from "@monaco-editor/react";
import { defineMonadLensTheme, MONADLENS_THEME } from "./editorTheme";

export interface DiffViewProps {
  original: string;
  modified: string;
  tradeoffs: readonly string[];
  title?: string;
  height?: number | string;
}

export function DiffView({
  original,
  modified,
  tradeoffs,
  title = "Suggested fix",
  height = "60vh",
}: DiffViewProps) {
  const models = useRef<ReturnType<Parameters<DiffOnMount>[0]["getModel"]>>(null);
  useEffect(() => () => {
    const owned = models.current;
    // Let the editor detach first; disposing attached models crashes Monaco.
    setTimeout(() => {
      if (owned && !owned.original.isDisposed()) owned.original.dispose();
      if (owned && !owned.modified.isDisposed()) owned.modified.dispose();
    }, 0);
  }, []);
  const beforeMount: DiffBeforeMount = (monaco) => defineMonadLensTheme(monaco);

  return (
    <section className="diff-view" aria-labelledby="diff-view-title">
      <div className="diff-view-head">
        <h3 id="diff-view-title">{title}</h3>
        <div className="diff-view-cols" aria-hidden="true">
          <span>Original</span>
          <span>Suggested</span>
        </div>
      </div>

      <div className="diff-view-editor">
        <DiffEditor
          keepCurrentOriginalModel
          keepCurrentModifiedModel
          beforeMount={beforeMount}
          onMount={(editor) => {
            models.current = editor.getModel();
          }}
          height={height}
          original={original}
          modified={modified}
          language="sol"
          theme={MONADLENS_THEME}
          loading={<p className="diff-loading">Loading diff…</p>}
          options={{
            automaticLayout: true,
            fontSize: 13,
            wordWrap: "off",
            minimap: { enabled: false },
            originalEditable: false,
            readOnly: true,
            renderSideBySide: true,
            useInlineViewWhenSpaceIsLimited: true,
            scrollBeyondLastLine: false,
          }}
        />
      </div>

      <div className="diff-view-tradeoffs">
        <h4>Trade-offs</h4>
        {tradeoffs.length > 0 ? (
          <ul>
            {tradeoffs.map((tradeoff) => (
              <li key={tradeoff}>{tradeoff}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No trade-offs supplied.</p>
        )}
      </div>
    </section>
  );
}

export default DiffView;
