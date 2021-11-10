// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;


/**
 * @title Interface for contracts conforming to ERC-20
 */
interface ERC20Interface {
  function transferFrom(address from, address to, uint tokens) external returns (bool success);
}


/**
 * @title Interface for contracts conforming to ERC-721
 */
interface ERC721Interface {
  function ownerOf(uint256 _tokenId) external view returns (address _owner);
  function approve(address _to, uint256 _tokenId) external;
  function getApproved(uint256 _tokenId) external view returns (address);
  function isApprovedForAll(address _owner, address _operator) external view returns (bool);
  function safeTransferFrom(address _from, address _to, uint256 _tokenId) external;
  function supportsInterface(bytes4) external view returns (bool);
}


interface ERC721Verifiable is ERC721Interface {
  function verifyFingerprint(uint256, bytes memory) external view returns (bool);
}


contract MarketplaceStorage {
  ERC20Interface public acceptedToken;

  struct Order {
    // Order ID
    bytes32 id;
    // Owner of the NFT
    address seller;
    // NFT registry address
    address nftAddress;
    // Price (in wei) for the published item
    uint256 price;
    // Time when this sale ends
    uint256 expiresAt;
  }

  // From ERC721 registry assetId to Order (to avoid asset collision)
  mapping (address => mapping(uint256 => Order)) public orderByAssetId;

  uint256 public ownerCutPerMillion;
  uint256 public publicationFeeInWei;

  bytes4 public constant InterfaceId_ValidateFingerprint = bytes4(
    keccak256("verifyFingerprint(uint256,bytes)")
  );

  bytes4 public constant ERC721_Interface = bytes4(0x80ac58cd);

  // EVENTS
  event OrderCreated(
    bytes32 id,
    uint256 indexed assetId,
    address indexed seller,
    address nftAddress,
    uint256 priceInWei,
    uint256 expiresAt
  );
  event OrderSuccessful(
    bytes32 id,
    uint256 indexed assetId,
    address indexed seller,
    address nftAddress,
    uint256 totalPrice,
    address indexed buyer
  );
  event OrderCancelled(
    bytes32 id,
    uint256 indexed assetId,
    address indexed seller,
    address nftAddress
  );

  event ChangedPublicationFee(uint256 publicationFee);
  event ChangedOwnerCutPerMillion(uint256 ownerCutPerMillion);
}
