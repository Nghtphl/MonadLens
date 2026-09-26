# Blocks and time

## Block time and timestamps

Sources: https://docs.monad.xyz/ai/current-facts and https://docs.monad.xyz/developer-essentials/summary
(retrieved 2026-09-26)

- Monad mainnet block time: 300 ms, as observed on mainnet (the docs give a mean of about 302 ms in
  September 2026). Ethereum's is about 12 s.
- `block.timestamp` (the `TIMESTAMP` opcode) is a Unix timestamp in seconds, as on Ethereum. With blocks
  every 300 ms, 3–4 consecutive blocks will likely have the same timestamp.
- Consequences: constants such as "blocks per year" computed for Ethereum are wrong on Monad; time-based
  math should use `block.timestamp` differences; `block.timestamp` is not unique per block and must not be
  used as an id or randomness.

## Finality

Source: https://docs.monad.xyz/ai/current-facts (retrieved 2026-09-26)

- Speculative finality after 1 slot (300 ms); finality after 2 slots (600 ms), per MonadBFT.
