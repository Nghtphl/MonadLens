// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Modifiers that must not produce contention findings.
contract ModifierNegative {
    address public owner;
    bool public paused;
    uint256 public adminCalls;
    uint256 public unusedCalls;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        adminCalls += 1; // only the owner runs this (CLAUDE.md §5C)
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "paused"); // read only
        _;
    }

    modifier countUnused() {
        unusedCalls += 1; // no function uses this modifier
        _;
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
    }

    function deposit() external payable whenNotPaused {}
}
