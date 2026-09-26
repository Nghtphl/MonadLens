// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// `x = f()` where f does not read x: a plain overwrite, not an accumulation.
contract DerivedNegative {
    uint256 public lastUpdateTime;
    uint256 public periodFinish = 100;
    uint256 public price;
    mapping(address => uint256) public rewards;

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function quote() internal pure returns (uint256) {
        return 42;
    }

    function earned(address account) public view returns (uint256) {
        return rewards[account] + 1;
    }

    function stake() external {
        lastUpdateTime = lastTimeRewardApplicable(); // does not read lastUpdateTime
        price = quote();
        rewards[msg.sender] = earned(msg.sender); // sender-keyed mapping
    }
}
