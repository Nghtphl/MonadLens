// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Uniswap V2 shape, one call deep: accumulators in functions that reach the
// reserves through an internal call are P8 (expected), not P3.
contract CallsPositive {
    uint112 private reserve0;
    uint112 private reserve1;
    uint256 public totalSupply;
    uint256 public totalFees;

    function _update(uint112 balance0, uint112 balance1) private {
        reserve0 = balance0;
        reserve1 = balance1;
    }

    // Only called from mint, which calls _update.
    function _mintShares(uint256 shares) internal {
        totalSupply += shares;
    }

    function mint(uint256 shares, uint112 b0, uint112 b1) external {
        _mintShares(shares);
        _update(b0, b1);
    }

    function swap(uint256 fee, uint112 b0, uint112 b1) external {
        totalFees += fee; // same function calls _update
        _update(b0, b1);
    }
}
