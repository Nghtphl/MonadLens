# Contracts and storage

## Contract size

Source: https://docs.monad.xyz/developer-essentials/differences (retrieved 2026-09-26)

- Maximum contract code size: 128 KB (Ethereum: 24 KB). Maximum init code size: 256 KB (Ethereum: 48 KB).
- Consequence: contracts split into proxies or diamonds only to stay under 24 KB may not need the split.

## Cold access pricing

Sources: https://docs.monad.xyz/developer-essentials/opcode-pricing and
https://docs.monad.xyz/developer-essentials/differences (retrieved 2026-09-26)

- Cold access is repriced relative to Ethereum. Cold account access: 10100 gas (Ethereum: 2600). Cold
  storage access: 8100 gas per page (Ethereum: 2100 per slot).
- Storage slots are grouped into pages of 128 consecutive slots and warmed per page: the first `SLOAD` or
  `SSTORE` to a page pays the cold cost, and the other slots of that page are warm for the rest of the
  transaction. Layouts Solidity produces (consecutive state variables, struct fields, array elements)
  benefit without changes.
- Consequence: loops that touch many slots spread over many pages pay the cold page cost many times.
