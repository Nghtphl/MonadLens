// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Safe pattern: the "list" only ever exists in memory for the duration of
// the call, so .push() here never touches shared storage.
contract P2Negative {
    function sumEven(uint256[] calldata input) external pure returns (uint256[] memory) {
        uint256[] memory evens = new uint256[](input.length);
        uint256 count = 0;
        for (uint256 i = 0; i < input.length; i++) {
            if (input[i] % 2 == 0) {
                evens[count] = input[i];
                count++;
            }
        }
        return evens;
    }
}
