# Monad facts for MonadLens

Curated, short notes on Monad behavior that MonadLens relies on (CLAUDE.md §9, §13). The AI explanation
layer puts these files into its prompt and must not go beyond them; the static explanations in
`lib/explain/fallbacks.ts` cite their sections.

Everything here is paraphrased from docs.monad.xyz, retrieved 2026-09-26. Each section links its source.
Numbers are only those the source states. If the docs change, update the file and the date.

| File | Covers |
|---|---|
| `parallel-execution.md` | Optimistic parallel execution, what makes a transaction re-execute |
| `blocks-and-time.md` | Block time, `block.timestamp` granularity, finality |
| `gas.md` | Gas is charged on the gas limit |
| `contracts-and-storage.md` | Contract size limit, cold account/storage access pricing |
