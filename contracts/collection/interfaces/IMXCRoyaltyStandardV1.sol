// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IMXCRoyaltyStandardV1  {
    function royaltyInfo(uint256 _tokenId, uint256 _salePrice) external view returns (address receiver, uint256 royaltyAmount, address royaltyRecipient);
    // function collectionRoyaltyInfo(uint256 _salePrice) external view returns (address receiver, uint256 royaltyAmount);
}