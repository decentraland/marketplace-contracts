#! /bin/bash

MARKETPLACE=Marketplace.sol
MARKETPLACEV2=MarketplaceV2.sol



OUTPUT=full

npx hardhat flatten contracts/marketplace/$MARKETPLACE > $OUTPUT/$MARKETPLACE
npx hardhat flatten contracts/marketplace/$MARKETPLACEV2 > $OUTPUT/$MARKETPLACEV2


