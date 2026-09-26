export interface SourceEdit {
  start: number;
  end: number;
  text: string;
}

/** Applies non-overlapping, half-open source edits without reformatting untouched code. */
export function applySourceEdits(source: string, edits: SourceEdit[]): string {
  const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let previousStart = source.length;
  let result = source;

  for (const edit of ordered) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > source.length) {
      throw new Error(`Invalid source edit range: ${edit.start}..${edit.end}`);
    }
    if (edit.end > previousStart) {
      throw new Error(`Overlapping source edits near offset ${edit.start}`);
    }
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    previousStart = edit.start;
  }

  return result;
}

export function indentationAt(source: string, offset: number): string {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  return source.slice(lineStart, offset).match(/^\s*/)?.[0] ?? "";
}
