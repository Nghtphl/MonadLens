import { describe, expect, it } from "vitest";
import { simulateOcc, type TxAccessSet } from "./occ";

const C = "0xc0ffee";
const slot = (n: number | string) => `${C}:${n}`;

describe("simulateOcc", () => {
  it("fully serial: every tx reads and writes one global counter", () => {
    const txs: TxAccessSet[] = Array.from({ length: 100 }, () => ({
      reads: [slot("totalSupply")],
      writes: [slot("totalSupply")],
    }));

    const r = simulateOcc(txs);
    expect(r.txCount).toBe(100);
    expect(r.criticalPathLength).toBe(100);
    expect(r.reExecutionCount).toBe(99);
    expect(r.idealParallelism).toBe(1);
    expect(r.hotSlots).toEqual([{ slot: slot("totalSupply"), readers: 100, writers: 100 }]);
  });

  it("fully parallel: every tx touches only its own slot", () => {
    const txs: TxAccessSet[] = Array.from({ length: 100 }, (_, i) => ({
      reads: [slot(`balance:${i}`)],
      writes: [slot(`balance:${i}`)],
    }));

    const r = simulateOcc(txs);
    expect(r.criticalPathLength).toBe(1);
    expect(r.reExecutionCount).toBe(0);
    expect(r.idealParallelism).toBe(100);
    expect(r.hotSlots).toEqual([]);
  });

  it("16 shards: 64 txs round-robin -> 16 independent chains of length 4", () => {
    const txs: TxAccessSet[] = Array.from({ length: 64 }, (_, i) => ({
      reads: [slot(`shard:${i % 16}`)],
      writes: [slot(`shard:${i % 16}`)],
    }));

    const r = simulateOcc(txs);
    expect(r.criticalPathLength).toBe(4);
    expect(r.levels.slice(0, 17)).toEqual([...Array(16).fill(1), 2]);
    expect(r.reExecutionCount).toBe(48); // all but the first tx on each shard
    expect(r.idealParallelism).toBe(16);
    expect(r.hotSlots).toHaveLength(16);
    expect(r.hotSlots.every((s) => s.writers === 4 && s.readers === 4)).toBe(true);
  });

  it("16 shards with uneven hashing: critical path follows the busiest shard", () => {
    // Shard 3 gets 10 txs, the other 15 shards get 2 each (40 txs total).
    const shardOf = [...Array(10).fill(3), ...Array.from({ length: 30 }, (_, i) => [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15][i % 15])];
    const txs: TxAccessSet[] = shardOf.map((s) => ({ reads: [slot(`shard:${s}`)], writes: [slot(`shard:${s}`)] }));

    const r = simulateOcc(txs);
    expect(r.txCount).toBe(40);
    expect(r.criticalPathLength).toBe(10);
    expect(r.idealParallelism).toBe(4);
  });

  it("shared read-only slot (e.g. `paused`) does not create a dependency", () => {
    const txs: TxAccessSet[] = Array.from({ length: 10 }, (_, i) => ({
      reads: [slot("paused"), slot(`balance:${i}`)],
      writes: [slot(`balance:${i}`)],
    }));

    const r = simulateOcc(txs);
    expect(r.criticalPathLength).toBe(1);
    expect(r.reExecutionCount).toBe(0);
    expect(r.hotSlots).toEqual([]);
  });

  it("dependencies chain transitively into the critical path", () => {
    // tx0 writes A; tx1 reads A, writes B; tx2 reads B. tx2 never touches A.
    const txs: TxAccessSet[] = [
      { reads: [], writes: [slot("A")] },
      { reads: [slot("A")], writes: [slot("B")] },
      { reads: [slot("B")], writes: [] },
    ];

    const r = simulateOcc(txs);
    expect(r.dependsOn).toEqual([[], [0], [1]]);
    expect(r.levels).toEqual([1, 2, 3]);
    expect(r.criticalPathLength).toBe(3);
    expect(r.reExecutionCount).toBe(2);
  });

  it("an earlier reader does not depend on a later writer (block order matters)", () => {
    const txs: TxAccessSet[] = [
      { reads: [slot("A")], writes: [] },
      { reads: [], writes: [slot("A")] },
    ];

    const r = simulateOcc(txs);
    expect(r.dependsOn).toEqual([[], []]);
    expect(r.criticalPathLength).toBe(1);
  });

  it("empty block", () => {
    const r = simulateOcc([]);
    expect(r).toMatchObject({ txCount: 0, reExecutionCount: 0, criticalPathLength: 0, idealParallelism: 0 });
  });
});
