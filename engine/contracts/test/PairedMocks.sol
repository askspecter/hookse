// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract MockNFT is ERC721("Mock", "MOCK") {
    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}

/// @dev Fixed-price marketplace standing in for Seaport.
contract MockMarket {
    struct Listing { address seller; uint256 price; }
    IERC721 public immutable nft;
    mapping(uint256 => Listing) public listings;

    constructor(IERC721 nft_) { nft = nft_; }

    function list(uint256 id, uint256 price) external {
        nft.transferFrom(msg.sender, address(this), id);
        listings[id] = Listing(msg.sender, price);
    }

    function fill(uint256 id) external payable {
        Listing memory l = listings[id];
        require(msg.value == l.price, "price");
        delete listings[id];
        nft.transferFrom(address(this), msg.sender, id);
        payable(l.seller).transfer(msg.value);
    }
}

/// @dev Stand-in for the ArbSys precompile (0x64), which Hardhat does not emulate.
contract MockArbSys {
    function arbBlockNumber() external view returns (uint256) {
        return block.number;
    }

    function arbBlockHash(uint256 n) external view returns (bytes32) {
        require(n < block.number && block.number - n <= 256, "invalid block");
        return blockhash(n);
    }
}
