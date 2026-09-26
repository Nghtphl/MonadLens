import type { Finding } from "../types";

/** MonadLens owns a line when both analyzers report it. */
export function deduplicateSecurityFindings(
  monadFindings: readonly Finding[],
  slitherFindings: readonly Finding[]
): Finding[] {
  const monadLines = new Set(
    monadFindings
      .filter((finding) => finding.source === undefined || finding.source === "monadlens")
      .map((finding) => finding.line)
  );
  return [
    ...monadFindings,
    ...slitherFindings.filter((finding) => !monadLines.has(finding.line)),
  ];
}

export function removeSlitherDuplicates(
  monadFindings: readonly Finding[],
  slitherFindings: readonly Finding[]
): Finding[] {
  return deduplicateSecurityFindings(monadFindings, slitherFindings).filter(
    (finding) => finding.source === "slither"
  );
}
