/**
 * Static explanations (CLAUDE.md §13): shown when there is no GEMINI_API_KEY, the
 * API fails or is rate-limited. Every MonadLens rule has one. They explain what
 * the finding means; they never add numbers the analyzer or the simulator did
 * not produce. `section` names the docs/monad section the text relies on.
 */
export interface StaticExplanation {
  text: string;
  section: string;
}

export const STATIC_EXPLANATIONS: Record<string, StaticExplanation> = {
  P1_GLOBAL_COUNTER: {
    section: "docs/monad/parallel-execution.md § Optimistic execution",
    text:
      "Monad runs the transactions of a block in parallel, optimistically, and merges their results in block order. " +
      "When two transactions touch the same storage slot and a later one read a value an earlier one wrote, the later one is executed again. " +
      "A global counter that every call increments is read and written by every call, so calls to this function end up running one after another. " +
      "Sharding the counter spreads the writes over several slots; the trade-offs are listed with the fix.",
  },
  P2_ARRAY_PUSH: {
    section: "docs/monad/parallel-execution.md § Optimistic execution",
    text:
      "`.push()` on a storage array reads and writes the array's length slot on every call. " +
      "Under Monad's optimistic parallel execution, a transaction that read a slot an earlier transaction in the block wrote is executed again, so every push conflicts with the previous one. " +
      "Keeping the items in a mapping and emitting an event avoids the shared length slot. " +
      "If enumeration on-chain is needed, that cost has to be paid somewhere else, as the trade-offs explain.",
  },
  P3_GLOBAL_ACCUMULATOR: {
    section: "docs/monad/parallel-execution.md § Optimistic execution",
    text:
      "This total is updated by a per-call amount in every call, so every caller reads and writes the same storage slot. " +
      "Monad executes a block's transactions in parallel and re-executes any transaction that read a slot an earlier transaction wrote, so these calls serialize on the total. " +
      "Whether that matters depends on how the total is used: it can be kept per user, sharded, or left next to a slot that is already contended. " +
      "Measure the function to see how much it actually serializes.",
  },
  P8_INHERENT: {
    section: "docs/monad/parallel-execution.md § Optimistic execution",
    text:
      "Every swap on this pool must read and update the same reserves to keep its pricing correct, so these calls conflict with each other by design. " +
      "Monad keeps results identical to sequential execution by re-executing conflicting transactions, so the pool still behaves correctly; it just does not run in parallel with itself. " +
      "Sharding the reserves would break the pricing invariant, so no fix is offered. " +
      "Other pools and unrelated contracts still run in parallel with it.",
  },
  M1_BLOCK_TIME_ASSUMPTION: {
    section: "docs/monad/blocks-and-time.md § Block time and timestamps",
    text:
      "This code converts between blocks and time using Ethereum's block time. " +
      "Monad produces blocks much more often than Ethereum, so any rate, vesting schedule or lockup measured in blocks runs faster than intended. " +
      "Use `block.timestamp` differences instead of block counts. " +
      "`block.timestamp` has one-second granularity and several consecutive Monad blocks can share it, so do not use it as a unique id either.",
  },
  C1_REENTRANCY_GUARD: {
    section: "docs/monad/parallel-execution.md § Optimistic execution",
    text:
      "This is a reentrancy guard: it writes a lock variable in storage on every guarded call. " +
      "MonadLens does not count it as contention, because a lock that is set and reset within a call usually ends the call with its old value; whether it conflicts across transactions shows up only in a measurement. " +
      "OpenZeppelin's ReentrancyGuardTransient keeps the lock in transient storage (EIP-1153) instead of a storage slot. " +
      "Older guards that increment a counter change the slot on every call; measure the function to see whether it shows up as hot.",
  },
};

export function staticExplanation(ruleId: string): StaticExplanation {
  return (
    STATIC_EXPLANATIONS[ruleId] ?? {
      section: "none",
      text: `No static explanation is written for ${ruleId}. The finding text above describes what was detected.`,
    }
  );
}
