import { analyzeSolidityCode } from "@/lib/analyzer";
import { getFixTemplate, type FixTemplate } from "@/lib/fixer/templates";
import type { Finding } from "@/lib/types";
import { isExpectedByDesign } from "./findingTitles";

/**
 * One applicable fix: the edit an existing template produces for the current
 * source. Several findings can lead to the same edit (e.g. two writes to the
 * same counter); they are grouped, never merged across different templates.
 */
export interface FixCandidate {
  key: string;
  template: FixTemplate;
  modified: string;
  /** Findings this edit addresses (triggered it, or disappear after it in static re-analysis). */
  covers: Finding[];
  /** Of `covers`, findings static analysis still reports after the edit. */
  remaining: Finding[];
  /** Findings that appear only after the edit. */
  introduced: Finding[];
}

export interface FixPlan {
  candidates: FixCandidate[];
  /** Findings with a fix template that could not be applied to this code. */
  failed: Finding[];
}

const keyOf = (f: Finding) => `${f.ruleId}|${f.variable ?? ""}|${f.functionName ?? ""}`;

/**
 * Uses the templates in lib/fixer as they are (no rewriting): tries each
 * template for each finding that names one, then re-runs the static analyzer
 * on the result to report honestly what the edit resolves.
 */
export function planFixes(source: string, findings: readonly Finding[]): FixPlan {
  const fixable = findings.filter((f) => f.fixTemplateId && !isExpectedByDesign(f));
  const groups = new Map<string, { template: FixTemplate; modified: string; triggers: Finding[] }>();
  const failedAttempts: Finding[] = [];

  for (const finding of fixable) {
    const template = getFixTemplate(finding.fixTemplateId!);
    if (!template) continue; // no template shipped for this id: not a supported fix
    let modified: string;
    try {
      modified = template.apply(source, { variable: finding.variable, functionName: finding.functionName });
    } catch {
      failedAttempts.push(finding);
      continue;
    }
    if (modified === source) {
      failedAttempts.push(finding);
      continue;
    }
    const key = `${template.id}\n${modified}`;
    const group = groups.get(key);
    if (group) group.triggers.push(finding);
    else groups.set(key, { template, modified, triggers: [finding] });
  }

  const candidates: FixCandidate[] = [];
  const coveredKeys = new Set<string>();
  for (const [key, group] of groups) {
    const after = analyzeSolidityCode(group.modified);
    // An edit that breaks parsing is not offered.
    if (after.error) {
      failedAttempts.push(...group.triggers);
      continue;
    }
    const afterKeys = new Set(after.findings.map(keyOf));
    const beforeKeys = new Set(findings.map(keyOf));
    const resolvedFailed = failedAttempts.filter((f) => !afterKeys.has(keyOf(f)));
    const covers = [...group.triggers, ...resolvedFailed.filter((f) => !group.triggers.includes(f))];
    covers.forEach((f) => coveredKeys.add(keyOf(f)));
    candidates.push({
      key,
      template: group.template,
      modified: group.modified,
      covers,
      remaining: covers.filter((f) => afterKeys.has(keyOf(f))),
      introduced: after.findings.filter((f) => !beforeKeys.has(keyOf(f))),
    });
  }

  return {
    candidates,
    failed: failedAttempts.filter((f) => !coveredKeys.has(keyOf(f))),
  };
}
