// SPDX-License-Identifier: MIT

pragma solidity >0.4.23;

import "./ERC721Test.sol";


contract VerifiableERC721Test is ERC721Test {
  constructor(string memory name, string memory symbol) ERC721Test(name, symbol) {}

  function verifyFingerprint(uint256 assetId, bytes memory fingerprint) public pure returns (bool) {
    return getFingerprint(assetId) == _bytesToBytes32(fingerprint);
  }

  function getFingerprint(uint256 /*assetId*/) public pure returns (bytes32) {
    return bytes32(uint256(0x1234));
  }

  function supportsInterface(bytes4 _interfaceId) public override view returns (bool) {
    // solium-disable-next-line operator-whitespace
    return super.supportsInterface(_interfaceId) ||
      _interfaceId == bytes4(keccak256("verifyFingerprint(uint256,bytes)"));
  }

  function _bytesToBytes32(bytes memory b) internal pure returns (bytes32) {
    bytes32 out;

    for (uint i = 0; i < b.length; i++) {
      out |= bytes32(b[i] & 0xFF) >> i * 8;
    }

    return out;
  }
}
