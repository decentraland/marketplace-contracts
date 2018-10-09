require('dotenv').config()

const HDWalletProvider = require('truffle-hdwallet-provider')

const providerWithMnemonic = (mnemonic, rpcEndpoint) =>
  new HDWalletProvider(mnemonic, rpcEndpoint)

const infuraProvider = network =>
  providerWithMnemonic(
    process.env.MNEMONIC || '',
    `https://${network}.infura.io/${process.env.INFURA_API_KEY}`
  )

const ropstenProvider = process.env.SOLIDITY_COVERAGE
  ? undefined
  : infuraProvider('ropsten')

module.exports = {
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
  networks: {
    local: {
      host: 'localhost',
      port: 9545,
      gas: 6721975,
      network_id: '*' // eslint-disable-line camelcase
    },
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*' // eslint-disable-line camelcase
    },
    ropsten: {
      host: 'localhost',
      port: 8545,
      network_id: 3,
      gas: 30000000
    },
    infura_ropsten: {
      provider: ropstenProvider,
      network_id: 3 // eslint-disable-line camelcase
    },
    coverage: {
      host: 'localhost',
      network_id: '*', // eslint-disable-line camelcase
      port: 8555,
      gas: 0xfffffffffff,
      gasPrice: 0x01
    },
    ganache: {
      host: 'localhost',
      port: 8545,
      network_id: '*' // eslint-disable-line camelcase
    }
  }
}
