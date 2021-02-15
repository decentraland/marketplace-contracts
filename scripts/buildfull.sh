#! /bin/bash

MARKETPLACE=Marketplace.sol


OUTPUT=full

npx hardhat flatten contracts/marketplace/$MARKETPLACE > $OUTPUT/$MARKETPLACE


