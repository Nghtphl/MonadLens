# Parallel execution

Source: https://docs.monad.xyz/monad-arch/execution/parallel-execution (retrieved 2026-09-26)

## Optimistic execution

- A Monad block is an ordered list of transactions, like an Ethereum block, and executing it gives the same
  result as executing the transactions one after another.
- Monad starts executing transactions before earlier transactions in the block have finished (optimistic
  execution). It records the state each transaction read and, when merging results in block order, compares
  it with what earlier transactions wrote.
- If a transaction read a value that an earlier transaction in the block changed, its result is discarded and
  it is executed again with the correct state. The docs relate this to optimistic concurrency control (OCC)
  and software transactional memory.
- Work that does not depend on state (for example signature recovery) is not repeated, and state already
  loaded stays cached, so a re-execution is cheaper than the first run.

## What this means for contracts

- Transactions that write different storage slots do not affect each other.
- Transactions that all read and write one shared slot (a global counter, a running total, pool reserves) are
  re-executed in turn, so they effectively run one after another. Correctness is never at risk; only
  parallelism is lost.
