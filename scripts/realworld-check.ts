/**
 * CLAUDE.md §17: run MonadLens over real contracts (fixtures/realworld/*.sol)
 * and the synthetic ones (fixtures/realworld/synthetic/*.sol).
 *
 *   npx tsx scripts/realworld-check.ts            # static analysis only
 *   npx tsx scripts/realworld-check.ts --measure  # plus measurement (needs anvil)
 *   npx tsx scripts/realworld-check.ts --measure --json   # also write data/realworld-findings.json
 *
 * With --measure, fixtures/measure/*.sol (measurement-only ports, e.g. StakingRewardsCore)
 * are measured too; they are reported separately and not counted as validation contracts.
 * --json [path] writes the results for the /findings page (default data/realworld-findings.json).
 *
 * The GPL-3.0 contracts (UniswapV2Pair, WETH9) are not in the repository; if they
 * are missing, this downloads them first via scripts/fetch-realworld.ts.
 *
 * Results feed docs/validation.md.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeSolidityCode } from "../lib/analyzer";
import type { MeasureResponse } from "../lib/simulator/trace";
import {
  fixtureHeader,
  toReportFindings,
  toReportMeasurement,
  type FindingsReport,
} from "../lib/findings/report";
import { fetchGplFixtures, missingGplFixtures } from "./fetch-realworld";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REAL_DIR = join(SCRIPT_DIR, "../fixtures/realworld");
const SYNTHETIC_DIR = join(REAL_DIR, "synthetic");
const PORT_DIR = join(SCRIPT_DIR, "../fixtures/measure");
const MEASURE = process.argv.includes("--measure");
const JSON_FLAG = process.argv.indexOf("--json");
const JSON_OUT =
  JSON_FLAG === -1
    ? undefined
    : process.argv[JSON_FLAG + 1] && !process.argv[JSON_FLAG + 1].startsWith("--")
      ? process.argv[JSON_FLAG + 1]
      : join(SCRIPT_DIR, "../data/realworld-findings.json");
const TX_COUNT = 100;

/**
 * How to measure each real contract. Abstract OpenZeppelin bases can't be
 * deployed, so a minimal public-mint harness is appended for measurement only;
 * static analysis always sees the fixture unchanged.
 */
const MEASURE_PLAN: Record<string, { functionName: string; harness?: string; contractName?: string }> = {
  "OpenZeppelinERC20.sol": {
    functionName: "mint",
    contractName: "ERC20Harness",
    harness: `
contract ERC20Harness is ERC20 {
    constructor() ERC20("Token", "TKN") {}
    function mint() external { _mint(msg.sender, 1000); }
}`,
  },
  "OpenZeppelinERC721.sol": {
    functionName: "mint",
    contractName: "ERC721Harness",
    harness: `
contract ERC721Harness is ERC721 {
    constructor() ERC721("Token", "TKN") {}
    function mint() external { _mint(msg.sender, uint256(uint160(msg.sender))); }
}`,
  },
  "WETH9.sol": { functionName: "deposit" },
  "UniswapV2Pair.sol": { functionName: "sync" },
  "StakingRewards.sol": { functionName: "stake" },
  "StakingRewardsCore.sol": { functionName: "stake" },
};

const MEASUREMENT_NOTES: Record<string, string> = {
  "OpenZeppelinERC20.sol": "Abstract base: measured with a public mint() harness appended (_mint(msg.sender, 1000)).",
  "OpenZeppelinERC721.sol":
    "Abstract base: measured with a public mint() harness appended (_mint(msg.sender, uint160(msg.sender))).",
  "StakingRewardsCore.sol":
    "solc 0.8 port of StakingRewards' reward bookkeeping (updateReward), without token transfers, so it can be measured.",
};

interface ContractCheck {
  group: "real" | "synthetic" | "port";
  dir: string;
  file: string;
  source?: string;
  crashed: boolean;
  parseError: string | null;
  score?: number;
  findings: ReturnType<typeof analyzeSolidityCode>["findings"];
  crashReason?: string;
  measurement?: MeasureResponse;
}

