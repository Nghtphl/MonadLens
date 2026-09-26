// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract M1Positive {
    uint256 constant BLOCKS_PER_MONTH = 2628000;
    uint256 constant UNRELATED_LIMIT = 6_171; // unknown literal, neutral name: must not trigger
    uint256 constant LEGACY_MONTH = 2_102_400;
    uint256 public startBlock;

    constructor() {
        startBlock = block.number;
    }

    function vestedMonths() external view returns (uint256) {
        return (block.number - startBlock) / BLOCKS_PER_MONTH;
    }
}
