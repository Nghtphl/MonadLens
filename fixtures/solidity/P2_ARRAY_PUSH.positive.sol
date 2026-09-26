// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract P2Positive {
    address[] public traders;

    function record() external {
        traders.push(msg.sender);
    }
}
