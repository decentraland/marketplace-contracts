pragma solidity ^0.4.18;

import "erc821/contracts/FullAssetRegistry.sol";

contract FakeERC721 is FullAssetRegistry {

  function setAssetHolder(address _holder, uint256 assetId) public {
    _generate(assetId, _holder);
  }
}
