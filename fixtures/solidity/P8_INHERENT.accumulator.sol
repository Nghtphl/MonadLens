// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Uniswap V2 shape: price accumulators are written in the same function as the
// reserves, so they add no contention of their own (P8, not P3). protocolFees is
// accumulated in a function that does not touch the reserves, so it stays P3.
contract P8Accumulator {
    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;
    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    uint256 public protocolFees;

    function sync(uint112 balance0, uint112 balance1) external {
        uint32 timeElapsed = uint32(block.timestamp) - blockTimestampLast;
        if (timeElapsed > 0 && reserve0 != 0 && reserve1 != 0) {
            price0CumulativeLast += uint256(reserve1) * timeElapsed / reserve0;
            price1CumulativeLast += uint256(reserve0) * timeElapsed / reserve1;
        }
        reserve0 = balance0;
        reserve1 = balance1;
        blockTimestampLast = uint32(block.timestamp);
    }

    function payFee(uint256 amount) external {
        protocolFees += amount;
    }
}
