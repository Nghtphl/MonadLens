// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

library SafeMath {
    function add(uint256 a, uint256 b) internal pure returns (uint256) { return a + b; }
    function sub(uint256 a, uint256 b) internal pure returns (uint256) { return a - b; }
}

// Synthetix StakingRewards shape: per-call amounts accumulated by assignment: all P3.
contract P3SafeMathPositive {
    using SafeMath for uint256;
    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    function stake(uint256 amount) external {
        _totalSupply = _totalSupply.add(amount);
        _balances[msg.sender] = _balances[msg.sender].add(amount);
    }

    function withdraw(uint256 amount) external {
        _totalSupply = _totalSupply.sub(amount);
        _balances[msg.sender] = _balances[msg.sender].sub(amount);
    }

    function donate(uint256 amount) external {
        _totalSupply = _totalSupply + amount;
    }
}
