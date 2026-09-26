// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Same write shape as an AMM, but these are fee/volume totals, not pool
// reserves: the contention is avoidable, so this is P1, not P8.
contract P8Negative {
    uint256 public totalVolume;
    uint256 public totalFees;

    function swap(uint256 amountIn) external {
        totalVolume += amountIn;
        totalFees += amountIn / 100;
    }
}
