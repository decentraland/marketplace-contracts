// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./MXCCollectionTokenV1.sol";
contract MXCCollectionFactoryV1 is Ownable {
    MXCCollectionTokenV1[] public collectionAddressByIndex;
    event collection(address collectionAddress, string name, address owner, string symbol);
    constructor() {
    }
    function createCollection(
        address _marketplaceAddress,
        string memory _name,
        string memory _symbol,
        bool _wantRoyalties, 
        uint256 _royaltyPercentage, 
        address _royaltyRecipient,
        address _lockingToken
    ) external  {
        MXCCollectionTokenV1 newCollection = new MXCCollectionTokenV1(
            _marketplaceAddress,
            _name,
            _symbol, 
            msg.sender,
            _wantRoyalties,
            _royaltyPercentage,
            _royaltyRecipient,
            _lockingToken
        );
        collectionAddressByIndex.push(newCollection);
        emit collection(address(newCollection), _name, msg.sender, _symbol);
    }
}
