import type { Finding } from "../types";
import { safeParse, type ParseError } from "./parse";
import { collectStateVariables } from "./symbols";
import { rules, type AnalysisContext } from "./rules";
import { computeScore } from "./score";
import { weightOf } from "./reachability";

export interface AnalysisResult {
  score: number;
  findings: Finding[];
  error: ParseError | null;
}

/**
 * Runs the full parser + rules + score pipeline (CLAUDE.md §18 Tier 1, item 1).
 * Never throws: parse failures come back as a structured `error`, per
 * the safe-parse contract in lib/analyzer/parse.ts.
 */
export function analyzeSolidityCode(source: string): AnalysisResult {
  const parsed = safeParse(source);
  if (!parsed.ok) {
    return { score: 0, findings: [], error: parsed.error };
  }

  const ctx: AnalysisContext = {
    ast: parsed.ast,
    source,
    symbols: collectStateVariables(parsed.ast),
  };

  const ownerGatedWeight = weightOf("owner-gated");
  const findings = rules
    .flatMap((rule) => rule.check(ctx))
    .filter(
      (finding) =>
        !(
          /^P[1-5]_/.test(finding.ruleId) && finding.reachabilityWeight === ownerGatedWeight
        )
    );
  findings.sort((a, b) => a.line - b.line || a.column - b.column);

  return { score: computeScore(findings), findings, error: null };
}

export { rules } from "./rules";
export type { Rule, AnalysisContext } from "./rules";
