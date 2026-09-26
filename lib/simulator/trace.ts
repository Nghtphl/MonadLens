import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SimulationState } from "../types";
import { compileSolidityWithTimeout, type CompiledContract } from "./compile";
import { simulateOcc, type TxAccessSet } from "./occ";
import { groupShardedSlots } from "./shards";
import {
  encodePlaceholderArgs,
  lastConcreteContractName,
  pickDefaultFunction,
  signatureOf,
  SUPPORTED_ARGS_TEXT,
  unsupportedTypes,
  type CallableFn,
} from "./targets";

export interface MeasureOptions {
  source: string;
  txCount?: number;
  contractName?: string;
  functionName?: string;
  /** Limit for the solc run (§16). */
  compileTimeoutMs?: number;
  /** Limit for everything after compilation: anvil, txs, traces (§16). */
  timeoutMs?: number;
}

export interface MeasureResponse {
  state: SimulationState;
  contractName?: string;
  calledFunction?: string;
}

type StorageMap = Record<string, { storage?: Record<string, string> }>;

const TRACE_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Turns anvil prestateTracer output into an OCC access set.
 * Two traces are needed: anvil's diffMode `pre` omits slots that were only
 * read (verified by scripts/probe-prestate-tracer.mjs), so reads come from
 * the non-diff trace and writes from diffMode (changed keys in pre ∪ post).
 */
export function accessSetFromTraces(full: StorageMap, diff: { pre?: StorageMap; post?: StorageMap }): TxAccessSet {
  const keysOf = (state: StorageMap | undefined) =>
    Object.entries(state ?? {}).flatMap(([addr, account]) =>
      Object.keys(account.storage ?? {}).map((slot) => `${addr.toLowerCase()}:${slot.toLowerCase()}`)
    );

  return {
    reads: Array.from(new Set(keysOf(full))),
    writes: Array.from(new Set([...keysOf(diff.pre), ...keysOf(diff.post)])),
  };
}

export function callableFunctionsFromAbi(contract: CompiledContract): CallableFn[] {
  return contract.abi
    .filter((f) => f.type === "function" && (f.stateMutability === "nonpayable" || f.stateMutability === "payable"))
    .map((f) => ({ name: f.name!, inputTypes: ((f.inputs ?? []) as { type: string }[]).map((i) => i.type) }));
}

export function pickTargetFunction(
  contract: CompiledContract,
  requested?: string
): { fn: CallableFn } | { error: string } {
  const callable = callableFunctionsFromAbi(contract);

  if (!requested) {
    const fn = pickDefaultFunction(callable);
    return fn
      ? { fn }
      : { error: `No state-changing function with supported arguments (${SUPPORTED_ARGS_TEXT}).` };
  }

  const overloads = callable.filter((f) => f.name === requested);
  if (overloads.length === 0) return { error: `"${requested}" is not a state-changing function of ${contract.name}.` };
  const fn = overloads.find((f) => unsupportedTypes(f).length === 0);
  if (fn) return { fn };
  const bad = Array.from(new Set(overloads.flatMap(unsupportedTypes)));
  return {
    error: `${signatureOf(overloads[0])} takes an unsupported argument type (${bad.join(", ")}). Supported: ${SUPPORTED_ARGS_TEXT}.`,
  };
}

