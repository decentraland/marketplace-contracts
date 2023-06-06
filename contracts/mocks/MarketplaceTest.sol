// SPDX-License-Identifier: MIT

pragma solidity >0.4.23;

import "../../contracts/marketplace/MarketplaceV1.sol";


contract MarketplaceTest is MarketplaceV1 {
  constructor (
    address _acceptedToken,
    uint256 _fee,
    address _owner
  ) MarketplaceV1(

    _fee,
    _owner
  ) {

  }

  function cancelOrderNew(address nftAddress, uint256 assetId) public whenNotPaused {
    _cancelOrder(nftAddress, assetId);
  }
}
