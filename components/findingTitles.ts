import type { Finding, Severity } from "@/lib/types";

/**
 * Human-readable names for rule ids. The technical ruleId stays visible in
 * "Inspect"; this map only changes what the closed card shows.
 */
const TITLES: Record<string, string> = {
  P1_GLOBAL_COUNTER: "Shared counter contention",
  P2_ARRAY_PUSH: "Shared array write contention",
  P3_GLOBAL_ACCUMULATOR: "Shared total contention",
  P4_HOT_CONSTANT_KEY: "Fixed-key mapping write contention",
  P5_GLOBAL_QUOTA: "Shared quota contention",
  P6_PACKED_SHARDS: "Packed shard slots",
  P7_WRITE_PATH_READS_ALL_SHARDS: "Write path reads every shard",
  P8_INHERENT: "Expected pool contention",
  M1_BLOCK_TIME_ASSUMPTION: "Block-time assumption mismatch",
  M2_TIMESTAMP_UNIQUENESS: "Timestamp used as a unique value",
  M3_GAS_LIMIT_BILLING: "Gas limit billing",
  M4_CONTRACT_SIZE: "Contract split for size limit",
  M5_COLD_ACCESS_LOOPS: "Cold storage access in a loop",
  C1_REENTRANCY_GUARD: "Reentrancy guard storage writes",
};

/** Readable title for a rule id; unknown ids (e.g. Slither detectors) are humanized. */
export function findingTitle(ruleId: string): string {
  const known = TITLES[ruleId];
  if (known) return known;
  const words = ruleId
    .replace(/^[A-Z]{1,2}\d+_/, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase();
  if (!words) return "Unnamed finding";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  info: "Info",
  safe: "Safe",
};

/** Contention that is inherent to the design (CLAUDE.md §5 P8): never offer a fix. */
export function isExpectedByDesign(finding: Finding): boolean {
  return finding.ruleId === "P8_INHERENT";
}
