@AGENTS.md
# MonadLens — Context & Architecture Rules

## 1. Project Goal
MonadLens is a pre-deployment inspector for Solidity contracts moving from Ethereum to Monad.
It (a) statically detects storage-contention patterns that limit Monad's optimistic parallel
execution and Monad-specific migration pitfalls, (b) MEASURES contention by tracing real
transactions and running an OCC simulation, and (c) suggests fix templates with explicit trade-offs.

Core principle: **every number shown in the UI is either measured or clearly labeled as a heuristic.**
The tool must also say when contention is inherent and should NOT be "fixed".

## 2. Technical Stack
- Next.js 14+ (App Router), TypeScript (strict)
- Tailwind CSS — dark developer aesthetic: bg `#0B0B0E`, surface `#1A1726`, accent Monad Purple `#836EF9`
- AST: `@solidity-parser/parser`
- Editor: `@monaco-editor/react` (use the built-in `DiffEditor` for fixes)
- Animation: `framer-motion`
- Dynamic layer (Node runtime API route, NOT edge): `solc` (npm), local `anvil`, `viem`
- Tests: `vitest`
- Contracts: Foundry (`contracts/`)
- General security scan: Slither (Python, CLI, `--json` output) — server side only
- AI explanation layer: Gemini API (server side only, key in `.env`)
- MCP server: `@modelcontextprotocol/sdk` (`mcp/`)

## 3. Project Structure
```
app/
  page.tsx
  api/simulate/route.ts      # runtime = 'nodejs'
components/                  # UI only, no analysis logic
lib/analyzer/
  parse.ts                   # safe parse wrapper
  symbols.ts                 # state vars, which functions read/write them
  reachability.ts            # function hotness weights
  rules/                     # one file per rule, each exports a Rule
  score.ts
lib/fixer/templates/         # fix templates + trade-off text
lib/simulator/
  trace.ts                   # anvil tx batch + prestateTracer
  occ.ts                     # PURE function, no I/O
lib/security/slither.ts       # runs slither, maps JSON to Finding[]
lib/explain/                 # Gemini client, prompt, cache, static fallbacks
docs/monad/                  # curated Monad docs (markdown) used as AI context + facts source
mcp/server.ts                # exposes analyze / measure as MCP tools
lib/types.ts
fixtures/solidity/           # <name>.sol + <name>.expected.json
fixtures/demo/               # BadNFT.sol, BadLending.sol, AMMPool.sol
contracts/                   # Foundry: ShardedCounter, IsolatedFeePool, SafeRegistry, ShardedQuota
```

## 4. Core Types (lib/types.ts)
```ts
type Severity = 'critical' | 'high' | 'medium' | 'info' | 'safe';

interface Finding {
  source: 'monadlens' | 'slither';
  ruleId: string;              // e.g. 'P1_GLOBAL_COUNTER' or slither detector id
  severity: Severity;
  line: number; column: number;
  variable?: string;
  functionName?: string;
  reachabilityWeight: number;  // 0..1, see §6
  conflictNote: string;        // e.g. 'Read-write conflict on slot of `totalSupply`'
  message: string;
  fixTemplateId?: string;      // absent for inherent contention (P8)
  tradeoffs?: string[];        // REQUIRED when fixTemplateId is set
}

interface SimulationResult {
  measured: true;
  txCount: number;
  reExecutionCount: number;
  criticalPathLength: number;
  idealParallelism: number;    // txCount / criticalPathLength (upper bound)
  avgGasUsed: number;
  recommendedGasLimit: number; // Monad bills gas LIMIT, see §9
  hotSlots: { slot: string; label?: string; readers: number; writers: number }[];
}
type SimulationState = SimulationResult | { measured: false; reason: string };
```

## 5. Detection Rules

### A. Parallelism (state contention)
| ID | Detects | Severity | Fix template |
|---|---|---|---|
| P1_GLOBAL_COUNTER | `x++`, `x += c` on a non-mapping state var in a hot function | critical | sharded counter + per-shard cap |
| P2_ARRAY_PUSH | `.push()` on storage dynamic arrays; `is ERC721Enumerable` | high | mapping + event (+ sharded count if needed) |
| P3_GLOBAL_ACCUMULATOR | `total += amount` shared across independent callers | high | store next to already-contended slot, or shard |
| P4_HOT_CONSTANT_KEY | mapping write with constant/owner key, e.g. `balanceOf[treasury] += fee` | high | accumulate separately, batch withdraw |
| P5_GLOBAL_QUOTA | global limit/quota counters | medium | per-user or sharded quota |
| P6_PACKED_SHARDS | shard arrays with < 256-bit elements (`uint128[16]`) | medium | use `uint256` or separate keys |
| P7_WRITE_PATH_READS_ALL_SHARDS | non-view function looping over all shards | high | check only own shard |
| P8_INHERENT | writes that are contended by design (same AMM pool reserves) | info | **none — explain it is expected** |

