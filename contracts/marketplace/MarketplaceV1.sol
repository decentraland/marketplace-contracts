// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./MarketplaceStorage.sol";
import "../commons/Ownable.sol";
import "../commons/Pausable.sol";
import "../commons/ContextMixin.sol";
import "../commons/NativeMetaTransaction.sol";


contract MarketplaceV1 is Ownable, Pausable, MarketplaceStorage, NativeMetaTransaction {
  using SafeMath for uint256;
  using Address for address;

  /**
    * @dev Initialize this contract. Acts as a constructor
    * @param _ownerCutPerMillion - owner cut per million

    */
  constructor (
    // address _acceptedToken,
    uint256 _ownerCutPerMillion,
    address _owner
  )  {
    // EIP712 init
    _initializeEIP712('MXC Marketplace', '1');

    // Fee init
    setOwnerCutPerMillion(_ownerCutPerMillion);

    require(_owner != address(0), "Invalid owner");
    transferOwnership(_owner);

 }


  /**
    * @dev Sets the publication fee that's charged to users to publish items
    * @param _publicationFee - Fee amount in wei this contract charges to publish an item
    */
  function setPublicationFee(uint256 _publicationFee) external onlyOwner {
    publicationFeeInWei = _publicationFee;
    emit ChangedPublicationFee(publicationFeeInWei);
  }

  /**
    * @dev Sets the share cut for the owner of the contract that's
    *  charged to the seller on a successful sale
    * @param _ownerCutPerMillion - Share amount, from 0 to 999,999
    */
  function setOwnerCutPerMillion(uint256 _ownerCutPerMillion) public onlyOwner {
    require(_ownerCutPerMillion < 1000000, "The owner cut should be between 0 and 999,999");

    ownerCutPerMillion = _ownerCutPerMillion;
    emit ChangedOwnerCutPerMillion(ownerCutPerMillion);
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
    _createOrder(
      nftAddress,
      assetId,
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
    _cancelOrder(nftAddress, assetId);
  }

  /**
    * @dev Executes the sale for a published NFT
    * @param nftAddress - Address of the NFT registry
    * @param assetId - ID of the published NFT
    */
  function executeOrder(
    address nftAddress,
    uint256 assetId
  )
   public
   payable
   whenNotPaused
  {
     _requireERC721(nftAddress);

    ERC721Verifiable nftRegistry = ERC721Verifiable(nftAddress);
    Order memory order = orderByAssetId[nftAddress][assetId];
    require(order.id != 0, "Asset not published");
    // require(order.seller != address(0), "Invalid address");
    require(order.seller != _msgSender(), "Unauthorized user");
    require(order.price == msg.value, "The price is not correct");
    require(block.timestamp < order.expiresAt, "The order expired");
    // require(order.seller == nftRegistry.ownerOf(assetId), "The seller is no longer the owner");

    uint saleShareAmount = 0;

    // bytes32 orderId = order.id;
    delete orderByAssetId[nftAddress][assetId];

    if (ownerCutPerMillion > 0) {
      // Calculate sale share
      saleShareAmount = order.price.mul(ownerCutPerMillion).div(1000000);

      (bool sentOwnerCut, bytes memory sentOwnerCutdata) = owner().call{value: saleShareAmount}("");
      require(sentOwnerCut, "Transfering the cut to the Marketplace owner failed");
    }

    (address firstOwner, uint256 royaltyAmount, address royaltyRecipient) = nftRegistry.royaltyInfo(assetId, order.price.sub(saleShareAmount));
    // Royalty payment
    if(firstOwner != order.seller && royaltyAmount > 0 && royaltyRecipient != address(0)) {
      (bool sentRoyalty, bytes memory sentRoyaltydata) = royaltyRecipient.call{value: royaltyAmount}("");
      require(sentRoyalty, "Transfering the royalty to the royalty recipient failed");
    }

    (bool sent, bytes memory data) = order.seller.call{value: (order.price.sub(saleShareAmount).sub(royaltyAmount))}("");
    require(sent, "Transfering the sale amount to the seller failed");
    
    _executeOrder(
     nftRegistry, 
     assetId,    
     order,
     _msgSender(),
     address(nftAddress)
    );
  }

  /**
    * @dev Creates a new order
    * @param nftAddress - Non fungible registry address
    * @param assetId - ID of the published NFT
    * @param priceInWei - Price in Wei for the supported coin
    * @param expiresAt - Duration of the order (in hours)
    */
  function _createOrder(
    address nftAddress,
    uint256 assetId,
    uint256 priceInWei,
    uint256 expiresAt
  )
    internal
  {
    _requireERC721(nftAddress);

    address sender = _msgSender();

    ERC721Interface nftRegistry = ERC721Interface(nftAddress);
    address assetOwner = nftRegistry.ownerOf(assetId);

    require(sender == assetOwner, "Only the owner can create orders");
    require(priceInWei > 0, "Price should be bigger than 0");
    require(expiresAt > block.timestamp.add(1 minutes), "Publication should be more than 1 minute in the future");

    nftRegistry.transferFrom(assetOwner, address(this), assetId);

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
  function _cancelOrder(address nftAddress, uint256 assetId) internal returns (Order memory) {
    address sender = _msgSender();
    Order memory order = orderByAssetId[nftAddress][assetId];

    require(order.id != 0, "Asset not published");
    require(order.seller == sender || sender == owner(), "Unauthorized user");

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

    return order;
  }

  
  function _executeOrder(
    ERC721Verifiable nftRegistry,
    uint256 assetId,
    Order memory order, 
    address sender,
    address nftAddress
  )
   internal 
  {
    // Transfer asset owner
    nftRegistry.safeTransferFrom(
      address(this),
      sender,
      assetId
    );

    emit OrderSuccessful(
      order.id,
      assetId,
      order.seller,
      nftAddress,
      order.price,
      sender
    );
  }

  function _requireERC721(address nftAddress) internal view {
    require(nftAddress.isContract(), "The NFT Address should be a contract");

    ERC721Interface nftRegistry = ERC721Interface(nftAddress);
    require(
      nftRegistry.supportsInterface(ERC721_Interface),
      "The NFT contract has an invalid ERC721 implementation"
    );
  }
}
