/**
 * Downloads the GPL-3.0 validation contracts into fixtures/realworld/.
 * They are not kept in the repository (see .gitignore); everything else there is MIT.
 *
 *   npx tsx scripts/fetch-realworld.ts
 *
 * Sources are pinned to a commit, so the output is the same on every run.
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REALWORLD_DIR = join(SCRIPT_DIR, "../fixtures/realworld");

const UNISWAP_COMMIT = "6a9e7c97860676e0992f22a49665760444c1cdf5";
const WETH_COMMIT = "0dd1ea3e295eef916d0c6223ec63141137d22d67";
const raw = (repo: string, commit: string, path: string) =>
  `https://raw.githubusercontent.com/${repo}/${commit}/${path}`;

// UniswapV2Pair.sol imports these; concatenated in dependency order.
const UNISWAP_FILES = [
  "interfaces/IUniswapV2Pair.sol",
  "interfaces/IUniswapV2ERC20.sol",
  "libraries/SafeMath.sol",
  "UniswapV2ERC20.sol",
  "libraries/Math.sol",
  "libraries/UQ112x112.sol",
  "interfaces/IERC20.sol",
  "interfaces/IUniswapV2Factory.sol",
  "interfaces/IUniswapV2Callee.sol",
  "UniswapV2Pair.sol",
];

interface GplFixture {
  file: string;
  header: string[];
  build: () => Promise<string>;
}

async function get(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

export const GPL_FIXTURES: GplFixture[] = [
  {
    file: "UniswapV2Pair.sol",
    header: [
      "// MonadLens real-world validation fixture (CLAUDE.md §17), see docs/validation.md.",
      `// Source:  https://github.com/Uniswap/v2-core/blob/${UNISWAP_COMMIT}/contracts/UniswapV2Pair.sol`,
      `// Ref:     commit ${UNISWAP_COMMIT} (master)`,
      "// License: GPL-3.0 (https://github.com/Uniswap/v2-core/blob/${UNISWAP_COMMIT}/LICENSE). Downloaded by scripts/fetch-realworld.ts; not kept in the repository.",
      "// Note:    Flattened by the script (files concatenated in dependency order, imports and repeated pragmas removed): `forge flatten` rejects the 0.5.16-era Yul `chainid` builtin in UniswapV2ERC20.",
    ],
    async build() {
      const parts = ["pragma solidity =0.5.16;"];
      for (const path of UNISWAP_FILES) {
        const source = await get(raw("Uniswap/v2-core", UNISWAP_COMMIT, `contracts/${path}`));
        const kept = source
          .split("\n")
          .filter((line) => !/^(pragma solidity|import )/.test(line))
          .join("\n");
        parts.push("", `// File: contracts/${path}`, kept.replace(/\n$/, ""));
      }
      return parts.join("\n") + "\n";
    },
  },
  {
    file: "WETH9.sol",
    header: [
      "// MonadLens real-world validation fixture (CLAUDE.md §17), see docs/validation.md.",
      `// Source:  https://github.com/gnosis/canonical-weth/blob/${WETH_COMMIT}/contracts/WETH9.sol`,
      `// Ref:     commit ${WETH_COMMIT} (master)`,
      "// License: GPL-3.0 (see the notice below). Downloaded by scripts/fetch-realworld.ts; not kept in the repository.",
      "// Note:    Single file, unchanged. Same source as the verified mainnet WETH at 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2.",
    ],
    build: () => get(raw("gnosis/canonical-weth", WETH_COMMIT, "contracts/WETH9.sol")),
  },
];

export function missingGplFixtures(): string[] {
  return GPL_FIXTURES.filter((f) => !existsSync(join(REALWORLD_DIR, f.file))).map((f) => f.file);
}

export async function fetchGplFixtures(only?: readonly string[]): Promise<void> {
  for (const fixture of GPL_FIXTURES) {
    if (only && !only.includes(fixture.file)) continue;
    const body = await fixture.build();
    writeFileSync(join(REALWORLD_DIR, fixture.file), `${fixture.header.join("\n")}\n\n${body}`);
    console.log(`fetched fixtures/realworld/${fixture.file}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  fetchGplFixtures().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
