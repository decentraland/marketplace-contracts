// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;


import '../interfaces/IERC721CollectionV2.sol';


contract RoyaltiesManager{

  constructor() {}

  /**
    * @notice Get the royalties receiver for an specific token
    * @dev It tries to get the item beneficiary. If it is the ZERO address, will try to get the creator
    * @param _contractAddress - contract address
    * @param _tokenId - token id
    * @return royaltiesReceiver - address of the royalties receiver
    */
  function getRoyaltiesReceiver(address _contractAddress, uint256 _tokenId) external view returns(address royaltiesReceiver) {
    bool success;
    bytes memory res;

    (success, res) = _contractAddress.staticcall(
        abi.encodeWithSelector(
            IERC721CollectionV2(_contractAddress).decodeTokenId.selector,
            _tokenId
        )
    );

    if (!success) {
      return royaltiesReceiver;
    }

    (uint256 itemId,) = abi.decode(res, (uint256, uint256));

    (success, res) = _contractAddress.staticcall(
        abi.encodeWithSelector(
            IERC721CollectionV2(_contractAddress).items.selector,
            itemId
        )
    );

    if (success) {
      // Get item beneficiary
      (,,,,royaltiesReceiver,,) = abi.decode(res, (string, uint256, uint256, uint256, address, string, string));
    }

    if (royaltiesReceiver == address(0)) {
      // If still the zero address, use the creator
       (success, res) = _contractAddress.staticcall(
        abi.encodeWithSelector(
            IERC721CollectionV2(_contractAddress).creator.selector
        ));

        if (!success) {
          return royaltiesReceiver;
        }

        royaltiesReceiver = abi.decode(res, (address));
    }

    return royaltiesReceiver;
  }
}
