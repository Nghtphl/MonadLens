// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Accumulators that stay P3: a helper also called from a path that never
// touches the reserves, and a token with no reserves at all (OZ ERC20 shape).
contract CallsNegative {
    uint112 private reserve0;
    uint112 private reserve1;
    uint256 public totalSupply;

    function _update(uint112 balance0, uint112 balance1) private {
        reserve0 = balance0;
        reserve1 = balance1;
    }

    function _mintShares(uint256 shares) internal {
        totalSupply += shares; // P3: donate() reaches this without the reserves
    }

    function mint(uint256 shares, uint112 b0, uint112 b1) external {
        _mintShares(shares);
        _update(b0, b1);
    }

    function donate(uint256 shares) external {
        _mintShares(shares);
    }
}

contract PlainToken {
    uint256 private _totalSupply;

    function _update(address from, uint256 value) internal {
        if (from == address(0)) {
            _totalSupply += value; // P3: no reserves anywhere
        }
    }

    function mint(uint256 value) external {
        _update(address(0), value);
    }
}
