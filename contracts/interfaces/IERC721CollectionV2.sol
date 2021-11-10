// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;
pragma experimental ABIEncoderV2;


interface IERC721CollectionV2 {
    function creator() external view returns (address);
    function decodeTokenId(uint256 _tokenId) external view returns (uint256, uint256);
    function items(uint256 _itemId) external view returns (string memory, uint256, uint256, uint256, address, string memory, string memory);
}