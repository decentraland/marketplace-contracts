pragma solidity ^0.4.23;

import "openzeppelin-zos/contracts/token/ERC721/ERC721Token.sol";


contract LegacyERC721 is ERC721Token {
  constructor(string name, string symbol) public {
    ERC721Token.initialize(name, symbol);
  }

  function mint(address _to, uint256 _tokenId) public {
    super._mint(_to, _tokenId);
  }
}
