// Mirrors fixtures/demo/*.sol for the in-browser demo selector (Next.js has no
// raw .sol import without a custom loader). demoContracts.test.ts fails if these drift.

export interface DemoContract {
  id: string;
  label: string;
  source: string;
}

export const DEMO_CONTRACTS: DemoContract[] = [
  {
    id: "BadNFT",
    label: "BadNFT.sol (P1 — global counter)",
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BadNFT {
    string public name = "BadNFT";
    uint256 public totalSupply;

    mapping(uint256 => address) public ownerOf;

    function mint() external {
        totalSupply++;
        ownerOf[totalSupply] = msg.sender;
    }

    function burn(uint256 tokenId) external {
        require(ownerOf[tokenId] == msg.sender, "not owner");
        delete ownerOf[tokenId];
        totalSupply -= 1;
    }
}
`,
  },
  {
    id: "BadLending",
    label: "BadLending.sol (M1 — block-time math)",
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BadLending {
    uint256 public constant BLOCKS_PER_YEAR = 2_628_000;
    uint256 public constant ANNUAL_RATE_BPS = 500;

    struct Loan {
        uint256 principal;
        uint256 openedAtBlock;
    }

    mapping(address => Loan) public loans;

    function borrow(uint256 principal) external {
        loans[msg.sender] = Loan({
            principal: principal,
            openedAtBlock: block.number
        });
    }

    function accruedInterest(address borrower) external view returns (uint256) {
        Loan memory loan = loans[borrower];
        uint256 elapsedBlocks = block.number - loan.openedAtBlock;
        return loan.principal * ANNUAL_RATE_BPS * elapsedBlocks / BLOCKS_PER_YEAR / 10_000;
    }
}
`,
  },
  {
    id: "AMMPool",
    label: "AMMPool.sol (P8 — inherent contention)",
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AMMPool {
    uint256 public reserve0;
    uint256 public reserve1;

    constructor(uint256 initialReserve0, uint256 initialReserve1) {
        reserve0 = initialReserve0;
        reserve1 = initialReserve1;
    }

    function swap(bool zeroForOne, uint256 amountIn) external returns (uint256 amountOut) {
        require(amountIn > 0, "zero input");

        if (zeroForOne) {
            amountOut = reserve1 - (reserve0 * reserve1) / (reserve0 + amountIn);
            reserve0 += amountIn;
            reserve1 -= amountOut;
        } else {
            amountOut = reserve0 - (reserve0 * reserve1) / (reserve1 + amountIn);
            reserve1 += amountIn;
            reserve0 -= amountOut;
        }

        // Every swap for this pool must update the same reserve pair. This
        // contention is inherent to preserving the pool's pricing invariant.
    }
}
`,
  },
  {
    id: "BrokenDEX",
    label: "BrokenDEX.sol (P3/P2 — fees + array push)",
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// NOTE: kept as an extra fixture (P2_ARRAY_PUSH / P3_GLOBAL_ACCUMULATOR demo).
// It is not one of CLAUDE.md §3's three canonical demo contracts
// (BadNFT.sol, BadLending.sol, AMMPool.sol) — see cleanup report TODOs.
contract BrokenDEX {
    uint256 public protocolFees;
    address[] public traders;

    mapping(address => uint256) public balances;

    function swap(uint256 amountIn) external {
        uint256 fee = amountIn / 100;
        protocolFees += fee;

        uint256 amountOut = amountIn - fee;
        balances[msg.sender] += amountOut;

        traders.push(msg.sender);
    }

    function withdrawFees(address to) external {
        uint256 amount = protocolFees;
        protocolFees = 0;
        payable(to).transfer(amount);
    }
}
`,
  },
  {
    id: "ParallelSafe",
    label: "ParallelSafe.sol (safe pattern)",
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// NOTE: kept as an extra fixture (SAFE_SENDER_KEYED / sharded-counter demo).
// It is not one of CLAUDE.md §3's three canonical demo contracts
// (BadNFT.sol, BadLending.sol, AMMPool.sol) — see cleanup report TODOs.
contract ParallelSafe {
    uint8 constant SHARD_COUNT = 16;
    uint256[SHARD_COUNT] private _shards;

    mapping(address => uint256) public balances;

    function _shardIndex(address account) private pure returns (uint8) {
        return uint8(uint256(keccak256(abi.encodePacked(account))) % SHARD_COUNT);
    }

    function increment() external {
        uint8 shard = _shardIndex(msg.sender);
        _shards[shard] += 1;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function totalCount() external view returns (uint256 total) {
        for (uint8 i = 0; i < SHARD_COUNT; i++) {
            total += _shards[i];
        }
    }
}
`,
  },
];
