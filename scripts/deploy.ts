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
  const owner = "0xc585365055A1e94f9585854C98283D7D40B5D91E"

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

  const Marketplace = await ethers.getContractFactory("MarketplaceV1")
  const marketplace = await Marketplace.deploy(
    OWNER_CUT_PER_MILLION,
    owner,
  )
  await marketplace.deployed()
  console.log('NFT Marketplace:', marketplace.address)


  // deply NFT Factory
  const NFTFactory = await ethers.getContractFactory("MXCCollectionFactoryV1");
  const nftFactory = await NFTFactory.deploy(
  )
  await nftFactory.deployed()
  console.log('NFT Factory:', nftFactory.address)


  // // // deploy NFT Token
  const NFTToken = await ethers.getContractFactory("MXCNFTTokenV1");
  const nftToken = await NFTToken.deploy(
    marketplace.address,
    marketplace.address
  )
  await nftToken.deployed()
  console.log('NFT Token:', nftToken.address)

  // // // Create NFT Collection from Factory
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

    // await run("verify:verify", {
    //   address: "0x71022f23246E4b66fe1123d373138806E8a84AB1", // Marketplace
    //   constructorArguments: [
    //         25000,
    //         "0x04451Fafe2FF1ab012aA16f9c3723e815b483055"
    //       ],
    // });
    // await new Promise((resolve) => setTimeout(resolve, 5000));

    // await run("verify:verify", {
    //   address: "0x7FF8a18D192Ab5E594705FE27c8A26B3f3C86c4b", // NFT Factory
    // });

    // await new Promise((resolve) => setTimeout(resolve, 5000));

    // await run("verify:verify", {

    //   address:"0x378307A3b265361Cd97af2293457ea6A31416D68", // NFT token
    //   constructorArguments: [
    //     "0x69403fF8e763fb99880C94745Cba6d83aB9916C7"
    //   ],
    // });

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