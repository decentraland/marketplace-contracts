// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

interface IRoyaltiesManager {
  function getRoyaltiesReceiver(address _contractAddress, uint256 _tokenId) external view returns (address);
}
