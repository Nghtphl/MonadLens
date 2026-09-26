# Gas

## Gas limit billing

Source: https://docs.monad.xyz/developer-essentials/differences (retrieved 2026-09-26)

- Monad charges transactions by gas limit, not gas used: the sender pays `value + gas_bid * gas_limit`.
  The docs describe this as a denial-of-service protection needed by asynchronous execution.
- Consequence: an over-generous gas limit costs real money. Set the limit close to the measured need plus a
  margin; MonadLens reports a measured average and a recommended limit.

## Per-transaction and block limits

Source: https://docs.monad.xyz/ai/current-facts (retrieved 2026-09-26)

- Per-transaction gas limit: 30M gas (protocol parameter). Block gas limit: 150M gas (observed on mainnet).
