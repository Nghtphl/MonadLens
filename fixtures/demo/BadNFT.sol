// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BadNFT {
    string public name = "BadNFT";
    uint256 public totalSupply;

    mapping(uint256 => address) public ownerOf;

    function mint() external {
        totalSupply++;
        ownerOf[totalSupply] = msg.sender;
    }

    function burn(uint256 tokenId) external {
        require(ownerOf[tokenId] == msg.sender, "not owner");
        delete ownerOf[tokenId];
        totalSupply -= 1;
    }
}
