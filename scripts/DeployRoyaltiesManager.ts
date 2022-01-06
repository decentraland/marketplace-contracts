import { ethers } from "hardhat"


enum NETWORKS {
  'MUMBAI' = 'MUMBAI',
  'MATIC' = 'MATIC',
  'GOERLI' = 'GOERLI',
  'LOCALHOST' = 'LOCALHOST',
  'BSC_TESTNET' = 'BSC_TESTNET',
}

/**
 * @dev Steps:
 * Deploy the Royalties Manager
 */
async function main() {
  const network = NETWORKS[(process.env['NETWORK'] || 'LOCALHOST') as NETWORKS]
  if (!network) {
    throw ('Invalid network')
  }

  const a = await ethers.provider.getSigner().getAddress()
  console.log(a)

  const RoyaltiesManager = await ethers.getContractFactory("RoyaltiesManager")
  const royaltiesManager = await RoyaltiesManager.deploy()

  console.log('Royalties Manager:', royaltiesManager.address)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })