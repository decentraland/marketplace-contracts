// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;


import '../interfaces/IERC721CollectionV2.sol';


contract RoyaltiesManager{

  /**
    * @notice Get the royalties receiver for an specific token
    * @param _contractAddress - contract address
    * @param _tokenId - token id
    * @return royaltiesReceiver - address of the royalties receiver
    */
  function getRoyaltiesReceiver(address _contractAddress, uint256 _tokenId) external view returns(address royaltiesReceiver) {
    bool success;
    bytes memory res;

    (success, res) = address(_contractAddress).staticcall(
        abi.encodeWithSelector(
            IERC721CollectionV2(_contractAddress).decodeTokenId.selector,
            _tokenId
        )
    );

    if (!success) {
      return royaltiesReceiver;
    }

    (uint256 itemId,) = abi.decode(res, (uint256, uint256));

    (success, res) = address(_contractAddress).staticcall(
        abi.encodeWithSelector(
            IERC721CollectionV2(_contractAddress).items.selector,
            itemId
        )
    );

    if (!success) {
      return royaltiesReceiver;
    }

    (,,,,royaltiesReceiver,,) = abi.decode(res, (string, uint256, uint256, uint256, address, string, string));

    return royaltiesReceiver;
  }
}
