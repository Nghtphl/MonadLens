// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

// OpenZeppelin 2.x ReentrancyGuard (counter) and Uniswap V2's `lock`: both are
// reentrancy guards, reported as info only (CLAUDE.md §5C), never as P1.
contract GuardPositive {
    uint256 private _guardCounter = 1;
    uint256 private unlocked = 1;
    uint256 public total;

    modifier nonReentrant() {
        _guardCounter += 1;
        uint256 localCounter = _guardCounter;
        _;
        require(localCounter == _guardCounter, "ReentrancyGuard: reentrant call");
    }

    modifier lock() {
        require(unlocked == 1, "LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    function stake() external nonReentrant {}

    function withdraw() external nonReentrant {}

    function swap() external lock {}
}