### B. Monad migration
| ID | Detects | Severity |
|---|---|---|
| M1_BLOCK_TIME_ASSUMPTION | constants like `2628000`, `2102400`, `7200`, `BLOCKS_PER_*`; interest/vesting math on `block.number` | critical |
| M2_TIMESTAMP_UNIQUENESS | `block.timestamp` used as unique id, randomness, or per-block discriminator | high |
| M3_GAS_LIMIT_BILLING | reported from simulation: measured gas vs recommended limit | info |
| M4_CONTRACT_SIZE | proxy/diamond split likely done only for 24 KB limit | info |
| M5_COLD_ACCESS_LOOPS | loops touching many distinct cold slots | medium |

### C. Parallel-safe / false-positive filters (must NOT raise warnings)
- P1–P5 findings inside admin-restricted functions are not shown and do not affect the score.
  Admin-restricted = a modifier whose name contains `owner`, `admin`, `role` or `governance`
  (`onlyOwner`, `onlyRole`, …), or a first statement `require(msg.sender == owner)` /
  `if (msg.sender != owner) revert`. Only admins can call these, so they don't contend at scale.
- State vars that are only READ in hot functions (`paused`, `owner`, oracle price) → safe.
- Mapping writes keyed by `msg.sender` → `SAFE_SENDER_KEYED`.
- Net-zero writes (e.g. `ReentrancyGuard._status`) → info only; suggest `ReentrancyGuardTransient`.
  Do not claim this causes contention unless the simulator shows it.
  Reported as `C1_REENTRANCY_GUARD` (info, no fix template): state writes inside a reentrancy-guard
  modifier — name contains `reentran` or is `lock`/`mutex`, or the variable is `_status`,
  `_guardCounter`, `locked`, `unlocked` — including the OZ 2.x `_guardCounter += 1` counter.
  P1–P5 skip these writes.
- Modifier bodies: a state write in a modifier is ONE finding per write site, however many functions
  invoke the modifier; its weight is the highest among those functions and the message lists them.
  Writes in function bodies stay one finding per function. Modifiers are resolved within the source
  file only.
- Internal calls are followed ONE level (same contract and bases, this file only):
  - an accumulator in a function that reaches P8 reserves directly, through one internal call, or
    (for an internal function) whose every caller does, is P8 (info), not P3;
  - `x = f()` where `f` is a view/internal function of the contract that reads `x` is a P3
    read-modify-write (e.g. `rewardPerTokenStored = rewardPerToken()`).

## 6. Reachability & Score
Function weight:
- external/public, no access modifier, payable or mint/swap/transfer/deposit/claim-like name → 1.0
- restricted but broad (whitelist, merkle proof) → 0.5
  A modifier counts as a restriction only if its body (or an internal function it calls) checks the
  caller (`msg.sender`, `_msgSender()`, `tx.origin` in a `require`/`assert`/`if`). Modifiers that don't
  (`nonReentrant`, `whenNotPaused`, `updateReward`) leave the function at 1.0; modifiers not defined in
  the file stay at 0.5.
- owner/role-gated → P1–P5 findings are dropped (§5C); other rules (e.g. M1, P8) use 0.05
- view/pure → 0

Severity points: critical 30, high 20, medium 10, info 0.
`score = clamp(100 − Σ(points × weight), 0, 100)`.
Label the score in the UI as **"Heuristic Parallel Score"**. Measured data comes from §7.

## 7. Dynamic Measurement (replaces any estimated ms/TPS)
Pipeline in `lib/simulator/trace.ts`:
1. Compile with `solc`, deploy to a local anvil.
2. `evm_setAutomine false`; send N txs from N distinct funded accounts; `evm_mine` → all in one block.
3. For each tx: `debug_traceTransaction` with `{ tracer: 'prestateTracer', tracerConfig: { diffMode: true } }`.
   readSet = storage keys in `pre`; writeSet = storage keys in `post` whose value changed.
   If anvil lacks support, fall back to `@ethereumjs/vm` with SLOAD/SSTORE step hooks.

