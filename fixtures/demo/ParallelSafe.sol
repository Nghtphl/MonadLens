// SPDX-License-Identifier: MIT
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
