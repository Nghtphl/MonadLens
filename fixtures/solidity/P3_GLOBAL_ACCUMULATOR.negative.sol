// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Safe pattern: fees accrue per caller, so callers touch disjoint slots.
contract P3Negative {
    mapping(address => uint256) public feesOwed;

    function swap(uint256 amountIn) external {
        feesOwed[msg.sender] += amountIn / 100;
    }
}
