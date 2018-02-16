const HDWalletProvider = require('truffle-hdwallet-provider')
const mnemonic = 'salon state regret wet bounce color cactus setup tunnel prevent enough warm'

module.exports = {
  networks: {
    
    local: {
      host: 'localhost',
      port: 8545,
      network_id: '*', // Match any network id
      gas: 4712388
    },

    ropsten: {
      provider: new HDWalletProvider(mnemonic, 'https://ropsten.infura.io/'),
      network_id: 3,
      gas: 4512388
    }
  }
}
