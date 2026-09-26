// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract P1AdminModifiersNegative {
    uint256 public ownerCount;
    uint256 public roleCount;
    uint256 public adminCount;
    uint256 public governanceCount;
    address[] public queuedAccounts;

    modifier onlyOwner() {
        _;
    }

    modifier onlyRole(bytes32) {
        _;
    }

    modifier onlyAdmin() {
        _;
    }

    modifier governanceExecutor() {
        _;
    }

    function ownerWrite() external onlyOwner {
        ownerCount++;
        queuedAccounts.push(msg.sender);
    }

    function roleWrite() external onlyRole(keccak256("MINTER_ROLE")) {
        roleCount++;
    }

    function adminWrite() external onlyAdmin {
        adminCount++;
    }

    function governanceWrite() external governanceExecutor {
        governanceCount++;
    }
}