function resolveAnvil(): string {
  if (process.env.ANVIL_PATH) return process.env.ANVIL_PATH;
  const foundryDefault = join(homedir(), ".foundry", "bin", "anvil");
  return existsSync(foundryDefault) ? foundryDefault : "anvil";
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

const unmeasured = (reason: string, extra: Omit<MeasureResponse, "state"> = {}): MeasureResponse => ({
  state: { measured: false, reason },
  ...extra,
});

/**
 * CLAUDE.md §7 pipeline: compile -> fresh anvil -> deploy -> N txs from N
 * distinct senders in ONE block -> prestateTracer per tx -> OCC model.
 * A fresh anvil process per call keeps one caller's state from leaking
 * into another's (§16). Never throws; failures become `measured: false`.
 */
export async function measureContract(opts: MeasureOptions): Promise<MeasureResponse> {
  const txCount = opts.txCount ?? 100;

  const compiled = await compileSolidityWithTimeout(opts.source, opts.compileTimeoutMs ?? 20_000);
  if (!compiled.ok) return unmeasured(`Compilation failed: ${compiled.error}`);
  const deadline = Date.now() + (opts.timeoutMs ?? 60_000);

  // solc orders contracts alphabetically; pick the last one in source order instead.
  const targetName = opts.contractName ?? lastConcreteContractName(opts.source);
  const contract = targetName
    ? compiled.contracts.find((c) => c.name === targetName)
    : compiled.contracts[compiled.contracts.length - 1];
  if (!contract) return unmeasured(`Contract "${opts.contractName}" not found in source.`);

  const ctorTypes = ((contract.abi.find((f) => f.type === "constructor")?.inputs ?? []) as { type: string }[]).map(
    (i) => i.type
  );
  const badCtorTypes = unsupportedTypes({ name: "constructor", inputTypes: ctorTypes });
  if (badCtorTypes.length > 0) {
    return unmeasured(
      `constructor(${ctorTypes.join(",")}) takes an unsupported argument type (${badCtorTypes.join(", ")}). Supported: ${SUPPORTED_ARGS_TEXT}.`,
      { contractName: contract.name }
    );
  }

  const picked = pickTargetFunction(contract, opts.functionName);
  if ("error" in picked) return unmeasured(picked.error, { contractName: contract.name });
  const signature = signatureOf(picked.fn);
  const selector = `0x${contract.methodIdentifiers[signature]}`;
  const calldataFor = (sender: string) => selector + encodePlaceholderArgs(picked.fn.inputTypes, sender);
  const meta = { contractName: contract.name, calledFunction: signature };

  let anvil: ChildProcess | undefined;
  try {
    const port = await freePort();
    const rpcUrl = `http://127.0.0.1:${port}`;
    let spawnError: Error | undefined;

    anvil = spawn(
      resolveAnvil(),
      ["--port", String(port), "--accounts", String(txCount + 1), "--balance", "1000000", "--gas-limit", "1000000000", "--silent"],
      { stdio: "ignore" }
    );
    anvil.on("error", (e) => (spawnError = e));

    let id = 0;
    const rpc = async (method: string, params: unknown[] = []): Promise<any> => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Measurement timed out.");
      let res: Response;
      try {
        res = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
          signal: AbortSignal.timeout(remaining),
        });
      } catch (e) {
        const cause = (e as { cause?: { code?: string; message?: string } }).cause;
        throw new Error(`${method}: ${(e as Error).message}${cause ? ` (${cause.code ?? cause.message})` : ""}`);
      }
      const body = await res.json();
      if (body.error) throw new Error(`${method}: ${body.error.message ?? JSON.stringify(body.error)}`);
      return body.result;
    };

    for (let ready = false; !ready; ) {
      if (spawnError) {
        return unmeasured(`Could not start anvil (${spawnError.message}). Install Foundry or set ANVIL_PATH.`, meta);
      }
      try {
        await rpc("eth_chainId");
        ready = true;
      } catch (e) {
        if (e instanceof Error && e.message === "Measurement timed out.") throw e;
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    // anvil can return a null receipt for a moment right after mining.
    const receiptOf = async (hash: string): Promise<any> => {
      for (;;) {
        const receipt = await rpc("eth_getTransactionReceipt", [hash]);
        if (receipt) return receipt;
        await new Promise((r) => setTimeout(r, 25));
      }
    };

    const accounts: string[] = await rpc("eth_accounts");
    const deployHash = await rpc("eth_sendTransaction", [{ from: accounts[0], data: contract.bytecode + encodePlaceholderArgs(ctorTypes, accounts[0]) }]);
    const deployReceipt = await receiptOf(deployHash);
    if (deployReceipt.status !== "0x1") return unmeasured(`Deployment reverted (constructor placeholder args: ${SUPPORTED_ARGS_TEXT}).`, meta);
    const address: string = deployReceipt.contractAddress.toLowerCase();

    let estimate: bigint;
    try {
      estimate = BigInt(await rpc("eth_estimateGas", [{ from: accounts[1], to: address, data: calldataFor(accounts[1]) }]));
    } catch (e) {
      return unmeasured(`${signature} reverts when called from a fresh account with placeholder args (${SUPPORTED_ARGS_TEXT}): ${(e as Error).message}`, meta);
    }
    const gas = `0x${((estimate * BigInt(3)) / BigInt(2)).toString(16)}`;

    await rpc("evm_setAutomine", [false]);
    await Promise.all(
      accounts
        .slice(1, txCount + 1)
        .map((from) => rpc("eth_sendTransaction", [{ from, to: address, data: calldataFor(from), gas }]))
    );
    await rpc("evm_mine");

    const block = await rpc("eth_getBlockByNumber", ["latest", false]);
    const hashes: string[] = block.transactions;
    if (hashes.length !== txCount) {
      return unmeasured(`Only ${hashes.length}/${txCount} txs fit in one block.`, meta);
    }

    const receipts = await Promise.all(hashes.map(receiptOf));
    const revertedTxCount = receipts.filter((r) => r.status !== "0x1").length;
    if (revertedTxCount * 2 > txCount) {
      return unmeasured(
        `${revertedTxCount} of ${txCount} ${signature} calls reverted, so the block does not reflect normal ` +
          `usage (placeholder args: ${SUPPORTED_ARGS_TEXT}). Pick another function or one without access checks.`,
        meta
      );
    }

    // Unbounded parallel tracing (200 requests for 100 txs) made anvil reset connections.
    const accessSets = await mapWithConcurrency(hashes, TRACE_CONCURRENCY, async (h) => {
      const full = await rpc("debug_traceTransaction", [h, { tracer: "prestateTracer" }]);
      const diff = await rpc("debug_traceTransaction", [h, { tracer: "prestateTracer", tracerConfig: { diffMode: true } }]);
      return accessSetFromTraces(full, diff);
    });

    const occ = simulateOcc(accessSets);
    const gasUsed = receipts.map((r) => Number(BigInt(r.gasUsed)));
    const maxGas = Math.max(Number(estimate), ...gasUsed);

    const labelFor = (key: string): string | undefined => {
      const [addr, slot] = key.split(":");
      return addr === address ? contract.slotLabels.get(BigInt(slot)) : undefined;
    };

    // Spread-out writes to shard elements are expected after sharding; report them as groups.
    const hot = groupShardedSlots(
      occ.hotSlots.map((s) => ({ ...s, label: labelFor(s.slot) })),
      txCount - revertedTxCount
    );

    return {
      ...meta,
      state: {
        measured: true,
        txCount: occ.txCount,
        revertedTxCount,
        reExecutionCount: occ.reExecutionCount,
        criticalPathLength: occ.criticalPathLength,
        idealParallelism: occ.idealParallelism,
        avgGasUsed: Math.round(gasUsed.reduce((a, b) => a + b, 0) / gasUsed.length),
        // Monad bills the gas LIMIT (§9): worst observed need + 10% headroom.
        recommendedGasLimit: Math.ceil(maxGas * 1.1),
        hotSlots: hot.rest.slice(0, 10),
        shardGroups: hot.shardGroups,
        dependsOn: occ.dependsOn,
        txLevels: occ.levels,
      },
    };
  } catch (e) {
    return unmeasured(e instanceof Error ? e.message : String(e), meta);
  } finally {
    anvil?.kill("SIGKILL");
  }
}
