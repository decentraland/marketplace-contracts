// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";


interface IERC721Verifiable is IERC721 {
  function verifyFingerprint(uint256, bytes memory) external view returns (bool);
}
