// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Not reentrancy guards: a call counter in an ordinary modifier (that is P1),
// and a guard modifier that no function uses.
contract GuardNegative {
    uint256 public calls;
    uint256 private _status = 1;

    modifier countCall() {
        calls += 1;
        _;
    }

    modifier nonReentrant() {
        _status = 2;
        _;
        _status = 1;
    }

    function ping() external countCall {}
}
