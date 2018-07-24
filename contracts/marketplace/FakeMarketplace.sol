pragma solidity ^0.4.23;

import "./Marketplace.sol";


contract FakeMarketplace is Marketplace {
  constructor(address _acceptedToken) public
  Marketplace(_acceptedToken)
  { }

  // Make internal function public
  function _isContract(address addr) public view returns (bool) {
    return super.isContract(addr);
  }
}
