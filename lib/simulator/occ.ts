// Pure OCC (optimistic concurrency control) model per CLAUDE.md §7. No I/O.

export interface TxAccessSet {
  /** Storage keys read, e.g. `${contractAddress}:${slot}`. */
  reads: string[];
  /** Storage keys whose value changed. */
  writes: string[];
}

export interface HotSlot {
  slot: string;
  readers: number;
  writers: number;
}

export interface OccResult {
  txCount: number;
  reExecutionCount: number;
  criticalPathLength: number;
  idealParallelism: number;
  /** dependsOn[j] = indices i < j whose writes intersect tx j's reads. */
  dependsOn: number[][];
  /** levels[j] = 1-based dependency round of tx j (its depth in the DAG). */
  levels: number[];
  hotSlots: HotSlot[];
}

/**
 * Txs are in block order. Tx j depends on tx i (i < j) iff
 * reads(j) ∩ writes(i) ≠ ∅. Critical path = longest dependency chain,
 * counted in txs.
 */
export function simulateOcc(txs: TxAccessSet[]): OccResult {
  const writersBySlot = new Map<string, number[]>();
  const readersBySlot = new Map<string, Set<number>>();
  const dependsOn: number[][] = [];
  const depth: number[] = [];

  txs.forEach((tx, j) => {
    const deps = new Set<number>();
    for (const slot of tx.reads) {
      for (const i of writersBySlot.get(slot) ?? []) deps.add(i);
      if (!readersBySlot.has(slot)) readersBySlot.set(slot, new Set());
      readersBySlot.get(slot)!.add(j);
    }

    const sortedDeps = Array.from(deps).sort((a, b) => a - b);
    dependsOn.push(sortedDeps);
    depth.push(1 + Math.max(0, ...sortedDeps.map((i) => depth[i])));

    // Register writes after computing deps so a tx never depends on itself.
    for (const slot of new Set(tx.writes)) {
      if (!writersBySlot.has(slot)) writersBySlot.set(slot, []);
      writersBySlot.get(slot)!.push(j);
    }
  });

  const txCount = txs.length;
  const criticalPathLength = txCount === 0 ? 0 : Math.max(...depth);

  const hotSlots: HotSlot[] = [];
  for (const [slot, writers] of writersBySlot) {
    const readers = readersBySlot.get(slot)?.size ?? 0;
    // A slot is "hot" only if it can actually cause a conflict: written by
    // one tx and touched by at least one other.
    const touchers = new Set([...writers, ...(readersBySlot.get(slot) ?? [])]);
    if (touchers.size > 1) {
      hotSlots.push({ slot, readers, writers: writers.length });
    }
  }
  hotSlots.sort((a, b) => b.writers + b.readers - (a.writers + a.readers) || a.slot.localeCompare(b.slot));

  return {
    txCount,
    reExecutionCount: dependsOn.filter((deps) => deps.length > 0).length,
    criticalPathLength,
    idealParallelism: criticalPathLength === 0 ? 0 : txCount / criticalPathLength,
    dependsOn,
    levels: depth,
    hotSlots,
  };
}
