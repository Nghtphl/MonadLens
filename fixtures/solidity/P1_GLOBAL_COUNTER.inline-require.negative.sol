// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract P1InlineRequireNegative {
    address public owner;
    uint256 public totalSupply;

    function mint() external {
        require(msg.sender == owner, "not owner");
        totalSupply++;
    }
}