OCC model in `lib/simulator/occ.ts` (pure, unit-tested):
- Txs are ordered as in the block. Tx j depends on tx i (i < j) if readSet(j) ∩ writeSet(i) ≠ ∅.
- `reExecutionCount` = number of txs with at least one dependency.
- `criticalPathLength` = longest path in the dependency DAG (count of txs).
- `idealParallelism` = txCount / criticalPathLength.

Hard rules:
- NEVER output milliseconds, TPS, or "contention probability" numbers that were not measured.
- If the dynamic layer is unavailable, return `{ measured: false, reason }` and show "Not measured".
- Always use distinct sender accounts (same sender = nonce-serialized, not contention).

## 8. Fix Templates
- Templates, not free-form regex rewrites. Show in Monaco `DiffEditor`.
- Every template ships a trade-off list shown in a "Trade-offs" panel. Required examples:
  - Sharded counter: non-sequential ids, per-shard sell-out, `totalSupply()` costs N reads.
  - Sharded quota: effective global limit ≤ LIMIT; not suitable for exact global caps.
- Invariants every sharding template must satisfy:
  - shard elements are `uint256` (one slot each);
  - the write path reads/writes only its own shard;
  - ids are unique across shards (`id = shardCount * SHARDS + shardIndex`).
- Never offer a fix for P8.
- Offer "Re-measure" after applying a fix; show before/after `criticalPathLength` and gas.

## 9. Monad Facts (verify at docs.monad.xyz before demo; keep UI copy consistent with this list)
- Optimistic parallel execution; conflicting txs are re-executed, results merged in block order.
- Block time 300 ms, observed on mainnet (https://docs.monad.xyz/ai/current-facts, checked 2026-09-26).
  Several blocks may share one `block.timestamp`.
- Gas is charged on gas LIMIT, not gas used.
- Max contract size 128 KB.
- Cold storage/account access is repriced vs Ethereum (take exact values from docs).
Do not state any other Monad performance claim in UI copy.

## 10. Coding Standard
- Logic in `lib/`, UI in `components/`. `occ.ts` and rules must be pure and testable.
- Parse with `parse(src, { loc: true, range: true, tolerant: true })` inside try/catch.
  On failure return a structured error with line/column; never crash the page.
- Each rule has at least one positive and one negative fixture in `fixtures/solidity/`.
- Run `vitest` after changing any rule, template, or simulator code.

## 11. UI Standards
- Glass panels: `border border-purple-500/20 bg-[#13111C]/80 backdrop-blur-md`.
- Buttons: hover glow with `#836EF9`.
- Finding callout must show: line number, rule id + severity, conflict type
  ("read-write conflict on slot X"), fix button (if any), trade-offs.
- Clearly distinguish **Heuristic** (static score) vs **Measured** (simulation) numbers.
- Charts show `criticalPathLength` before/after and hot slots; no fake progress animations
  that imply measured timing.

## 12. General Security Layer (Slither)
Goal: breadth from a proven tool, depth (Monad-specific) from MonadLens. We do NOT re-implement generic
security detectors.
- `lib/security/slither.ts`: write source to a temp dir, run `slither <file> --json -`, parse output,
  map each result to `Finding` with `source: 'slither'`, keep Slither's impact/confidence as severity.
- Runs only in the Node API route (`app/api/security/route.ts`, runtime `nodejs`), with a timeout.
- If Slither or solc is missing, return `{ available: false, reason }` and show a clear notice; never fail
  the whole analysis.
- UI shows two tabs: "Monad Compatibility & Parallelism" (MonadLens) and "General Security (Slither)".
- Deduplicate: if Slither and a MonadLens rule flag the same line for the same reason, show the MonadLens one.

## 13. AI Explanation Layer (optional, Gemini)
The AI never detects, scores, or measures. It only explains findings that already exist.
- Endpoint `app/api/explain/route.ts`. Input: one `Finding` + code snippet (±10 lines).
- Context: contents of `docs/monad/*.md` placed directly in the prompt (no vector DB).
- System prompt rules: explain in 3–4 sentences; rely only on provided docs and name the doc section used;
  do not invent numbers; do not contradict measured results; if docs do not cover it, say so.
- Cache by `hash(ruleId + snippet)`. Pre-generate explanations for `fixtures/demo/*` before the demo.
- Fallback: every MonadLens rule has a static explanation in `lib/explain/fallbacks.ts`, shown when the
  API fails, is rate-limited, or no key is set.
- Key only in `.env` as `GEMINI_API_KEY`; `.env` must be in `.gitignore`. Never expose it to the client.
- UI labels this text "AI explanation" and styles it separately from deterministic findings.

## 14. MCP Server (stretch)
Lets AI coding assistants call MonadLens instead of guessing.
- `mcp/server.ts` exposes tools: `analyze_contract(source)` → Finding[] + heuristic score;
  `measure_contract(source, txCount)` → SimulationState.
- Reuses `lib/` functions directly; no duplicated logic.
- Build only after the core (P1, M1, measurement, diff) works.

## 15. Deployment Architecture
Two independently deployed pieces, because they have different runtime needs.
- **Frontend + static analysis → Vercel.** The Next.js UI, the parser, and the rules all run
  client-side (or in a plain Node function) — no system processes required. Free tier is enough.
- **Measurement + Slither → a Docker container.** Anvil, solc, and Slither need to run as system
  processes; this does not work on serverless. Build one image (Node, Foundry/anvil, Python,
  Slither, a pinned solc version) and deploy it to Railway, Fly.io, or Render. The Vercel frontend
  calls this service over HTTP (`app/api/simulate`, `app/api/security`).
- The same image must also run locally via `docker compose up`. This is a Tier 1 requirement (see
  §18), not an afterthought — "works on my machine, not on the server" has to surface on day one,
  not the night before the demo.
- Demo insurance: keep a 90-second screen recording of the full flow, in case the live service is
  down during judging.

## 16. Security Boundaries (required before the measurement service is public)
Compiling and executing attacker-supplied Solidity is inherently risky. Do not expose
`app/api/simulate` or `app/api/security` on the public internet without all of:
- A per-request timeout (e.g. compile 20s, measurement 60s) and a source-size cap.
- Per-IP rate limiting.
- A clean Anvil state for every measurement request (fresh process, or `anvil_reset`) — one
  submitter's contract must never observe or affect another's.
- No outbound network access from the container at request time. Pin the solc version(s) inside
  the image; never let Slither or solc reach out to download a compiler on demand.
- Do not persist submitted source code — or if you do (e.g. for caching), say so explicitly in the UI.

## 17. Real-World Validation
- **Tier 1 (5 contracts):** run 5 real, verified contracts through MonadLens — Monad testnet
  deployments if available, otherwise well-known ones (OpenZeppelin ERC20/ERC721, a Uniswap V2
  pair). None may crash the page; a parse failure must render the structured error from §10, not a
  blank screen; note any obvious false positive here before it reaches a judge.
- **Tier 2 (15–20 contracts):** extend the same batch run and publish a "Findings" page: e.g. "this
  common pattern trips M1", "this contract has a hot slot at slot N". This is also where you find
  MonadLens's own bugs (crashes, false positives), not just where you showcase it.
- **On-chain evidence:** the Foundry template contracts (ShardedCounter, IsolatedFeePool,
  SafeRegistry, ShardedQuota) should be deployed and verified on Monad testnet, with addresses
  shown in the README and in the UI.

## 18. Build Priority

### Tier 1 — must-have (the demo does not work without these)
1. Parser + P1, P2, M1 rules + score + editor underlines — **done**
2. Measurement (anvil + trace + occ) + before/after (§7)
3. Fix templates + DiffEditor + trade-offs (§8)
4. Local `docker compose up` running the full image (§15)
5. Baseline security limits: timeout, source-size cap, per-IP rate limit, clean Anvil state per
   request (§16)
6. Deploy: Vercel frontend + container service (§15)
7. Validate against 5 real contracts — no crashes, no obvious false positives (§17 Tier 1)
8. 90-second demo screen recording

Do not start Tier 2 while any Tier 1 item is broken. In the last hours before submission: no new
features — bug fixes and demo rehearsal only.

### Tier 2 — if time remains, in this order
1. Slither tab
2. Findings page over 15–20 real contracts (§17 Tier 2)
3. Playwright end-to-end test: open page → load demo contract → findings appear → Measure →
   result shown → Fix → diff opens → re-measure. Run this after every change before a submission.
4. AI explanation (Gemini, with cache + fallbacks)
5. MCP server
6. Remaining rules (P3–P8, M2–M5)
