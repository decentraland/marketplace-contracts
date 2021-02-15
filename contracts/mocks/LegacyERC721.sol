pragma solidity >0.4.23;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";


contract LegacyERC721 is ERC721 {
  constructor(string memory name, string memory symbol) ERC721(name, symbol) {}

  function mint(address _to, uint256 _tokenId) public {
    super._mint(_to, _tokenId);
  }
}
