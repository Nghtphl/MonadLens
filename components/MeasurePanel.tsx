"use client";

import { useImperativeHandle, useMemo, useState, type Ref } from "react";
import type { MeasureResponse } from "@/lib/simulator/trace";
import type { SimulationResultMeasured } from "@/lib/types";
import BlockReplay from "./BlockReplay";
import { baseVariableName, locateVariable } from "@/lib/analyzer/locate";
import {
  type CallableFn,
  listCallableFunctions,
  pickDefaultFunction,
  signatureOf,
  SUPPORTED_ARGS_TEXT,
  unsupportedTypes,
} from "@/lib/simulator/targets";

const TX_COUNT = 100;

function shortSlot(key: string): string {
  const slot = key.split(":")[1] ?? key;
  return `slot 0x${BigInt(slot).toString(16)}`;
}

export interface MeasuredHotVariables {
  source: string;
  variables: string[];
}

type HotSlot = SimulationResultMeasured["hotSlots"][number];

function HotSlotRow({
  slot,
  txCount,
  line,
  onRevealLine,
}: {
  slot: HotSlot;
  txCount: number;
  line: number | null;
  onRevealLine?: (line: number) => void;
}) {
  const text = (
    <>
      <span className="text-zinc-100">{slot.label ? `\`${slot.label}\`` : "unknown variable"}</span>{" "}
      <span className="text-zinc-500">({shortSlot(slot.slot)})</span>: {slot.writers} of {txCount} txs write
      {slot.readers !== slot.writers ? `, ${slot.readers} read` : ""}
      {line !== null && <span className="text-[#a996ff]"> → line {line}</span>}
    </>
  );
  return (
    <li>
      {line !== null && onRevealLine ? (
        <button
          type="button"
          onClick={() => onRevealLine(line)}
          className="w-full rounded px-1 py-0.5 text-left text-zinc-300 hover:bg-[#836EF9]/15"
          title="Highlight this line in the editor"
        >
          {text}
        </button>
      ) : (
        <div className="px-1 py-0.5 text-zinc-300">{text}</div>
      )}
    </li>
  );
}

type ShardGroup = SimulationResultMeasured["shardGroups"][number];

function ShardGroupRow({
  group,
  txCount,
  line,
  onRevealLine,
}: {
  group: ShardGroup;
  txCount: number;
  line: number | null;
  onRevealLine?: (line: number) => void;
}) {
  const text = (
    <>
      <span className="text-zinc-100">`{group.variable}`</span>: contention split across {group.slotCount} slots
      (expected) · at most {group.maxWriters} of {txCount} txs write the same slot
      {line !== null && <span className="text-[#a996ff]"> → line {line}</span>}
    </>
  );
  return (
    <li>
      {line !== null && onRevealLine ? (
        <button
          type="button"
          onClick={() => onRevealLine(line)}
          className="w-full rounded px-1 py-0.5 text-left text-zinc-300 hover:bg-[#836EF9]/15"
          title="Highlight this line in the editor"
        >
          {text}
        </button>
      ) : (
        <div className="px-1 py-0.5 text-zinc-300">{text}</div>
      )}
    </li>
  );
}

