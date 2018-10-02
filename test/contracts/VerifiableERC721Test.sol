pragma solidity ^0.4.23;

import "./ERC721Test.sol";


contract VerifiableERC721Test is ERC721Test {
  constructor(string name, string symbol) public
  ERC721Test(name, symbol) {}

  function verifyFingerprint(uint256 assetId, bytes fingerprint) public pure returns (bool) {
    return getFingerprint(assetId) == _bytesToBytes32(fingerprint);
  }

  function getFingerprint(uint256 /*assetId*/) public pure returns (bytes32) {
    return 0x1234;
  }

  function _supportsInterface(bytes4 _interfaceId) internal view returns (bool) {
    // solium-disable-next-line operator-whitespace
    return super._supportsInterface(_interfaceId) ||
      _interfaceId == bytes4(keccak256("verifyFingerprint(uint256,bytes)"));
  }

  function _bytesToBytes32(bytes b) internal pure returns (bytes32) {
    bytes32 out;

    for (uint i = 0; i < b.length; i++) {
      out |= bytes32(b[i] & 0xFF) >> i.mul(8);
    }

    return out;
  }
}
