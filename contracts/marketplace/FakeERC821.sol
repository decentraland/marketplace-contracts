pragma solidity ^0.4.18;

contract FakeERC821 {

  event Transfer(address indexed to, uint tokens);

  address holder = address(0);

  function setAssetHolder(address _holder) {
    holder = _holder;
  }

  function holderOf(uint256 assetId) public view returns (address) {
    return holder;
  }

  function transfer(address _to, uint256 _assetId) public {
    Transfer(_to, _assetId);
  }
  
  function isApprovedFor(address operator, uint256 assetId) public view returns (bool) {
    return (holder == operator);
  }
}
