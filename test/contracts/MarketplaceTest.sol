pragma solidity ^0.4.23;

import "../../contracts/marketplace/Marketplace.sol";


contract MarketplaceTest is Marketplace {
  constructor(address _acceptedToken) public {
    Marketplace.initialize(_acceptedToken);
  }
}
