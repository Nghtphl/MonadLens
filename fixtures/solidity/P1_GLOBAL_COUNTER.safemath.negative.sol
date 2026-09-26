// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

library SafeMath {
    function add(uint256 a, uint256 b) internal pure returns (uint256) { return a + b; }
    function mul(uint256 a, uint256 b) internal pure returns (uint256) { return a * b; }
}

// Same shapes that are not a global counter step: no P1.
contract P1SafeMathNegative {
    using SafeMath for uint256;
    uint256 public lastId;
    uint256 public scale;
    mapping(address => uint256) public mintsBy;

    function mint(uint256 id) external {
        lastId = id + 1; // overwrite from a parameter, not a read-modify-write of lastId
        mintsBy[msg.sender] = mintsBy[msg.sender].add(1); // sender-keyed mapping
        uint256 local = 0;
        local = local + 1; // local variable
        scale = scale.mul(2); // not an add/sub step
    }
}
