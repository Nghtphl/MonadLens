// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

library SafeMath {
    function add(uint256 a, uint256 b) internal pure returns (uint256) { return a + b; }
    function sub(uint256 a, uint256 b) internal pure returns (uint256) { return a - b; }
}

// Counter steps written as assignments: all P1.
contract P1SafeMathPositive {
    using SafeMath for uint256;
    uint256 public mintCount;
    uint256 public burnCount;

    function mint() external {
        mintCount = mintCount.add(1);
    }

    function mintTwo() external {
        mintCount = mintCount + 1;
        mintCount = 1 + mintCount;
    }

    function burn() external {
        burnCount = burnCount.sub(1);
        burnCount = burnCount - 1;
    }
}
