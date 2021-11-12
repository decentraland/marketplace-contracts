// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";


contract ERC721TestCollection is ERC721 {
  address public creator;
  address public beneficiary;

  constructor(string memory _name, string memory _symbol) ERC721(_name, _symbol) {
  }


  function mint(address _to, uint256 _tokenId) public {
    super._mint(_to, _tokenId);
  }

  function burn(uint256 _tokenId) public {
   super. _burn(_tokenId);
  }

  function setCreator(address _creator) public {
    creator = _creator;
  }

  function setBeneficiary(address _beneficiary) public {
    beneficiary = _beneficiary;
  }

  function decodeTokenId(uint256 _tokenId) external pure returns (uint256, uint256) {
    return (_tokenId, _tokenId);
  }

  function items(uint256 _itemId) public view returns  (string memory, uint256, uint256, uint256, address, string memory, string memory) {
    if (_itemId > 0) {
      return ("", 0, 0, 0, beneficiary, "", "");
    } else {
      revert();
    }
  }


}
