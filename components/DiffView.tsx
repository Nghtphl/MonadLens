"use client";

import { useEffect, useRef } from "react";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";

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
  return (
    <section
      className="shrink-0 overflow-hidden rounded-lg border border-purple-500/20 bg-[#13111C]/80 backdrop-blur-md"
      aria-labelledby="diff-view-title"
    >
      <div className="border-b border-purple-500/20 px-4 py-3">
        <h2 id="diff-view-title" className="text-2xl font-semibold text-zinc-100">
          {title}
        </h2>
        <div className="mt-1 grid grid-cols-2 gap-4 font-mono text-xs uppercase tracking-wide text-zinc-500">
          <span>Original</span>
          <span>Fixed</span>
        </div>
      </div>

      <DiffEditor
        keepCurrentOriginalModel
        keepCurrentModifiedModel
        onMount={(editor) => { models.current = editor.getModel(); }}
        height={height}
        original={original}
        modified={modified}
        language="sol"
        theme="vs-dark"
        loading={<p className="p-4 text-sm text-zinc-400">Loading diff editor…</p>}
        options={{
          automaticLayout: true,
          fontSize: 13,
          wordWrap: "on",
          minimap: { enabled: false },
          originalEditable: false,
          readOnly: true,
          renderSideBySide: true,
          useInlineViewWhenSpaceIsLimited: true,
          scrollBeyondLastLine: false,
        }}
      />

      <div className="border-t border-purple-500/20 p-4">
        <h3 className="text-sm font-semibold text-zinc-100">Trade-offs</h3>
        {tradeoffs.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
            {tradeoffs.map((tradeoff) => (
              <li key={tradeoff}>{tradeoff}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No trade-offs supplied.</p>
        )}
      </div>
    </section>
  );
}

export default DiffView;
