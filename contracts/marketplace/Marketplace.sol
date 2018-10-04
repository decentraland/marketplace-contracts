pragma solidity ^0.4.24;

import "openzeppelin-zos/contracts/ownership/Ownable.sol";
import "openzeppelin-zos/contracts/lifecycle/Pausable.sol";
import "openzeppelin-zos/contracts/math/SafeMath.sol";
import "openzeppelin-zos/contracts/AddressUtils.sol";
import "zos-lib/contracts/migrations/Migratable.sol";


/**
 * @title Interface for contracts conforming to ERC-20
 */
contract ERC20Interface {
  function transferFrom(address from, address to, uint tokens) public returns (bool success);
}


/**
 * @title Interface for contracts conforming to ERC-721
 */
contract ERC721Interface {
  function ownerOf(uint256 _tokenId) public view returns (address _owner);
  function approve(address _to, uint256 _tokenId) public;
  function getApproved(uint256 _tokenId) public view returns (address);
  function isApprovedForAll(address _owner, address _operator) public view returns (bool);
  function safeTransferFrom(address _from, address _to, uint256 _tokenId) public;
  function supportsInterface(bytes4) public view returns (bool);
}


contract ERC721Verifiable is ERC721Interface {
  function verifyFingerprint(uint256, bytes) public view returns (bool);
}


