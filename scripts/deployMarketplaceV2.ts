import { ethers } from "hardhat"
import * as ManaConfig from 'decentraland-mana/build/contracts/MANAToken.json'

import {
  MANA_BYTECODE
} from './utils'


enum NETWORKS {
  'MUMBAI' = 'MUMBAI',
  'MATIC' = 'MATIC',
  'GOERLI' = 'GOERLI',
  'LOCALHOST' = 'LOCALHOST',
  'BSC_TESTNET' = 'BSC_TESTNET',
}

enum MANA {
  'MUMBAI' = '0x882Da5967c435eA5cC6b09150d55E8304B838f45',
  'MATIC' = '0xA1c57f48F0Deb89f569dFbE6E2B7f46D33606fD4',
  'GOERLI' = '0xe7fDae84ACaba2A5Ba817B6E6D8A2d415DBFEdbe',
  'LOCALHOST' = '0xe7fDae84ACaba2A5Ba817B6E6D8A2d415DBFEdbe',
  'BSC_TESTNET' = '0x00cca1b48a7b41c57821492efd0e872984db5baa',
}

const FEES_COLLECTOR_CUT_PER_MILLION = 0
const ROYALTIES_CUT_PER_MILLION = 25000
const ROYALTIES_MANAGER = '0x90958D4531258ca11D18396d4174a007edBc2b42'


/**
 * @dev Steps:
 * Deploy the Marketplace V2
 */
async function main() {
  const owner = process.env['OWNER']
  const feeCollector = process.env['FEE_COLLECTOR']

  const network = NETWORKS[(process.env['NETWORK'] || 'LOCALHOST') as NETWORKS]
  if (!network) {
    throw ('Invalid network')
  }

  // Deploy collection marketplace
  let acceptedToken: string = MANA[network]

  if (network === 'LOCALHOST') {
    const Mana = new ethers.ContractFactory(ManaConfig.abi, MANA_BYTECODE, ethers.provider.getSigner())
    const mana = await Mana.deploy()
    acceptedToken = mana.address
  }

  const Marketplace = await ethers.getContractFactory("MarketplaceV2")
  const marketplace = await Marketplace.deploy(
    owner,
    feeCollector,
    acceptedToken,
    ROYALTIES_MANAGER,
    FEES_COLLECTOR_CUT_PER_MILLION,
    ROYALTIES_CUT_PER_MILLION
  )

  console.log('NFT Marketplace:', marketplace.address)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })