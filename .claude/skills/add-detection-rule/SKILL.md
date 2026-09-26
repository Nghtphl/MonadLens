---
name: add-detection-rule
description: Use when adding or changing a MonadLens detection rule (P*, M* ids) in lib/analyzer/rules. Covers the Rule interface, reachability weighting, fixtures and tests.
---

# Adding a detection rule

1. Pick an id from CLAUDE.md §5 (or add a new row there first).
2. Create `lib/analyzer/rules/<id>.ts` exporting a `Rule`:
   ```ts
   export const rule: Rule = {
     id: 'P1_GLOBAL_COUNTER',
     severity: 'critical',
     check(ctx: AnalysisContext): Finding[] { /* walk ctx.ast, use ctx.symbols */ },
   };
   ```
   - Use `ctx.symbols` to know which functions write which state vars.
   - Set `reachabilityWeight` from `ctx.reachability.weightOf(fn)`.
   - Always set `reachabilityWeight` via `weightOfFunction(fn)` (`lib/analyzer/reachability.ts`).
     For P1–P5, `analyzeSolidityCode` drops findings in admin-restricted functions (CLAUDE.md §5C);
     other rules keep them at weight 0.05. view/pure get 0.
3. Register it in `lib/analyzer/rules/index.ts`.
4. Add fixtures:
   - `fixtures/solidity/<id>.positive.sol` + `.expected.json` (must produce the finding)
   - `fixtures/solidity/<id>.negative.sol` + `.expected.json` (similar code that must NOT trigger,
     e.g. the same counter kept in a `msg.sender`-keyed mapping)
5. If the rule has a fix, add a template in `lib/fixer/templates/` with a non-empty `tradeoffs` list.
6. Run `npx vitest run`.
