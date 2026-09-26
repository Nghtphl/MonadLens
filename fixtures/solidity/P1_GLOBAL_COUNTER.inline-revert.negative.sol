// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract P1InlineRevertNegative {
    error Unauthorized();

    address public owner;
    uint256 public totalSupply;

    function mint() external {
        if (msg.sender != owner) revert Unauthorized();
        totalSupply++;
    }
}
