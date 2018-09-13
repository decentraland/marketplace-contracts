pragma solidity ^0.4.23;

import "./FakeERC721.sol";


contract FakeVerifiableERC721 is FakeERC721 {
  constructor(string name, string symbol) public
  FakeERC721(name, symbol)
  {
    _registerInterface(bytes4(keccak256("verifyFingerprint(uint256,bytes)")));
  }

  function verifyFingerprint(uint256 assetId, bytes fingerprint) public pure returns (bool) {
    return getFingerprint(assetId) == _bytesToBytes32(fingerprint);
  }

  function getFingerprint(uint256 /*assetId*/) public pure returns (bytes32) {
    return 0x1234;
  }

  function _bytesToBytes32(bytes b) internal pure returns (bytes32) {
    bytes32 out;

    for (uint i = 0; i < b.length; i++) {
      out |= bytes32(b[i] & 0xFF) >> i.mul(8);
    }

    return out;
  }
}