function Metric({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="rounded border border-purple-500/20 bg-[#0B0B0E]/60 p-3">
      <div className="text-[10px] sm:text-xs uppercase tracking-wide text-zinc-400 break-words">{label}</div>
      <div className="mt-2 font-mono text-3xl font-semibold text-zinc-100" data-testid={testId}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

function BeforeAfter({ before, after }: { before: SimulationResultMeasured; after: SimulationResultMeasured }) {
  const rows: [string, string, string][] = [
    ["Critical path", String(before.criticalPathLength), String(after.criticalPathLength)],
    ["Re-executions", String(before.reExecutionCount), String(after.reExecutionCount)],
    ["Ideal parallelism", `${before.idealParallelism.toFixed(1)}×`, `${after.idealParallelism.toFixed(1)}×`],
    ["Avg gas used", before.avgGasUsed.toLocaleString(), after.avgGasUsed.toLocaleString()],
  ];
  return (
    <div className="rounded border border-[#836EF9]/40 bg-[#836EF9]/5 p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-zinc-400">
        Before fix → after fix ({after.txCount} txs each)
      </div>
      <div className="mb-4 text-3xl font-semibold tracking-tight sm:text-4xl">Critical path <span className="text-zinc-400">{before.criticalPathLength}</span> <span className="text-[#a996ff]">→ {after.criticalPathLength}</span></div>
      <table className="w-full font-mono text-sm">
        <tbody>
          {rows.map(([label, b, a]) => (
            <tr key={label} data-testid={`before-after-${label.toLowerCase().replace(/ /g, "-")}`}>
              <td className="py-0.5 font-sans text-xs text-zinc-500">{label}</td>
              <td className="py-0.5 text-right text-zinc-400" data-testid="before">
                {b}
              </td>
              <td className="px-2 py-0.5 text-center text-zinc-600">→</td>
              <td className="py-0.5 text-right text-zinc-100" data-testid="after">
                {a}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface MeasurePanelHandle {
  /** Keeps the current result as "before" and measures `newSource` (e.g. after applying a fix). */
  remeasureWithBaseline(newSource: string): void;
}

export default function MeasurePanel({
  source,
  ref,
  staticVariables = [],
  onRevealLine,
  onMeasured,
}: {
  source: string;
  ref?: Ref<MeasurePanelHandle>;
  /** Variables named by the current static findings. */
  staticVariables?: string[];
  onRevealLine?: (line: number) => void;
  onMeasured?: (hot: MeasuredHotVariables | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MeasureResponse | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [measuredKey, setMeasuredKey] = useState<string | null>(null);
  const [chosenSig, setChosenSig] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<MeasureResponse | null>(null);

  const fns = useMemo(() => listCallableFunctions(source), [source]);
  const selectFor = (fnList: CallableFn[]) =>
    fnList.find((f) => signatureOf(f) === chosenSig) ?? pickDefaultFunction(fnList);
  const defaultFn = useMemo(() => pickDefaultFunction(fns), [fns]);
  const selected = selectFor(fns);
  const keyOf = (fn: CallableFn | null, src: string) => `${fn ? signatureOf(fn) : "auto"}\n${src}`;
  const requestKey = keyOf(selected, source);

  const measure = async (src: string = source) => {
    const fn = src === source ? selected : selectFor(listCallableFunctions(src));
    setLoading(true);
    setRequestError(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: src, txCount: TX_COUNT, functionName: fn?.name }),
      });
      const body = await res.json();
      if (!res.ok) {
        setRequestError(body.error ?? `Request failed (${res.status}).`);
        setResult(null);
      } else {
        const response = body as MeasureResponse;
        setResult(response);
        setMeasuredKey(keyOf(fn, src));
        onMeasured?.(
          response.state.measured
            ? {
                source: src,
                variables: response.state.hotSlots.flatMap((h) => (h.label ? [baseVariableName(h.label)] : [])),
              }
            : null
        );
      }
    } catch {
      setRequestError("Measurement service is unreachable.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    remeasureWithBaseline(newSource: string) {
      setBaseline(result?.state.measured ? result : null);
      void measure(newSource);
    },
  }));

  const state = result?.state;
  const stale = result !== null && measuredKey !== requestKey;
  const before = baseline?.state.measured ? baseline.state : null;

  const hotRows = useMemo(() => {
    const rows = { caught: [] as { slot: HotSlot; line: number | null }[], missed: [] as { slot: HotSlot; line: number | null }[] };
    if (!state?.measured || stale) return rows;
    const fnName = result?.calledFunction?.split("(")[0];
    for (const slot of state.hotSlots) {
      const variable = slot.label ? baseVariableName(slot.label) : null;
      const loc = variable ? locateVariable(source, variable, fnName) : null;
      const line = loc ? (loc.writeLines[0] ?? loc.declarationLine) : null;
      (variable && staticVariables.includes(variable) ? rows.caught : rows.missed).push({ slot, line });
    }
    return rows;
  }, [state, stale, result, source, staticVariables]);

  const shardRows = useMemo(() => {
    if (!state?.measured || stale) return [];
    const fnName = result?.calledFunction?.split("(")[0];
    return (state.shardGroups ?? []).map((group) => {
      const loc = locateVariable(source, group.variable, fnName);
      return { group, line: loc ? (loc.writeLines[0] ?? loc.declarationLine) : null };
    });
  }, [state, stale, result, source]);

  return (
    <section className="flex flex-col gap-3 border-t border-purple-500/20 pt-4">
      <button type="button" onClick={() => measure()} disabled={loading} className="primary-action measure-action">{loading ? "Measuring…" : "Measure parallelism"}</button>
      <details className="disclosure"><summary>Advanced</summary><div className="disclosure-content">
      <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
        Function
        <select
          value={selected ? signatureOf(selected) : ""}
          onChange={(e) => setChosenSig(e.target.value)}
          disabled={fns.length === 0}
          className="min-w-0 flex-1 rounded border border-purple-500/20 bg-[#0B0B0E] px-2 py-1 font-mono text-xs text-zinc-100 disabled:opacity-60"
        >
          {fns.length === 0 && <option value="">auto (chosen by the server)</option>}
          {fns.map((f) => {
            const sig = signatureOf(f);
            const unsupported = unsupportedTypes(f).length > 0;
            return (
              <option key={sig} value={sig}>
                {sig}
                {defaultFn && sig === signatureOf(defaultFn) ? "  (default)" : ""}
                {unsupported ? "  (unsupported args)" : ""}
              </option>
            );
          })}
        </select>
      </label>
      {selected && selected.inputTypes.length > 0 && unsupportedTypes(selected).length === 0 && (
        <p className="-mt-1 text-xs text-zinc-500">
          Placeholder args: {SUPPORTED_ARGS_TEXT}
        </p>
      )}

      </div></details>

      {requestError && (
        <div className="rounded border border-red-500/30 p-3 text-sm text-red-400">{requestError}</div>
      )}

      {state && !state.measured && (
        <div className="rounded border border-zinc-600/40 p-3 text-sm">
          <div className="font-medium text-zinc-300">Not measured</div>
          <p className="mt-1 text-sm text-zinc-400">Measurement runs locally or via Docker (<a href="https://github.com/Nghtphl/MonadLens#docker-ile-çalıştırma" className="underline">see README</a>).</p><details className="disclosure mt-2"><summary>Details</summary><pre className="whitespace-pre-wrap break-words text-xs text-zinc-400">{state.reason}</pre></details>
        </div>
      )}

      {state && state.measured && (
        <div className={`flex flex-col gap-3 ${stale ? "opacity-50" : ""}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-400">Measured</span>
            <span className="font-mono">
              {result?.contractName}.{result?.calledFunction}
            </span>
            {stale && <span className="text-yellow-400">Code or function changed since this measurement</span>}
          </div>

          {before && !stale && <BeforeAfter before={before} after={state} />}

          {state.revertedTxCount > 0 && (
            <div className="rounded border border-orange-500/30 p-2 text-xs text-orange-300">
              {state.revertedTxCount} of {state.txCount} txs reverted. Reverted txs made no writes, so contention
              may be understated.
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Metric label="Critical path" value={String(state.criticalPathLength)} testId="critical-path" />
            <Metric label="Re-executions" value={String(state.reExecutionCount)} />
            <Metric label="Parallelism" value={`${state.idealParallelism.toFixed(1)}×`} />
          </div>
          <p className="text-xs text-emerald-300">Measured · {state.txCount} txs <span className="text-zinc-400">· Parallelism is an upper bound</span></p>
          <details className="disclosure"><summary>Details</summary><div className="disclosure-content">
          <div className="text-xs text-zinc-500">
            Avg gas used {state.avgGasUsed.toLocaleString()} · recommended gas limit{" "}
            {state.recommendedGasLimit.toLocaleString()} (Monad bills the limit)
          </div>

          {hotRows.caught.length > 0 && (
            <div className="text-xs">
              <div className="mb-1 uppercase tracking-wide text-zinc-500">Hot slots · predicted by static rules</div>
              <ul className="flex flex-col gap-0.5 font-mono">
                {hotRows.caught.map((r) => (
                  <HotSlotRow key={r.slot.slot} slot={r.slot} txCount={state.txCount} line={r.line} onRevealLine={onRevealLine} />
                ))}
              </ul>
            </div>
          )}

          {shardRows.length > 0 && (
            <div className="rounded border border-sky-500/30 p-2 text-xs">
              <div className="mb-1 uppercase tracking-wide text-sky-300">Sharded</div>
              <p className="mb-1 text-zinc-500">
                Different txs write different elements of these arrays. Txs that land on the same shard still
                conflict; that is the price of sharding, not a missed finding.
              </p>
              <ul className="flex flex-col gap-0.5 font-mono">
                {shardRows.map((r) => (
                  <ShardGroupRow
                    key={r.group.variable}
                    group={r.group}
                    txCount={state.txCount}
                    line={r.line}
                    onRevealLine={onRevealLine}
                  />
                ))}
              </ul>
            </div>
          )}

          {hotRows.missed.length > 0 && (
            <div className="rounded border border-amber-500/30 p-2 text-xs">
              <div className="mb-1 uppercase tracking-wide text-amber-300">Not caught by static rules</div>
              <p className="mb-1 text-zinc-500">
                Hot in the measured block, but no static finding names these variables: contention the rules did
                not predict. Check whether a rule is missing.
              </p>
              <ul className="flex flex-col gap-0.5 font-mono">
                {hotRows.missed.map((r) => (
                  <HotSlotRow key={r.slot.slot} slot={r.slot} txCount={state.txCount} line={r.line} onRevealLine={onRevealLine} />
                ))}
              </ul>
            </div>
          )}

          {!stale && (
            <BlockReplay
              key={`${measuredKey}|${before ? "compare" : "single"}`}
              lanes={
                before
                  ? [
                      { title: "Before fix", result: before },
                      { title: "After fix", result: state },
                    ]
                  : [{ title: `${result?.contractName}.${result?.calledFunction}`, result: state }]
              }
            />
          )}
          </div></details>
        </div>
      )}
    </section>
  );
}
