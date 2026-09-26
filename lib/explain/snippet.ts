// Client-safe (no Node APIs): the page builds the snippet it sends to /api/explain.

/** Lines `line - radius` .. `line + radius` (1-based), each prefixed with its number. */
export function snippetAround(source: string, line: number, radius = 10): string {
  const lines = source.split("\n");
  const from = Math.max(1, line - radius);
  const to = Math.min(lines.length, line + radius);
  const out: string[] = [];
  for (let n = from; n <= to; n++) out.push(`${String(n).padStart(4)}| ${lines[n - 1]}`);
  return out.join("\n");
}
