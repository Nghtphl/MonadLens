// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// A write inside a shared modifier is one finding per write site, weighted by
// the most reachable function that runs it. Writes in function bodies are
// still one finding per function.
contract SharedModifier {
    address public owner;
    address public distributor;
    uint256 public rewardPerTokenStored;
    uint256 public totalStaked;
    uint256 public calls;
    uint256 public adminCalls;

    function rewardPerToken() public view returns (uint256) {
        return rewardPerTokenStored + 1;
    }

    modifier updateReward() {
        rewardPerTokenStored = rewardPerToken();
        _;
    }

    modifier countCall() {
        calls += 1;
        _;
    }

    modifier countAdminCall() {
        adminCalls += 1;
        _;
    }

    modifier onlyDistributor() {
        require(msg.sender == distributor, "not distributor");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function stake(uint256 amount) external updateReward countCall {
        totalStaked += amount;
    }

    function withdraw(uint256 amount) external updateReward countCall {
        totalStaked -= amount;
    }

    function getReward() external updateReward {}

    function notifyRewardAmount() external onlyDistributor updateReward {}

    function sweep() external onlyOwner countAdminCall {}

    function rescue() external onlyOwner countAdminCall {}
}
