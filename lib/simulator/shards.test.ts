import { describe, expect, it } from "vitest";
import { groupShardedSlots } from "./shards";

const slot = (i: number, label: string | undefined, writers: number, readers = writers) => ({
  slot: `0xabc:${i}`,
  label,
  readers,
  writers,
});

describe("groupShardedSlots", () => {
  it("groups array elements whose writes are spread across txs", () => {
    const hot = [
      ...Array.from({ length: 16 }, (_, i) => slot(i, `_shardCounts[${i}]`, 6)),
      ...Array.from({ length: 16 }, (_, i) => slot(16 + i, `_activeByShard[${i}]`, 6)),
      slot(99, "totalSupply", 100),
    ];
    const { shardGroups, rest } = groupShardedSlots(hot, 100);
    expect(shardGroups.map((g) => [g.variable, g.slotCount, g.maxWriters])).toEqual([
      ["_activeByShard", 16, 6],
      ["_shardCounts", 16, 6],
    ]);
    expect(rest.map((s) => s.label)).toEqual(["totalSupply"]);
  });

  it("keeps elements written by every tx out of the sharded group", () => {
    const hot = Array.from({ length: 4 }, (_, i) => slot(i, `counts[${i}]`, 100));
    const { shardGroups, rest } = groupShardedSlots(hot, 100);
    expect(shardGroups).toEqual([]);
    expect(rest).toHaveLength(4);
  });

  it("does not group a single hot element or plain variables", () => {
    const hot = [slot(0, "counts[3]", 40), slot(1, "total", 50), slot(2, undefined, 10)];
    const { shardGroups, rest } = groupShardedSlots(hot, 100);
    expect(shardGroups).toEqual([]);
    expect(rest).toHaveLength(3);
  });
});
