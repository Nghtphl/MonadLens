"use client";

import { useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
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
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" data-testid={testId}>
        {value}
      </div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

function BeforeAfter({ before, after }: { before: SimulationResultMeasured; after: SimulationResultMeasured }) {
  const rows: [string, string, string][] = [
    ["Critical path", String(before.criticalPathLength), String(after.criticalPathLength)],
    ["Re-executions", String(before.reExecutionCount), String(after.reExecutionCount)],
    ["Ideal parallelism", `${before.idealParallelism.toFixed(1)}×`, `${after.idealParallelism.toFixed(1)}×`],
    ["Avg gas used", before.avgGasUsed.toLocaleString("en-US"), after.avgGasUsed.toLocaleString("en-US")],
  ];
  const improved = after.criticalPathLength < before.criticalPathLength;
  return (
    <div className="compare">
      <div className="compare-label">
        Before fix → after fix · {after.txCount} transactions each
      </div>
      <div className="compare-hero">
        <span className="compare-metric">Critical path</span>
        <span className="compare-values">
          <span className="compare-before">{before.criticalPathLength}</span>
          <span className="compare-arrow" aria-hidden="true">→</span>
          <span className={improved ? "compare-after is-better" : "compare-after"}>{after.criticalPathLength}</span>
        </span>
      </div>
      <table className="compare-table">
        <caption className="sr-only">Measured values before and after the fix</caption>
        <tbody>
          {rows.map(([label, b, a]) => (
            <tr key={label} data-testid={`before-after-${label.toLowerCase().replace(/ /g, "-")}`}>
              <th scope="row">{label}</th>
              <td data-testid="before">{b}</td>
              <td aria-hidden="true" className="compare-table-arrow">→</td>
              <td data-testid="after">{a}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="compare-note">
        Critical path is the longest chain of dependent transactions in the measured block (OCC model). It is not a
        network speed measurement.
      </p>
    </div>
  );
}

export interface MeasurePanelHandle {
  /** Keeps the current result as "before" and measures `newSource` (e.g. after applying a fix). */
  remeasureWithBaseline(newSource: string): void;
  /** Scrolls the panel into view and moves focus to its heading. */
  reveal(): void;
}

export default function MeasurePanel({
  source,
  ref,
  staticVariables = [],
  onRevealLine,
  onMeasured,
  onBusyChange,
}: {
  source: string;
  ref?: Ref<MeasurePanelHandle>;
  /** Variables named by the current static findings. */
  staticVariables?: string[];
  onRevealLine?: (line: number) => void;
  onMeasured?: (hot: MeasuredHotVariables | null) => void;
  /** Called when a measurement starts or ends. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MeasureResponse | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [measuredKey, setMeasuredKey] = useState<string | null>(null);
  const [chosenSig, setChosenSig] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<MeasureResponse | null>(null);
  const inFlight = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const fns = useMemo(() => listCallableFunctions(source), [source]);
  const selectFor = (fnList: CallableFn[]) =>
    fnList.find((f) => signatureOf(f) === chosenSig) ?? pickDefaultFunction(fnList);
  const defaultFn = useMemo(() => pickDefaultFunction(fns), [fns]);
  const selected = selectFor(fns);
  const keyOf = (fn: CallableFn | null, src: string) => `${fn ? signatureOf(fn) : "auto"}\n${src}`;
  const requestKey = keyOf(selected, source);

  const measure = async (src: string = source) => {
    // One measurement at a time.
    if (inFlight.current) return;
    inFlight.current = true;
    const fn = src === source ? selected : selectFor(listCallableFunctions(src));
    setLoading(true);
    onBusyChange?.(true);
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
      inFlight.current = false;
      setLoading(false);
      onBusyChange?.(false);
    }
  };

  useImperativeHandle(ref, () => ({
    remeasureWithBaseline(newSource: string) {
      if (inFlight.current) return;
      setBaseline(result?.state.measured ? result : null);
      void measure(newSource);
    },
    reveal() {
      sectionRef.current?.scrollIntoView({ block: "start" });
      headingRef.current?.focus({ preventScroll: true });
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
    <section ref={sectionRef} className="block measure-block" aria-labelledby="measure-heading" aria-busy={loading}>
      <div className="block-head">
        <h2 id="measure-heading" ref={headingRef} tabIndex={-1} className="block-title">
          Measured
        </h2>
        <span className="block-hint">Traced transactions in one local Anvil block</span>
      </div>

      <button
        type="button"
        onClick={() => measure()}
        disabled={loading}
        aria-busy={loading}
        className="btn btn-primary btn-block btn-lg"
      >
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Measuring…
          </>
        ) : (
          "Measure parallelism"
        )}
      </button>

      <details className="disclosure">
        <summary>Advanced</summary>
        <div className="disclosure-content">
          <label className="field">
            <span className="field-label">Function</span>
            <select
              value={selected ? signatureOf(selected) : ""}
              onChange={(e) => setChosenSig(e.target.value)}
              disabled={fns.length === 0 || loading}
              className="select mono"
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
            <p className="muted small">Placeholder args: {SUPPORTED_ARGS_TEXT}</p>
          )}
          <p className="muted small">
            Sends {TX_COUNT} calls from {TX_COUNT} distinct accounts into one block, traces each one, and builds the
            dependency graph.
          </p>
        </div>
      </details>

      <p className="sr-only" role="status" aria-live="polite">
        {loading ? "Measuring…" : ""}
      </p>

      {!loading && !result && !requestError && <p className="muted small">Not measured yet.</p>}

      {requestError && (
        <div role="alert" className="notice notice-error">
          <div className="notice-title">Measurement failed</div>
          <p>{requestError}</p>
        </div>
      )}

      {state && !state.measured && (
        <div className="notice notice-neutral" role="status">
          <div className="notice-title">Not measured</div>
          <p>
            Measurement runs locally or via Docker (
            <a href="https://github.com/Nghtphl/MonadLens#docker-ile-çalıştırma" className="text-link">
              see README
            </a>
            ).
          </p>
          <details className="disclosure">
            <summary>Details</summary>
            <pre className="notice-pre">{state.reason}</pre>
          </details>
        </div>
      )}

      {state && state.measured && (
        <div className={stale ? "measured is-stale" : "measured"}>
          <div className="measured-head">
            <span className="tag tag-measured">Measured</span>
            <span className="mono muted small measured-target">
              {result?.contractName}.{result?.calledFunction}
            </span>
          </div>
          {stale && (
            <p className="note note-warn" role="status">
              Code or function changed since this measurement
            </p>
          )}

          {before && !stale && <BeforeAfter before={before} after={state} />}

          {state.revertedTxCount > 0 && (
            <p className="note note-warn">
              {state.revertedTxCount} of {state.txCount} transactions reverted. Reverted transactions made no writes, so
              contention may be understated.
            </p>
          )}

          {!(before && !stale) && (
            <>
              <div className="kpis">
                <Metric label="Critical path" value={String(state.criticalPathLength)} hint="longest dependent chain" testId="critical-path" />
                <Metric label="Re-executions" value={String(state.reExecutionCount)} hint="txs with a conflict" />
                <Metric label="Ideal parallelism" value={`${state.idealParallelism.toFixed(1)}×`} hint="upper bound" />
              </div>
              <p className="measured-caption">Measured · {state.txCount} transactions</p>
            </>
          )}

          <details className="disclosure">
            <summary>Details</summary>
            <div className="disclosure-content">
              <p className="muted small">
                Avg gas used {state.avgGasUsed.toLocaleString("en-US")} · recommended gas limit{" "}
                {state.recommendedGasLimit.toLocaleString("en-US")} (Monad bills the limit)
              </p>

              {hotRows.caught.length > 0 && (
                <div className="detail-group">
                  <div className="detail-label">Hot slots · predicted by static rules</div>
                  <ul className="slot-list">
                    {hotRows.caught.map((r) => (
                      <HotSlotRow key={r.slot.slot} slot={r.slot} txCount={state.txCount} line={r.line} onRevealLine={onRevealLine} />
                    ))}
                  </ul>
                </div>
              )}

              {shardRows.length > 0 && (
                <div className="detail-group detail-sharded">
                  <div className="detail-label">Sharded</div>
                  <p className="muted small">
                    Different transactions write different elements of these arrays. Transactions that land on the same
                    shard still conflict; that is the price of sharding, not a missed finding.
                  </p>
                  <ul className="slot-list">
                    {shardRows.map((r) => (
                      <ShardGroupRow key={r.group.variable} group={r.group} txCount={state.txCount} line={r.line} onRevealLine={onRevealLine} />
                    ))}
                  </ul>
                </div>
              )}

              {hotRows.missed.length > 0 && (
                <div className="detail-group detail-missed">
                  <div className="detail-label">Not caught by static rules</div>
                  <p className="muted small">
                    Hot in the measured block, but no static finding names these variables: contention the rules did not
                    predict. Check whether a rule is missing.
                  </p>
                  <ul className="slot-list">
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
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
