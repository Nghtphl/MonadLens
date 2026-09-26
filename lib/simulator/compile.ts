import { Worker } from "node:worker_threads";
import solc from "solc";

export interface AbiFunction {
  type: string;
  name?: string;
  stateMutability?: string;
  inputs?: unknown[];
}

export interface CompiledContract {
  name: string;
  bytecode: string; // 0x-prefixed creation code
  abi: AbiFunction[];
  methodIdentifiers: Record<string, string>; // "mint()" -> "1249c58b"
  /** Plain (non-mapping) state vars: slot number -> variable name. */
  slotLabels: Map<bigint, string>;
}

export type CompileResult =
  | { ok: true; contracts: CompiledContract[] }
  | { ok: false; error: string };

function standardJsonInput(source: string): string {
  return JSON.stringify({
    language: "Solidity",
    sources: { "Contract.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object", "evm.methodIdentifiers", "storageLayout"] },
      },
    },
  });
}

export function compileSolidity(source: string): CompileResult {
  let raw: string;
  try {
    // No import callback: imports fail with a clear solc error (sources must be flattened).
    raw = solc.compile(standardJsonInput(source));
  } catch (error) {
    return { ok: false, error: `solc crashed: ${error instanceof Error ? error.message : String(error)}` };
  }
  return parseSolcOutput(raw);
}

// solc is loaded by the worker itself; `serverExternalPackages` keeps it resolvable from node_modules.
const WORKER_CODE = `
const { parentPort, workerData } = require("node:worker_threads");
parentPort.postMessage(require("solc").compile(workerData));
`;

/**
 * solc.compile is synchronous, so a time limit can't be enforced on the request's
 * own thread. Compile in a worker and terminate it when the limit passes (§16).
 */
export function compileSolidityWithTimeout(source: string, timeoutMs: number): Promise<CompileResult> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(WORKER_CODE, { eval: true, workerData: standardJsonInput(source) });
    } catch (error) {
      resolve({ ok: false, error: `solc worker failed to start: ${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    const finish = (result: CompileResult) => {
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, error: `Compilation exceeded the ${timeoutMs / 1000}s limit.` }),
      timeoutMs
    );
    worker.once("message", (raw: string) => finish(parseSolcOutput(raw)));
    worker.once("error", (error) => finish({ ok: false, error: `solc crashed: ${error.message}` }));
  });
}

function parseSolcOutput(raw: string): CompileResult {
  let output: any;
  try {
    output = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `solc crashed: ${error instanceof Error ? error.message : String(error)}` };
  }

  const errors = (output.errors ?? []).filter((e: any) => e.severity === "error");
  if (errors.length > 0) {
    return { ok: false, error: errors.map((e: any) => e.formattedMessage ?? e.message).join("\n") };
  }

  const contracts: CompiledContract[] = [];
  for (const [name, c] of Object.entries<any>(output.contracts?.["Contract.sol"] ?? {})) {
    const object: string = c.evm?.bytecode?.object ?? "";
    if (!object) continue; // interfaces / abstract contracts

    const slotLabels = new Map<bigint, string>();
    const types = c.storageLayout?.types ?? {};
    for (const entry of c.storageLayout?.storage ?? []) {
      if (entry.offset !== 0) continue;
      const base = BigInt(entry.slot);
      const slotCount = Math.ceil(Number(types[entry.type]?.numberOfBytes ?? 32) / 32);
      // Fixed uint256 arrays (e.g. shard arrays) take one slot per element.
      if (slotCount > 1 && String(entry.type).startsWith("t_array(t_uint256)")) {
        for (let i = 0; i < slotCount; i++) slotLabels.set(base + BigInt(i), `${entry.label}[${i}]`);
      } else {
        slotLabels.set(base, entry.label);
      }
    }

    contracts.push({
      name,
      bytecode: `0x${object}`,
      abi: c.abi ?? [],
      methodIdentifiers: c.evm?.methodIdentifiers ?? {},
      slotLabels,
    });
  }

  if (contracts.length === 0) {
    return { ok: false, error: "No deployable contract found (only interfaces or abstract contracts)." };
  }
  return { ok: true, contracts };
}
