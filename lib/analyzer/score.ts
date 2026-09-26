import type { Finding, Severity } from "../types";

const SEVERITY_POINTS: Record<Severity, number> = {
  critical: 30,
  high: 20,
  medium: 10,
  info: 0,
  safe: 0,
};

/**
 * score = clamp(100 - Σ(points × weight), 0, 100), per CLAUDE.md §6.
 * Label this in the UI as "Heuristic Parallel Score" — it is not a
 * measured value; see lib/simulator for measured SimulationResult data.
 */
export function computeScore(findings: Finding[]): number {
  const penalty = findings.reduce(
    (sum, finding) => sum + SEVERITY_POINTS[finding.severity] * finding.reachabilityWeight,
    0
  );
  return Math.max(0, Math.min(100, 100 - penalty));
}
