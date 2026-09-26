// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract P8Positive {
    uint256 public reserve0;
    uint256 public reserve1;

    constructor() {
        reserve0 = 1000;
        reserve1 = 1000;
    }

    function swap(uint256 amountIn) external returns (uint256 amountOut) {
        amountOut = reserve1 - (reserve0 * reserve1) / (reserve0 + amountIn);
        reserve0 += amountIn;
        reserve1 -= amountOut;
    }
}
