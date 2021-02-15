pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";


contract ERC721Test is ERC721 {
  constructor(string memory name, string memory symbol) ERC721(name, symbol) {
  }


  function mint(address _to, uint256 _tokenId) public {
    super._mint(_to, _tokenId);
  }

  function burn(uint256 _tokenId) public {
   super. _burn(_tokenId);
  }

  function setTokenURI(uint256 _tokenId, string memory _uri) public {
    super._setTokenURI(_tokenId, _uri);
  }
}