contract Marketplace is Migratable, Ownable, Pausable {
  using SafeMath for uint256;
  using AddressUtils for address;

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

  uint256 public ownerCutPercentage;
  uint256 public publicationFeeInWei;

  bytes4 public constant InterfaceId_ValidateFingerprint = bytes4(
    keccak256("verifyFingerprint(uint256,bytes)")
  );

  /* EVENTS */
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
    address indexed winner
  );
  event OrderCancelled(
    bytes32 id,
    uint256 indexed assetId,
    address indexed seller,
    address nftAddress
  );

  event ChangedPublicationFee(uint256 publicationFee);
  event ChangedOwnerCutPercentage(uint256 ownerCutPercentage);

  /**
    * @dev Initialize this contract. Acts as a constructor
    * @param _acceptedToken - Address of the ERC20 accepted for this marketplace
    */
  function initialize(address _acceptedToken) public isInitializer("Marketplace", "0.0.1") {
    Pausable.initialize(msg.sender); // Calls ownable behind the scenes...sigh

    acceptedToken = ERC20Interface(_acceptedToken);
  }

  /**
    * @dev Sets the publication fee that's charged to users to publish items
    * @param publicationFee - Fee amount in wei this contract charges to publish an item
    */
  function setPublicationFee(uint256 publicationFee) public onlyOwner {
    publicationFeeInWei = publicationFee;

    emit ChangedPublicationFee(publicationFeeInWei);
  }

  /**
    * @dev Sets the share cut for the owner of the contract that's
    *  charged to the seller on a successful sale
    * @param _ownerCutPercentage - Share amount, from 0 to 100
    */
  function setOwnerCutPercentage(uint256 _ownerCutPercentage) public onlyOwner {
    require(_ownerCutPercentage < 100, "The owner cut should be between 0 and 100");

    ownerCutPercentage = _ownerCutPercentage;

    emit ChangedOwnerCutPercentage(ownerCutPercentage);
  }

  /**
    * @dev Creates a new order
    * @param nftAddress - Non fungible registry address
    * @param assetId - ID of the published NFT
    * @param priceInWei - Price in Wei for the supported coin
    * @param expiresAt - Duration of the order (in hours)
    */
  function createOrder(
    address nftAddress,
    uint256 assetId,
    uint256 priceInWei,
    uint256 expiresAt
  )
    public
    whenNotPaused
  {
    require(nftAddress.isContract(), "The NFT Address should be a contract");

    ERC721Interface nftRegistry = ERC721Interface(nftAddress);
    address assetOwner = nftRegistry.ownerOf(assetId);

    require(msg.sender == assetOwner, "Only the owner can create orders");
    require(
      nftRegistry.getApproved(assetId) == address(this) || nftRegistry.isApprovedForAll(assetOwner, address(this)),
      "The contract is not authorized to manage the asset"
    );
    require(priceInWei > 0, "Price should be bigger than 0");
    require(expiresAt > block.timestamp.add(1 minutes), "Expires should be bigger than 1 minute");

    bytes32 orderId = keccak256(
      abi.encodePacked(
        block.timestamp,
        assetOwner,
        assetId,
        nftAddress,
        priceInWei
      )
    );

    orderByAssetId[nftAddress][assetId] = Order({
      id: orderId,
      seller: assetOwner,
      nftAddress: nftAddress,
      price: priceInWei,
      expiresAt: expiresAt
    });

    // Check if there's a publication fee and
    // transfer the amount to marketplace owner
    if (publicationFeeInWei > 0) {
      acceptedToken.transferFrom(
        msg.sender,
        owner,
        publicationFeeInWei
      );
    }

    emit OrderCreated(
      orderId,
      assetId,
      assetOwner,
      nftAddress,
      priceInWei,
      expiresAt
    );
  }

  /**
    * @dev Cancel an already published order
    *  can only be canceled by seller or the contract owner
    * @param nftAddress - Address of the NFT registry
    * @param assetId - ID of the published NFT
    */
  function cancelOrder(address nftAddress, uint256 assetId) public whenNotPaused {
    Order memory order = orderByAssetId[nftAddress][assetId];

    require(order.id != 0, "Asset not published");
    require(order.seller == msg.sender || msg.sender == owner, "Unauthorized user");

    bytes32 orderId = order.id;
    address orderSeller = order.seller;
    address orderNftAddress = order.nftAddress;
    delete orderByAssetId[nftAddress][assetId];

    emit OrderCancelled(
      orderId,
      assetId,
      orderSeller,
      orderNftAddress
    );
  }

  /**
    * @dev Executes the sale for a published NFT and checks for the asset fingerprint
    * @param nftAddress - Address of the NFT registry
    * @param assetId - ID of the published NFT
    * @param price - Order price
    * @param fingerprint - Verification info for the asset
    */
  function safeExecuteOrder(
    address nftAddress,
    uint256 assetId,
    uint256 price,
    bytes fingerprint
  )
   public
   whenNotPaused
  {
    _executeOrder(
      nftAddress,
      assetId,
      price,
      fingerprint
    );
  }

  /**
    * @dev Executes the sale for a published NFT
    * @param nftAddress - Address of the NFT registry
    * @param assetId - ID of the published NFT
    * @param price - Order price
    */
  function executeOrder(
    address nftAddress,
    uint256 assetId,
    uint256 price
  )
   public
   whenNotPaused
  {
    _executeOrder(
      nftAddress,
      assetId,
      price,
      ""
    );
  }

  /**
    * @dev Executes the sale for a published NFT
    * @param nftAddress - Address of the NFT registry
    * @param assetId - ID of the published NFT
    * @param price - Order price
    * @param fingerprint - Verification info for the asset
    */
  function _executeOrder(
    address nftAddress,
    uint256 assetId,
    uint256 price,
    bytes fingerprint
  )
   internal
  {
    ERC721Verifiable nftRegistry = ERC721Verifiable(nftAddress);

    if (nftRegistry.supportsInterface(InterfaceId_ValidateFingerprint)) {
      require(
        nftRegistry.verifyFingerprint(assetId, fingerprint),
        "The asset fingerprint is not valid"
      );
    }
    Order memory order = orderByAssetId[nftAddress][assetId];

    require(order.id != 0, "Asset not published");

    address seller = order.seller;

    require(seller != address(0), "Invalid address");
    require(seller != msg.sender, "Unauthorized user");
    require(order.price == price, "The price is not correct");
    require(block.timestamp < order.expiresAt, "The order expired");
    require(seller == nftRegistry.ownerOf(assetId), "The seller is no longer the owner");

    uint saleShareAmount = 0;

    bytes32 orderId = order.id;
    delete orderByAssetId[nftAddress][assetId];

    if (ownerCutPercentage > 0) {
      // Calculate sale share
      saleShareAmount = price.mul(ownerCutPercentage).div(100);

      // Transfer share amount for marketplace Owner
      acceptedToken.transferFrom(
        msg.sender,
        owner,
        saleShareAmount
      );
    }

    // Transfer sale amount to seller
    acceptedToken.transferFrom(
      msg.sender,
      seller,
      price.sub(saleShareAmount)
    );

    // Transfer asset owner
    nftRegistry.safeTransferFrom(
      seller,
      msg.sender,
      assetId
    );

    emit OrderSuccessful(
      orderId,
      assetId,
      seller,
      nftAddress,
      price,
      msg.sender
    );
  }
}
