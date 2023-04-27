// SPDX-License-Identifier: MIT

pragma solidity >0.4.23;

import "../../contracts/marketplace/Marketplace.sol";


contract MarketplaceTest is Marketplace {
  constructor (
    address _acceptedToken,
    uint256 _fee,
    address _owner
  ) Marketplace(

    _fee,
    _owner
  ) {

  }

  function cancelOrderNew(address nftAddress, uint256 assetId) public whenNotPaused {
    _cancelOrder(nftAddress, assetId);
  }
}
