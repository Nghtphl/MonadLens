// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract P3Positive {
    uint256 public protocolFees;
    uint256 public tradeCount;

    function swap(uint256 amountIn) external {
        protocolFees += amountIn / 100;
        tradeCount += 1;
    }
}
