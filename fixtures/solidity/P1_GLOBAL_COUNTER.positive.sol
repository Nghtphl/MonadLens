// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract P1Positive {
    uint256 public totalSupply;

    function mint() external {
        totalSupply++;
    }
}
