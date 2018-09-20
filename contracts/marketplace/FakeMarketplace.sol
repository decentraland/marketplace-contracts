pragma solidity ^0.4.23;

import "./Marketplace.sol";


contract FakeMarketplace is Marketplace {
  constructor(address _acceptedToken) public
  Marketplace(_acceptedToken)
  { }
}
