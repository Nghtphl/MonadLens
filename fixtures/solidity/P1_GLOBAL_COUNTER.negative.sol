// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Safe pattern: the counter lives in a mapping keyed by msg.sender, so
// concurrent callers touch disjoint slots instead of one shared counter.
contract P1Negative {
    mapping(address => uint256) public counts;

    function increment() external {
        counts[msg.sender]++;
    }
}
