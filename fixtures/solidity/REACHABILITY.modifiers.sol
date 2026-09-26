// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library MerkleProof {
    function verify(bytes32[] memory, bytes32, bytes32) internal pure returns (bool) { return true; }
}

// Each function bumps the same counter; only the modifier differs.
// Modifiers that never look at the caller do not restrict access (weight 1.0);
// caller checks (whitelist, merkle, via a helper) are broad-restricted (0.5);
// admin modifiers are owner-gated, so P1 drops them (CLAUDE.md §5C).
contract ReachabilityModifiers {
    address public owner;
    bool public paused;
    bytes32 public root;
    uint256 public rewardPerTokenStored;
    uint256 public calls;
    uint256 private _guard = 1;
    mapping(address => bool) public whitelisted;

    modifier nonReentrant() {
        require(_guard == 1, "reentrant");
        _guard = 2;
        _;
        _guard = 1;
    }

    modifier whenNotPaused() {
        require(!paused, "paused");
        _;
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        _;
    }

    modifier onlyWhitelisted() {
        require(whitelisted[msg.sender], "not whitelisted");
        _;
    }

    modifier onlyProof(bytes32[] calldata proof) {
        require(MerkleProof.verify(proof, root, keccak256(abi.encodePacked(msg.sender))), "bad proof");
        _;
    }

    modifier allowed() {
        _checkAllowed();
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function rewardPerToken() public view returns (uint256) {
        return rewardPerTokenStored + 1;
    }

    function _checkAllowed() internal view {
        if (!whitelisted[msg.sender]) revert("not allowed");
    }

    function guarded() external nonReentrant { calls += 1; }                               // 1.0
    function pausable() external whenNotPaused { calls += 1; }                             // 1.0
    function rewarded() external nonReentrant updateReward(msg.sender) { calls += 1; }     // 1.0
    function listed() external onlyWhitelisted { calls += 1; }                             // 0.5
    function proven(bytes32[] calldata proof) external onlyProof(proof) { calls += 1; }    // 0.5
    function helperChecked() external allowed { calls += 1; }                              // 0.5
    function mixed() external nonReentrant onlyWhitelisted { calls += 1; }                 // 0.5
    function admin() external onlyOwner { calls += 1; }                                    // dropped
}