function checkContract(group: ContractCheck["group"], dir: string, file: string): ContractCheck {
  try {
    const source = readFileSync(join(dir, file), "utf8");
    const result = analyzeSolidityCode(source);

    return {
      group,
      dir,
      file,
      source,
      crashed: false,
      parseError: result.error?.message ?? null,
      score: result.error ? undefined : result.score,
      findings: result.findings,
    };
  } catch (error) {
    return {
      group,
      dir,
      file,
      crashed: true,
      parseError: null,
      findings: [],
      crashReason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function measure(check: ContractCheck): Promise<void> {
  const plan = MEASURE_PLAN[check.file];
  if (!plan) return;
  const { measureContract } = await import("../lib/simulator/trace");
  const source = readFileSync(join(check.dir, check.file), "utf8") + (plan.harness ?? "");
  check.measurement = await measureContract({
    source,
    txCount: TX_COUNT,
    functionName: plan.functionName,
    contractName: plan.contractName,
  });
}

function printContractCheck(check: ContractCheck): void {
  console.log(`\n[${check.group}] ${check.file}`);
  console.log(`  crashed: ${check.crashed ? "yes" : "no"}`);
  console.log(`  parse error: ${check.parseError ?? "none"}`);
  if (check.score !== undefined) console.log(`  heuristic score: ${check.score}`);

  if (check.crashReason) {
    console.log(`  crash reason: ${check.crashReason}`);
  }

  console.log(`  findings (${check.findings.length}):`);
  if (check.findings.length === 0) {
    console.log("    none");
  }

  for (const finding of check.findings) {
    console.log(
      `    - ${finding.ruleId} [${finding.severity}] line ${finding.line}` +
        `${finding.functionName ? ` in ${finding.functionName}()` : ""}` +
        ` (weight ${finding.reachabilityWeight}): ${finding.message}`
    );
  }

  const m = check.measurement;
  if (m) {
    const target = `${m.contractName ?? "?"}.${m.calledFunction ?? MEASURE_PLAN[check.file]?.functionName}`;
    if (m.state.measured) {
      const s = m.state;
      console.log(
        `  measured ${target} x${s.txCount}: reverted ${s.revertedTxCount}, re-executions ${s.reExecutionCount}, ` +
          `critical path ${s.criticalPathLength}, ideal parallelism ${s.idealParallelism.toFixed(1)}x, ` +
          `avg gas ${s.avgGasUsed}, recommended gas limit ${s.recommendedGasLimit}`
      );
      for (const h of s.hotSlots) {
        console.log(`    hot slot ${h.label ?? h.slot}: ${h.writers} writers, ${h.readers} readers`);
      }
    } else {
      console.log(`  not measured (${target}): ${m.state.reason.split("\n")[0]}`);
    }
  }
}

async function main(): Promise<void> {
  const missing = missingGplFixtures();
  if (missing.length > 0) {
    console.log(`Missing GPL fixtures (not kept in the repo): ${missing.join(", ")}. Downloading...`);
    try {
      await fetchGplFixtures(missing);
    } catch (error) {
      console.log(
        `Download failed (${error instanceof Error ? error.message : error}). ` +
          "Run `npx tsx scripts/fetch-realworld.ts` when online; continuing without them."
      );
    }
  }

  const solFiles = (dir: string) =>
    readdirSync(dir)
      .filter((file) => file.endsWith(".sol"))
      .sort();

  const checks = [
    ...solFiles(REAL_DIR).map((file) => checkContract("real", REAL_DIR, file)),
    ...solFiles(SYNTHETIC_DIR).map((file) => checkContract("synthetic", SYNTHETIC_DIR, file)),
  ];

  const ports = MEASURE ? solFiles(PORT_DIR).map((file) => checkContract("port", PORT_DIR, file)) : [];

  if (MEASURE) {
    // One at a time: each measurement starts its own anvil.
    for (const check of [...checks, ...ports]) {
      if (check.group !== "synthetic" && !check.crashed) await measure(check);
    }
  }

  for (const check of checks) {
    printContractCheck(check);
  }
  if (ports.length > 0) console.log("\nMeasurement-only ports (fixtures/measure, not validation contracts):");
  for (const check of ports) {
    printContractCheck(check);
  }

  if (JSON_OUT) writeReport(JSON_OUT, [...checks, ...ports]);

  const crashedCount = checks.filter((check) => check.crashed).length;
  const parseErrorCount = checks.filter((check) => check.parseError !== null).length;
  console.log(
    `\nSummary: ${checks.length} contracts, ${crashedCount} crashes, ${parseErrorCount} parse errors.`
  );

  if (crashedCount > 0 || parseErrorCount > 0) {
    process.exitCode = 1;
  }
}

function writeReport(path: string, checks: ContractCheck[]): void {
  const report: FindingsReport = {
    generatedAt: new Date().toISOString().slice(0, 10),
    measured: MEASURE,
    contracts: checks.map((check) => ({
      group: check.group,
      file: check.file,
      ...(check.source ? fixtureHeader(check.source) : {}),
      crashed: check.crashed,
      parseError: check.parseError,
      score: check.score,
      findings: toReportFindings(check.findings),
      measurement: check.measurement
        ? toReportMeasurement(check.measurement, check.findings, MEASURE_PLAN[check.file]?.functionName ?? "?")
        : undefined,
      measurementNote: check.measurement ? MEASUREMENT_NOTES[check.file] : undefined,
    })),
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nWrote ${path}`);
}

void main();
