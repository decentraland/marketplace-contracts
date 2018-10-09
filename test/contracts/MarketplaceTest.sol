pragma solidity ^0.4.23;

import "../../contracts/marketplace/Marketplace.sol";


contract MarketplaceTest is Marketplace {
  constructor(address _acceptedToken, address _legacyNFTAddress, address _owner) public {
    Marketplace.initialize(_acceptedToken, _legacyNFTAddress, _owner);
  }


  function cancelOrderNew(address nftAddress, uint256 assetId) public whenNotPaused {
    _cancelOrder(nftAddress, assetId);
  }
}
