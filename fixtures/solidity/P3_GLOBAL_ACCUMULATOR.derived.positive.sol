// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Synthetix StakingRewards shape: `x = f()` where f reads x is a read-modify-write.
contract DerivedPositive {
    uint256 public rewardPerTokenStored;
    uint256 public rewardRate = 1;
    uint256 public checkpoint;

    function rewardPerToken() public view returns (uint256) {
        return rewardPerTokenStored + rewardRate;
    }

    function _nextCheckpoint() internal view returns (uint256) {
        return checkpoint + 1;
    }

    modifier updateReward() {
        rewardPerTokenStored = rewardPerToken();
        _;
    }

    function stake() external updateReward {}

    function poke() external {
        checkpoint = _nextCheckpoint();
    }
}
