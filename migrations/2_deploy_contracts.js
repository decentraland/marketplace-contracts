var MarketPlace = artifacts.require("./Marketplace.sol");

module.exports = function(deployer) {
  deployer.deploy(MarketPlace);
};
