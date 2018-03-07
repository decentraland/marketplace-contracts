pragma solidity ^0.4.18;

contract FakeERC721 {

  event Transfer(address indexed to, uint assetId);

  address holder = address(0);
  address operator = address(0);

  function setAssetHolder(address _holder) public {
    holder = _holder;
  }

  function setApprovalForAll(address _operator, bool _approved) public {
    operator = _operator;
  }

  function ownerOf(uint256 assetId) public view returns (address) {
    return holder;
  }

  function transferFrom(address _from, address _to, uint256 _assetId) public {
    Transfer(_to, _assetId);
  }
  
  function isAuthorized(address _operator, uint256 _assetId) public view returns (bool) {
    return (_operator == holder || _operator == operator);
  }
}
