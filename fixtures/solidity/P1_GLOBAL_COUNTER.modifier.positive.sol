// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// State writes inside modifiers count for every function that uses them,
// with that function's reachability weight.
contract ModifierPositive {
    uint256 public calls;
    uint256 public volume;

    modifier countCall() {
        calls += 1;
        _;
    }

    modifier trackVolume(uint256 amount) {
        volume = volume + amount;
        _;
    }

    function ping() external countCall {}

    function trade(uint256 amount) external trackVolume(amount) {}
}
