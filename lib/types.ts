export type Severity = "critical" | "high" | "medium" | "info" | "safe";
export type FindingSource = "monadlens" | "slither";

export interface Finding {
  source?: FindingSource; // absent means 'monadlens'
  ruleId: string; // e.g. 'P1_GLOBAL_COUNTER'
  severity: Severity;
  line: number;
  column: number;
  variable?: string;
  functionName?: string;
  reachabilityWeight: number; // 0..1, see CLAUDE.md §6
  conflictNote: string; // e.g. 'Read-write conflict on slot of `totalSupply`'
  message: string;
  fixTemplateId?: string; // absent for inherent contention (P8)
  tradeoffs?: string[]; // REQUIRED when fixTemplateId is set
}

export interface SimulationResultMeasured {
  measured: true;
  txCount: number;
  revertedTxCount: number; // > txCount / 2 is reported as unmeasured instead
  reExecutionCount: number;
  criticalPathLength: number;
  idealParallelism: number; // txCount / criticalPathLength (upper bound)
  avgGasUsed: number;
  recommendedGasLimit: number; // Monad bills gas LIMIT, see CLAUDE.md §9
  hotSlots: { slot: string; label?: string; readers: number; writers: number }[];
  /** Shard arrays whose hot element slots are written by different txs (expected after sharding). */
  shardGroups: { variable: string; slotCount: number; totalWriters: number; maxWriters: number }[];
  /** Block-order dependency graph: dependsOn[j] = earlier txs whose writes tx j read. */
  dependsOn: number[][];
  /** 1-based dependency round per tx (DAG depth); max = criticalPathLength. */
  txLevels: number[];
}

export interface SimulationResultUnmeasured {
  measured: false;
  reason: string;
}

export type SimulationState = SimulationResultMeasured | SimulationResultUnmeasured;
