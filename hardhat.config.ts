require('babel-register')
require('babel-polyfill')
require('dotenv').config()

import '@nomiclabs/hardhat-truffle5'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-etherscan'
import 'decentraland-contract-plugins/dist/src/mana/tasks/load-mana'
import '@nomiclabs/hardhat-web3'

import { getDeployParams } from './scripts/utils'

module.exports = {
  defaultNetwork: 'hardhat',
  solidity: {
    compilers: [
      {
        version: '0.7.6',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
        },
      },
      {
        version: '0.8.10',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      blockGasLimit: 10000000,
      gas: 10000000,
    },
    local: {
      url: 'http://127.0.0.1:8545',
      blockGasLimit: 10000000,
      gas: 10000000,
      network_id: '*', // eslint-disable-line camelcase
    },
    mxc: {
      url: 'https://wannsee-rpc.mxc.com',
      accounts: ["4c60b210750d8125305ba772a9cac928dc80ad5d04b7e20045c156f4a1b5bae5"],
      // gas: 10000000,
      // gasPrice: 1000000000,
      // network_id: 5, // eslint-disable-line camelcase
    },
    polygontestnet: {
      url: `https://rpc.ankr.com/polygon_mumbai`,
      accounts: ["272359c3e584dbf6dfcc755fffc53e5970b16020ca99e025071867014565cffb"],
    },
    deploy: getDeployParams(),
  },
  gasReporter: {
    chainId: 1,
    enabled: !!process.env.REPORT_GAS === true,
    currency: 'USD',
    gasPrice: 21,
    showTimeSpent: true,
  },
  etherscan: {
    apiKey: "4QP4X5HSS9CPYVH88CN1J4A84A5A8SRYEU"
  },



}
