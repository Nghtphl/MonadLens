import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { runSlither } from "../lib/security/slither";

const DEMO_FIXTURES = [
  "fixtures/demo/BadNFT.sol",
  "fixtures/demo/BadLending.sol",
  "fixtures/demo/AMMPool.sol",
] as const;

function findSolidityFixtures(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findSolidityFixtures(path);
    return entry.isFile() && entry.name.endsWith(".sol")
      ? [relative(process.cwd(), path)]
      : [];
  });
}

async function main() {
  const fixtures = [
    ...DEMO_FIXTURES,
    ...findSolidityFixtures(join(process.cwd(), "fixtures/realworld")),
  ];

  for (const fixture of fixtures) {
    const result = await runSlither(readFileSync(join(process.cwd(), fixture), "utf8"), {
      timeoutMs: 30_000,
    });
    if (result.available) {
      console.log(`${fixture}: available, ${result.findings.length} findings`);
      for (const finding of result.findings) {
        console.log(`  ${finding.ruleId} [${finding.severity}] line ${finding.line}`);
      }
    } else {
      console.log(`${fixture}: unavailable: ${result.reason}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
