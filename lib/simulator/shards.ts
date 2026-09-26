export interface LabeledHotSlot {
  slot: string;
  label?: string;
  readers: number;
  writers: number;
}

export interface ShardGroup {
  /** Array variable whose elements are the shards, e.g. `_shardCounts`. */
  variable: string;
  /** Number of distinct element slots of this variable that were hot in the block. */
  slotCount: number;
  /** Sum of writers over those slots. */
  totalWriters: number;
  /** Most writers any single slot of the group had. */
  maxWriters: number;
}

/**
 * Splits hot slots into sharded groups and the rest. Pure.
 *
 * A group is "sharded" when at least two element slots of the same fixed array
 * (labels like `x[3]`) are hot AND no single slot is written by every
 * successful tx, i.e. writes are spread across the slots instead of each tx
 * touching all of them. That residual contention is the expected cost of
 * sharding, not a missed finding. If every tx writes every element (e.g. a
 * write path that loops over all shards), the slots stay in `rest`.
 */
export function groupShardedSlots<T extends LabeledHotSlot>(
  hotSlots: T[],
  successfulTxCount: number
): { shardGroups: ShardGroup[]; rest: T[] } {
  const byVariable = new Map<string, T[]>();
  for (const slot of hotSlots) {
    if (!slot.label || !/\[\d+\]$/.test(slot.label)) continue;
    const variable = slot.label.replace(/\[\d+\]$/, "");
    if (!byVariable.has(variable)) byVariable.set(variable, []);
    byVariable.get(variable)!.push(slot);
  }

  const sharded = new Set<string>();
  const shardGroups: ShardGroup[] = [];
  for (const [variable, slots] of byVariable) {
    if (slots.length < 2) continue;
    const maxWriters = Math.max(...slots.map((s) => s.writers));
    if (maxWriters === 0 || maxWriters >= successfulTxCount) continue;
    shardGroups.push({
      variable,
      slotCount: slots.length,
      totalWriters: slots.reduce((sum, s) => sum + s.writers, 0),
      maxWriters,
    });
    for (const s of slots) sharded.add(s.slot);
  }

  shardGroups.sort((a, b) => b.totalWriters - a.totalWriters || a.variable.localeCompare(b.variable));
  return { shardGroups, rest: hotSlots.filter((s) => !sharded.has(s.slot)) };
}
