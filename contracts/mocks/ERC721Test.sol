// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";


contract ERC721Test is ERC721 {
  constructor(string memory _name, string memory _symbol) ERC721(_name, _symbol) {
  }


  function mint(address _to, uint256 _tokenId) public {
    super._mint(_to, _tokenId);
  }

  function burn(uint256 _tokenId) public {
   super. _burn(_tokenId);
  }
}
