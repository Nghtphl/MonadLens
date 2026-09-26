// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// NOTE: kept as an extra fixture (P2_ARRAY_PUSH / P3_GLOBAL_ACCUMULATOR demo).
// It is not one of CLAUDE.md §3's three canonical demo contracts
// (BadNFT.sol, BadLending.sol, AMMPool.sol) — see cleanup report TODOs.
contract BrokenDEX {
    uint256 public protocolFees;
    address[] public traders;

    mapping(address => uint256) public balances;

    function swap(uint256 amountIn) external {
        uint256 fee = amountIn / 100;
        protocolFees += fee;

        uint256 amountOut = amountIn - fee;
        balances[msg.sender] += amountOut;

        traders.push(msg.sender);
    }

    function withdrawFees(address to) external {
        uint256 amount = protocolFees;
        protocolFees = 0;
        payable(to).transfer(amount);
    }
}
