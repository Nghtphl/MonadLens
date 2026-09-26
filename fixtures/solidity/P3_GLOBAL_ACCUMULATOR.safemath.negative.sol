// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

library SafeMath {
    function add(uint256 a, uint256 b) internal pure returns (uint256) { return a + b; }
    function mul(uint256 a, uint256 b) internal pure returns (uint256) { return a * b; }
}

// Assignments that do not accumulate into a shared slot: no P3.
contract P3SafeMathNegative {
    using SafeMath for uint256;
    uint256 public lastDeposit;
    uint256 public multiplier;
    mapping(address => uint256) private _balances;

    function stake(uint256 amount, uint256 fee) external {
        lastDeposit = amount.add(fee); // overwrite, does not read lastDeposit
        _balances[msg.sender] = _balances[msg.sender].add(amount); // sender-keyed mapping
        multiplier = multiplier.mul(amount); // not an add/sub step
    }
}
