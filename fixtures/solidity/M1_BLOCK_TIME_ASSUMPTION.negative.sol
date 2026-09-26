// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Safe pattern: vesting is computed from block.timestamp deltas (seconds),
// which stay meaningful regardless of Monad's block time.
contract M1Negative {
    uint256 public constant VESTING_PERIOD_SECONDS = 30 days;
    uint256 public startTime;

    constructor() {
        startTime = block.timestamp;
    }

    function vestedPeriods() external view returns (uint256) {
        return (block.timestamp - startTime) / VESTING_PERIOD_SECONDS;
    }
}
