"use client";

import { DiffEditor } from "@monaco-editor/react";

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
  return (
    <section
      className="overflow-hidden rounded-lg border border-purple-500/20 bg-[#13111C]/80 backdrop-blur-md"
      aria-labelledby="diff-view-title"
    >
      <div className="border-b border-purple-500/20 px-4 py-3">
        <h2 id="diff-view-title" className="font-semibold text-zinc-100">
          {title}
        </h2>
        <div className="mt-1 grid grid-cols-2 gap-4 font-mono text-xs uppercase tracking-wide text-zinc-500">
          <span>Original</span>
          <span>Fixed</span>
        </div>
      </div>

      <DiffEditor
        height={height}
        original={original}
        modified={modified}
        language="sol"
        theme="vs-dark"
        loading={<p className="p-4 text-sm text-zinc-400">Loading diff editor…</p>}
        options={{
          automaticLayout: true,
          fontSize: 13,
          minimap: { enabled: false },
          originalEditable: false,
          readOnly: true,
          renderSideBySide: true,
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
