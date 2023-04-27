import { ethers, run } from "hardhat"
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

const OWNER_CUT_PER_MILLION = 25000


/**
 * @dev Steps:
 * Deploy the Collection implementation
 * Deploy the committee with the desired members. The owner will be the DAO bridge
 * Deploy the collection Manager. The owner will be the DAO bridge
 * Deploy the forwarder. Caller Is the collection manager.
 * Deploy the collection Factory. Owner is the forwarder.
 */
async function main() {
  const owner = "0x04451Fafe2FF1ab012aA16f9c3723e815b483055"

  // const network = NETWORKS[(process.env['NETWORK'] || 'LOCALHOST') as NETWORKS]
  // if (!network) {
  //   throw ('Invalid network')
  // }

  // Deploy collection marketplace
  // let acceptedToken: string = MANA[network]

  // if (network === 'LOCALHOST') {
  //   const Mana = new ethers.ContractFactory(ManaConfig.abi, MANA_BYTECODE, ethers.provider.getSigner())
  //   const mana = await Mana.deploy()
  //   acceptedToken = mana.address
  // }

  // deploy Marketplace
  // deploy NFT Factory
  // deploy NFT Token
  // Create NFT Collection from Factory

  // const Marketplace = await ethers.getContractFactory("Marketplace")
  // const marketplace = await Marketplace.deploy(
  //   OWNER_CUT_PER_MILLION,
  //   owner,
  // )
  // await marketplace.deployed()
  // console.log('NFT Marketplace:', marketplace.address)


  // // deply NFT Factory
  // const NFTFactory = await ethers.getContractFactory("MXCCollectionFactoryV1");
  // const nftFactory = await NFTFactory.deploy(
  // )
  // await nftFactory.deployed()
  // console.log('NFT Factory:', nftFactory.address)


  // // deploy NFT Token
  // const NFTToken = await ethers.getContractFactory("MXCNFTTokenV1");
  // const nftToken = await NFTToken.deploy(
  //   marketplace.address
  // )
  // await nftToken.deployed()
  // console.log('NFT Token:', nftToken.address)

  // // Create NFT Collection from Factory
  // const nftCollection = await nftFactory.createCollection(
  //   marketplace.address,
  //   "MXC Test Collection 1",
  //   "MXC1",
  //   true,
  //   1000,
  //   owner,
  // )
  // await nftCollection.wait()
  // console.log('NFT Collection:', nftCollection.address)

  // await new Promise((resolve) => setTimeout(resolve, 9000));

  //   await run("verify:verify", {
  //     address: marketplace.address,
  //   });
  //   await new Promise((resolve) => setTimeout(resolve, 5000));

  //   await run("verify:verify", {
  //     address: nftFactory.address,
  //   });

  //   await new Promise((resolve) => setTimeout(resolve, 5000));

    await run("verify:verify", {

      address:"0xB54e41072b8a70B6fbf33a2d4f8CbabBBf5D563f",
    });

  // await new Promise((resolve) => setTimeout(resolve, 5000));

  //   await run("verify:verify", {
  //     address: nftCollection.address,
  //   });

  /*
  address _marketplaceAddress,
        string memory _name,
        string memory _symbol,
        bool _wantRoyalties, 
        uint256 _royaltyPercentage, 
        address _royaltyRecipient
  */

  
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })