#! /bin/bash

MARKETPLACE=Marketplace.sol


OUTPUT=full

npx truffle-flattener contracts/marketplace/$MARKETPLACE > $OUTPUT/$MARKETPLACE


