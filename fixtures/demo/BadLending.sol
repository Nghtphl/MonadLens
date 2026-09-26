// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BadLending {
    uint256 public constant BLOCKS_PER_YEAR = 2_628_000;
    uint256 public constant ANNUAL_RATE_BPS = 500;

    struct Loan {
        uint256 principal;
        uint256 openedAtBlock;
    }

    mapping(address => Loan) public loans;

    function borrow(uint256 principal) external {
        loans[msg.sender] = Loan({
            principal: principal,
            openedAtBlock: block.number
        });
    }

    function accruedInterest(address borrower) external view returns (uint256) {
        Loan memory loan = loans[borrower];
        uint256 elapsedBlocks = block.number - loan.openedAtBlock;
        return loan.principal * ANNUAL_RATE_BPS * elapsedBlocks / BLOCKS_PER_YEAR / 10_000;
    }
}
