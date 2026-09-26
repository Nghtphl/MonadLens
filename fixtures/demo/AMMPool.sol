// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AMMPool {
    uint256 public reserve0;
    uint256 public reserve1;

    constructor(uint256 initialReserve0, uint256 initialReserve1) {
        reserve0 = initialReserve0;
        reserve1 = initialReserve1;
    }

    function swap(bool zeroForOne, uint256 amountIn) external returns (uint256 amountOut) {
        require(amountIn > 0, "zero input");

        if (zeroForOne) {
            amountOut = reserve1 - (reserve0 * reserve1) / (reserve0 + amountIn);
            reserve0 += amountIn;
            reserve1 -= amountOut;
        } else {
            amountOut = reserve0 - (reserve0 * reserve1) / (reserve1 + amountIn);
            reserve1 += amountIn;
            reserve0 -= amountOut;
        }

        // Every swap for this pool must update the same reserve pair. This
        // contention is inherent to preserving the pool's pricing invariant.
    }
}
