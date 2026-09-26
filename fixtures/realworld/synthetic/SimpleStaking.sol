// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Import-free staking fixture with timestamp-based reward accrual.
contract SimpleStaking {
    uint256 public constant REWARD_RATE_PER_SECOND = 1e12;
    uint256 public totalStaked;

    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public rewards;
    mapping(address => uint256) public lastUpdatedAt;

    event Staked(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event RewardPaid(address indexed account, uint256 reward);

    function stake() external payable {
        require(msg.value > 0, "zero stake");
        _accrue(msg.sender);
        stakedBalance[msg.sender] += msg.value;
        totalStaked += msg.value;
        emit Staked(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _accrue(msg.sender);
        uint256 balance = stakedBalance[msg.sender];
        require(balance >= amount, "stake exceeded");
        stakedBalance[msg.sender] = balance - amount;
        totalStaked -= amount;
        payable(msg.sender).transfer(amount);
        emit Withdrawn(msg.sender, amount);
    }

    function claimReward() external {
        _accrue(msg.sender);
        uint256 reward = rewards[msg.sender];
        rewards[msg.sender] = 0;
        payable(msg.sender).transfer(reward);
        emit RewardPaid(msg.sender, reward);
    }

    function earned(address account) external view returns (uint256) {
        uint256 elapsed = block.timestamp - lastUpdatedAt[account];
        return rewards[account] + stakedBalance[account] * elapsed * REWARD_RATE_PER_SECOND / 1e18;
    }

    function _accrue(address account) internal {
        uint256 updatedAt = lastUpdatedAt[account];
        if (updatedAt != 0) {
            uint256 elapsed = block.timestamp - updatedAt;
            rewards[account] +=
                stakedBalance[account] * elapsed * REWARD_RATE_PER_SECOND / 1e18;
        }
        lastUpdatedAt[account] = block.timestamp;
    }

    receive() external payable {}
}
