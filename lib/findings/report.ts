/**
 * Shape of data/realworld-findings.json, written by scripts/realworld-check.ts
 * (--json) and rendered by app/findings/page.tsx (CLAUDE.md §17 Tier 2).
 */
import type { Finding } from "../types";
import type { MeasureResponse } from "../simulator/trace";
import { baseVariableName } from "../analyzer/locate";

export interface ReportFinding {
  ruleId: string;
  severity: Finding["severity"];
  line: number;
  variable?: string;
  functionName?: string;
  weight: number;
  message: string;
}

export interface ReportHotSlot {
  label: string;
  writers: number;
  readers: number;
  /** A static finding names this variable ("Predicted & measured"); false = "Not caught by static rules". */
  predicted: boolean;
}

export type ReportMeasurement =
  | {
      measured: true;
      target: string;
      txCount: number;
      revertedTxCount: number;
      reExecutionCount: number;
      criticalPathLength: number;
      idealParallelism: number;
      avgGasUsed: number;
      recommendedGasLimit: number;
      hotSlots: ReportHotSlot[];
      shardGroups: { variable: string; slotCount: number; maxWriters: number }[];
    }
  | { measured: false; target: string; reason: string };

export interface ReportContract {
  /** real: fixtures/realworld; synthetic: fixtures/realworld/synthetic; port: fixtures/measure (measurement-only). */
  group: "real" | "synthetic" | "port";
  file: string;
  sourceUrl?: string;
  ref?: string;
  license?: string;
  crashed: boolean;
  parseError: string | null;
  score?: number;
  findings: ReportFinding[];
  /** Absent when the run did not measure this contract. */
  measurement?: ReportMeasurement;
  /** How the measured call was set up, when it differs from the fixture (e.g. a mint harness). */
  measurementNote?: string;
}

export interface FindingsReport {
  generatedAt: string;
  measured: boolean;
  contracts: ReportContract[];
}

/** Source/Ref/License from a fixture's header comment (see fixtures/realworld/*.sol). */
export function fixtureHeader(source: string): { sourceUrl?: string; ref?: string; license?: string } {
  const field = (name: string) => source.match(new RegExp(`^// ${name}:\\s+(.+)$`, "m"))?.[1].trim();
  return { sourceUrl: field("Source"), ref: field("Ref"), license: field("License") };
}

export function toReportFindings(findings: readonly Finding[]): ReportFinding[] {
  return findings.map((f) => ({
    ruleId: f.ruleId,
    severity: f.severity,
    line: f.line,
    variable: f.variable,
    functionName: f.functionName,
    weight: f.reachabilityWeight,
    message: f.message,
  }));
}

export function toReportMeasurement(
  response: MeasureResponse,
  findings: readonly Finding[],
  fallbackTarget: string
): ReportMeasurement {
  const target = response.contractName
    ? `${response.contractName}.${response.calledFunction ?? fallbackTarget}`
    : fallbackTarget;
  const state = response.state;
  if (!state.measured) {
    // solc appends a long note to version errors; the first clause is the reason.
    return { measured: false, target, reason: state.reason.split("\n")[0].split(" - note that")[0] };
  }

  const staticVariables = new Set(findings.flatMap((f) => (f.variable ? [f.variable] : [])));
  return {
    measured: true,
    target,
    txCount: state.txCount,
    revertedTxCount: state.revertedTxCount,
    reExecutionCount: state.reExecutionCount,
    criticalPathLength: state.criticalPathLength,
    idealParallelism: state.idealParallelism,
    avgGasUsed: state.avgGasUsed,
    recommendedGasLimit: state.recommendedGasLimit,
    hotSlots: state.hotSlots.map((h) => ({
      label: h.label ?? h.slot,
      writers: h.writers,
      readers: h.readers,
      predicted: h.label !== undefined && staticVariables.has(baseVariableName(h.label)),
    })),
    shardGroups: state.shardGroups.map(({ variable, slotCount, maxWriters }) => ({ variable, slotCount, maxWriters })),
  };
}
