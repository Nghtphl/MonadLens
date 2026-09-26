"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { SimulationResultMeasured } from "@/lib/types";

export interface ReplayLane {
  title: string;
  result: SimulationResultMeasured;
}

// Animation pacing only; the UI never presents rounds as time.
const ROUND_INTERVAL_AT_1X = 120;
const SPEEDS = [0.5, 1, 2, 4] as const;

const COLORS = {
  pending: "#27272a",
  independent: "#34d399",
  conflicted: "#f87171",
};

function Lane({ lane, round }: { lane: ReplayLane; round: number }) {
  const { txLevels, dependsOn, criticalPathLength, txCount } = lane.result;
  const shownRound = Math.min(round, criticalPathLength);
  const executed = txLevels.filter((level) => level <= round).length;
  const done = round >= criticalPathLength;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate font-medium text-zinc-300">{lane.title}</span>
        <span className="shrink-0 font-mono text-zinc-400">
          round {shownRound} / {criticalPathLength}
          {done && round > 0 ? " ✓" : ""}
        </span>
      </div>
      <div className="grid grid-cols-10 gap-1">
        {txLevels.map((level, j) => {
          const conflicted = dependsOn[j].length > 0;
          const active = level === round;
          const color = level > round ? COLORS.pending : conflicted ? COLORS.conflicted : COLORS.independent;
          return (
            <motion.div
              key={j}
              title={`tx #${j} · dependency round ${level} · ${
                conflicted ? `reads slots written by ${dependsOn[j].length} earlier tx` : "no conflict"
              }`}
              className="aspect-square rounded-full"
              initial={false}
              animate={{ backgroundColor: color, scale: active ? 1.35 : 1, opacity: level < round ? 0.75 : 1 }}
              transition={{ duration: 0.15 }}
            />
          );
        })}
      </div>
      <div className="font-mono text-xs text-zinc-500">
        {executed}/{txCount} txs executed
      </div>
    </div>
  );
}

export default function BlockReplay({ lanes }: { lanes: ReplayLane[] }) {
  const maxRound = Math.max(...lanes.map((l) => l.result.criticalPathLength));
  const [round, setRound] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setRound((r) => {
        if (r + 1 >= maxRound) setPlaying(false);
        return Math.min(r + 1, maxRound);
      });
    }, ROUND_INTERVAL_AT_1X / speed);
    return () => clearInterval(id);
  }, [playing, speed, maxRound]);

  const togglePlay = () => {
    if (!playing && round >= maxRound) setRound(0);
    setPlaying((p) => !p);
  };

  return (
    <section className="flex flex-col gap-3 rounded border border-purple-500/20 bg-[#0B0B0E]/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Block replay</span>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={togglePlay}
            className="rounded border border-[#836EF9]/60 bg-[#836EF9]/15 px-3 py-1 text-zinc-100 transition-shadow hover:shadow-[0_0_12px_#836EF9]"
          >
            {playing ? "Pause" : round >= maxRound ? "Replay" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setRound(0);
            }}
            className="rounded border border-zinc-600 px-3 py-1 text-zinc-300 hover:bg-zinc-800"
          >
            Reset
          </button>
          <label className="flex items-center gap-1 text-zinc-400">
            Speed
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}
              className="rounded border border-purple-500/20 bg-[#0B0B0E] px-1 py-0.5 text-zinc-100"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="font-mono text-sm text-zinc-200">
        Dependency round {round} / {maxRound}
      </div>

      <div className={`grid gap-4 ${lanes.length > 1 ? "grid-cols-2" : "max-w-xs grid-cols-1"}`}>
        {lanes.map((lane) => (
          <Lane key={lane.title} lane={lane} round={round} />
        ))}
      </div>

      <p className="text-xs text-zinc-500">
        Each dot is one tx in block order. A round is one layer of the measured dependency graph (the OCC
        model&apos;s ideal schedule), not wall-clock time.{" "}
        <span style={{ color: COLORS.conflicted }}>Red</span>: reads a slot an earlier tx in the block wrote, so
        it would be re-executed. <span style={{ color: COLORS.independent }}>Green</span>: no conflict.
      </p>
    </section>
  );
}
