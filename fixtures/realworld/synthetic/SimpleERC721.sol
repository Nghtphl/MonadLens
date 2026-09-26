// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Import-free, OpenZeppelin-style ERC721 fixture for analyzer validation.
contract SimpleERC721 {
    string public name;
    string public symbol;
    address public owner;
    uint256 private _nextTokenId;

    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed tokenOwner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed tokenOwner, address indexed operator, bool approved);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(string memory collectionName, string memory collectionSymbol) {
        name = collectionName;
        symbol = collectionSymbol;
        owner = msg.sender;
    }

    function approve(address approved, uint256 tokenId) external {
        address tokenOwner = ownerOf[tokenId];
        require(
            msg.sender == tokenOwner || isApprovedForAll[tokenOwner][msg.sender],
            "not authorized"
        );
        getApproved[tokenId] = approved;
        emit Approval(tokenOwner, approved, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        address tokenOwner = ownerOf[tokenId];
        require(tokenOwner == from, "wrong owner");
        require(to != address(0), "zero address");
        require(
            msg.sender == tokenOwner ||
                msg.sender == getApproved[tokenId] ||
                isApprovedForAll[tokenOwner][msg.sender],
            "not authorized"
        );

        delete getApproved[tokenId];
        balanceOf[from] -= 1;
        balanceOf[to] += 1;
        ownerOf[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function mint(address to) external onlyOwner returns (uint256 tokenId) {
        require(to != address(0), "zero address");
        tokenId = _nextTokenId;
        _nextTokenId += 1;
        balanceOf[to] += 1;
        ownerOf[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
    }
}
