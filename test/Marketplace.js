const BigNumber = web3.BigNumber

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const abiDecoder = require('abi-decoder')

const EVMRevert = 'VM Exception while processing transaction: revert'

const Marketplace = artifacts.require('MarketplaceTest')
const ERC20Token = artifacts.require('ERC20Test')
const ERC721Token = artifacts.require('ERC721Test')
const VerfiableERC721Token = artifacts.require('VerifiableERC721Test')
const LegacyERC721 = artifacts.require('LegacyERC721')

const { increaseTime, duration } = require('./helpers/increaseTime')

function checkOrderCreatedLogs(
  logs,
  assetId,
  seller,
  nftAddress,
  priceInWei,
  expiresAt
) {
  logs.forEach((log, index) => {
    if (index === 0) {
      log.event.should.be.eq('OrderCreated')
      log.args.nftAddress.should.be.equal(nftAddress, 'nftAddress')
    } else {
      log.event.should.be.eq('AuctionCreated')
    }
    log.args.assetId.should.be.bignumber.equal(assetId, 'assetId')
    log.args.seller.should.be.equal(seller, 'seller')
    log.args.priceInWei.should.be.bignumber.equal(priceInWei, 'priceInWei')
    log.args.expiresAt.should.be.bignumber.equal(expiresAt, 'expiresAt')
  })
}

function checkOrderCancelledLogs(logs, assetId, seller, nftAddress) {
  logs.forEach((log, index) => {
    if (index === 0) {
      log.event.should.be.eq('OrderCancelled')
      log.args.nftAddress.should.be.equal(nftAddress, 'nftAddress')
    } else {
      log.event.should.be.eq('AuctionCancelled')
    }
    log.args.assetId.should.be.bignumber.equal(assetId, 'assetId')
    log.args.seller.should.be.equal(seller, 'seller')
  })
}

function checkOrderSuccessfulLogs(
  logs,
  assetId,
  seller,
  nftAddress,
  totalPrice,
  buyer
) {
  logs.forEach((log, index) => {
    if (index === 0) {
      log.event.should.be.eq('OrderSuccessful')
      log.args.nftAddress.should.be.equal(nftAddress, 'nftAddress')
      log.args.buyer.should.be.equal(buyer, 'buyer')
    } else {
      log.event.should.be.eq('AuctionSuccessful')
      log.args.winner.should.be.equal(buyer, 'buyer')
    }
    log.args.assetId.should.be.bignumber.equal(assetId, 'assetId')
    log.args.seller.should.be.equal(seller, 'seller')
    log.args.totalPrice.should.be.bignumber.equal(totalPrice, 'totalPrice')
  })
}

function checkChangedPublicationFeeLog(log, publicationFee) {
  log.event.should.be.eq('ChangedPublicationFee')
  log.args.publicationFee.should.be.bignumber.equal(
    publicationFee,
    'publicationFee'
  )
}

function checkChangedOwnerCutPerMillionLog(log, ownerCutPerMillion) {
  log.event.should.be.eq('ChangedOwnerCutPerMillion')
  log.args.ownerCutPerMillion.should.be.bignumber.equal(
    ownerCutPerMillion,
    'ownerCutPerMillion'
  )
}

function checkSetLegacyNFTAddressLog(log, nftAddress) {
  log.event.should.be.eq('ChangeLegacyNFTAddress')
  log.args.legacyNFTAddress.should.be.equal(nftAddress, 'nftAddress')
}

function getEndTime(minutesAhead = 15) {
  return web3.eth.getBlock('latest').timestamp + duration.minutes(minutesAhead)
}

contract('Marketplace', function([_, owner, seller, buyer, otherAddress]) {
  const itemPrice = web3.toWei(1.0, 'ether')
  const assetId = 10000
  const notLegacyAssetId = 2
  const zeroAddress = '0x0000000000000000000000000000000000000000'

  let market
  let erc20
  let erc721
  let verifiableErc721
  let legacyErc721

  let endTime

  const fromOwner = {
    from: owner
  }

  const creationParams = {
    ...fromOwner,
    gas: 6e6,
    gasPrice: 21e9
  }

  async function createOrder(...params) {
    return callMethod('createOrder', 'address,uint256,uint256,uint256', params)
  }
  async function executeOrder(...params) {
    return callMethod('executeOrder', 'address,uint256,uint256', params)
  }
  async function cancelOrder(...params) {
    return callMethod('cancelOrder', 'address,uint256', params)
  }

  async function createOrderLegacy(...params) {
    return callMethod('createOrder', 'uint256,uint256,uint256', params)
  }
  async function executeOrderLegacy(...params) {
    return callMethod('executeOrder', 'uint256,uint256', params)
  }
  async function cancelOrderLegacy(...params) {
    return callMethod('cancelOrder', 'uint256', params)
  }

  // Makeshift method to support solidity overloads ( https://github.com/trufflesuite/truffle/issues/737 ):
  // Truffle does not support overloads correctly. The only way to call them is using the form:
  //  instance.contract.method[args](params)
  // but that doesn't return the same result as calling the same method with:
  //  instance.method(params)
  // To remedy this, we had to decode the logs ourselves and mimic the structure returned in the receipt logs
  async function callMethod(methodName, argTypes, params) {
    const lastParam = params[params.length - 1]

    if (typeof lastParam === 'object') {
      lastParam.gas = lastParam.gas || 6e6
      lastParam.gasPrice = lastParam.gasPrice || 21e9
    } else {
      params.push({ gas: 6e6, gasPrice: 21e9 })
    }

    const txHash = await market.contract[methodName][argTypes](...params)
    const receipt = await new Promise((resolve, reject) =>
      web3.eth.getTransactionReceipt(
        txHash,
        (err, data) => (err ? reject(err) : resolve(data))
      )
    )

    const decodedLogs = abiDecoder.decodeLogs(receipt.logs)
    receipt.logs = decodedLogs.filter(log => !!log).map(log => ({
      event: log.name,
      args: log.events.reduce(
        (args, arg) => ({ ...args, [arg.name]: arg.value }),
        {}
      )
    }))

    return receipt
  }

  beforeEach(async function() {
    // Create tokens
    erc20 = await ERC20Token.new(creationParams)
    erc721 = await ERC721Token.new('LAND', 'DCL', creationParams)
    verifiableErc721 = await VerfiableERC721Token.new(
      'LAND',
      'DCL',
      creationParams
    )
    legacyErc721 = await LegacyERC721.new('OLDLAND', 'OLDDCL', creationParams)

    // Create a Marketplace with mocks
    market = await Marketplace.new(erc20.address, legacyErc721.address, owner, {
      from: owner
    })

    // Set holder of the asset and aproved on registry
    await erc721.mint(seller, assetId)
    await erc721.setApprovalForAll(market.address, true, { from: seller })
    await erc721.setApprovalForAll(market.address, true, { from: buyer })

    await verifiableErc721.mint(seller, assetId)
    await verifiableErc721.mint(seller, notLegacyAssetId)
    await verifiableErc721.setApprovalForAll(market.address, true, {
      from: seller
    })
    await verifiableErc721.setApprovalForAll(market.address, true, {
      from: buyer
    })

    await legacyErc721.mint(seller, assetId)
    await legacyErc721.setApprovalForAll(market.address, true, { from: seller })

    // Assign balance to buyer and allow marketplace to move ERC20
    await erc20.setBalance(buyer, web3.toWei(10, 'ether'))
    await erc20.setBalance(seller, web3.toWei(10, 'ether'))
    await erc20.approve(market.address, 1e30, { from: seller })
    await erc20.approve(market.address, 1e30, { from: buyer })

    endTime = getEndTime()

    abiDecoder.addABI(market.abi)
  })

  describe('Initialize', function() {
    it('should initialize with token', async function() {
      let _market = await Marketplace.new(
        erc20.address,
        legacyErc721.address,
        owner,
        { from: owner }
      )
      let acceptedToken = await _market.acceptedToken.call()

      acceptedToken.should.be.equal(erc20.address)
    })

    it('should revert if token is invalid', async function() {
      await Marketplace.new(0, legacyErc721.address, owner, {
        from: owner
      }).should.be.rejectedWith(EVMRevert)

      await Marketplace.new(zeroAddress, legacyErc721.address, owner, {
        from: owner
      }).should.be.rejectedWith(EVMRevert)

      await Marketplace.new('0x1234', legacyErc721.address, owner, {
        from: owner
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should revert if nft address is invalid', async function() {
      await Marketplace.new(erc20.address, 0, owner, {
        from: owner
      }).should.be.rejectedWith(EVMRevert)

      await Marketplace.new(erc20.address, zeroAddress, owner, {
        from: owner
      }).should.be.rejectedWith(EVMRevert)

      await Marketplace.new(erc20.address, '0x1234', owner, {
        from: owner
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should revert if owner is invalid', async function() {
      await Marketplace.new(erc20.address, legacyErc721.address, 0, {
        from: owner
      }).should.be.rejectedWith(EVMRevert)

      await Marketplace.new(erc20.address, legacyErc721.address, zeroAddress, {
        from: owner
      }).should.be.rejectedWith(EVMRevert)
    })
  })

  describe('Create', function() {
    it('should create a new order', async function() {
      const { logs } = await createOrder(
        erc721.address,
        assetId,
        itemPrice,
        endTime,
        { from: seller }
      )

      logs.length.should.be.equal(1)
      checkOrderCreatedLogs(
        logs,
        assetId,
        seller,
        erc721.address,
        itemPrice,
        endTime
      )

      // Check data
      let s = await market.orderByAssetId.call(erc721.address, assetId)
      s[1].should.be.equal(seller)
      s[2].should.be.equal(erc721.address)
      s[3].should.be.bignumber.equal(itemPrice)
      s[4].should.be.bignumber.equal(endTime)
    })

    it('should update an order', async function() {
      let newPrice = web3.toWei(2.0, 'ether')
      let newEndTime = endTime + duration.minutes(5)

      const { logs } = await createOrder(
        erc721.address,
        assetId,
        newPrice,
        newEndTime,
        { from: seller }
      )

      logs.length.should.be.equal(1)
      checkOrderCreatedLogs(
        logs,
        assetId,
        seller,
        erc721.address,
        newPrice,
        newEndTime
      )

      // Check data
      let s = await market.orderByAssetId.call(erc721.address, assetId)
      s[1].should.be.equal(seller)
      s[2].should.be.equal(erc721.address)
      s[3].should.be.bignumber.equal(newPrice)
      s[4].should.be.bignumber.equal(newEndTime)
    })

    it('should fail to create an order :: (contract not approved)', async function() {
      const newAssetId = 123123123
      await erc721.mint(otherAddress, newAssetId)

      await createOrder(erc721.address, newAssetId, itemPrice, endTime, {
        from: seller
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should fail to create an order :: (address not the owner of asset)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: otherAddress
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should fail to create an order :: (not an ERC721 contract)', async function() {
      await createOrder(erc20.address, assetId, itemPrice, endTime, {
        from: seller
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should fail to create an order :: (price is 0)', async function() {
      await market
        .createOrder(erc721.address, assetId, 0, endTime, { from: seller })
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail to create an order :: (expires too soon)', async function() {
      const newTime =
        web3.eth.getBlock('latest').timestamp + duration.seconds(59)
      await market
        .createOrder(erc721.address, assetId, itemPrice, newTime, {
          from: seller
        })
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail to create an order :: (nft not approved)', async function() {
      await erc721.setApprovalForAll(market.address, false, { from: seller })
      await market
        .createOrder(erc721.address, assetId, itemPrice, endTime, {
          from: seller
        })
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail to create an order :: (publication fee not paid)', async function() {
      await erc20.approve(market.address, 1, { from: seller })
      await market.setPublicationFee(2, { from: owner })
      await market
        .createOrder(erc721.address, assetId, itemPrice, endTime, {
          from: seller
        })
        .should.be.rejectedWith(EVMRevert)
    })

    it('[LEGACY] should create a new order', async function() {
      const { logs } = await createOrderLegacy(assetId, itemPrice, endTime, {
        from: seller
      })

      // Event emitted
      logs.length.should.be.equal(2)
      checkOrderCreatedLogs(
        logs,
        assetId,
        seller,
        legacyErc721.address,
        itemPrice,
        endTime
      )

      // Check data
      let s = await market.auctionByAssetId(assetId)
      s[1].should.be.equal(seller)
      s[2].should.be.bignumber.equal(itemPrice)
      s[3].should.be.bignumber.equal(endTime)
    })

    it('[LEGACY] should fail to create a new order with a not legacy token', async function() {
      await createOrderLegacy(notLegacyAssetId, itemPrice, endTime, {
        from: seller
      }).should.be.rejectedWith(EVMRevert)
    })
  })

  describe('Cancel', function() {
    it('should let the seller cancel a created order', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      const { logs } = await cancelOrder(erc721.address, assetId, {
        from: seller
      })

      logs.length.should.be.equal(1)
      checkOrderCancelledLogs(logs, assetId, seller, erc721.address)
    })

    it('should let the contract owner cancel a created order', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      const { logs } = await cancelOrder(erc721.address, assetId, {
        from: owner
      })

      logs.length.should.be.equal(1)
      checkOrderCancelledLogs(logs, assetId, seller, erc721.address)
    })

    it('should fail canceling an order :: (wrong user)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      await cancelOrder(erc721.address, assetId, {
        from: buyer
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should fail canceling an order :: (wrong NFT address)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      await cancelOrder(erc20.address, assetId, {
        from: seller
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should fail canceling an order :: (double cancel)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      await cancelOrder(erc721.address, assetId, { from: seller })

      await cancelOrder(erc721.address, assetId, {
        from: seller
      }).should.be.rejectedWith(EVMRevert)
    })

    it('[LEGACY] should let the seller cancel a created order', async function() {
      await createOrder(legacyErc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      const { logs } = await cancelOrderLegacy(assetId, { from: seller })

      // Event emitted
      logs.length.should.be.equal(2)
      checkOrderCancelledLogs(logs, assetId, seller, legacyErc721.address)
    })

    it('[LEGACY] should let the seller cancel a created legacy order', async function() {
      await createOrderLegacy(assetId, itemPrice, endTime, { from: seller })
      const { logs } = await cancelOrderLegacy(assetId, { from: seller })

      // Event emitted
      logs.length.should.be.equal(2)
      checkOrderCancelledLogs(logs, assetId, seller, legacyErc721.address)
    })

    it('[LEGACY] should not let the seller of a not legacy token to cancel a created order', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      await cancelOrderLegacy(assetId, {
        from: seller
      }).should.be.rejectedWith(EVMRevert)
    })
  })

  describe('Execute', function() {
    it('should execute a created order', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      const { logs } = await executeOrder(erc721.address, assetId, itemPrice, {
        from: buyer
      })

      logs.length.should.be.equal(1)
      checkOrderSuccessfulLogs(
        logs,
        assetId,
        seller,
        erc721.address,
        itemPrice,
        buyer
      )
    })

    it('should fail on execute a created order :: (wrong user)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })

      await executeOrder(erc721.address, assetId, itemPrice, {
        from: seller
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should fail on execute a created order :: (wrong NFT address)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })

      await executeOrder(erc20.address, assetId, itemPrice, {
        from: buyer
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should fail execute a created order :: (expired)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })

      // move an hour ahead
      await increaseTime(3600)
      await executeOrder(erc721.address, assetId, itemPrice, {
        from: buyer
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should fail on execute a created order :: (double execute)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      await executeOrder(erc721.address, assetId, itemPrice, {
        from: buyer
      })

      await executeOrder(erc721.address, assetId, itemPrice, {
        from: buyer
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should fail to execute a created order :: (not an ERC721 contract)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      // Not cover it at 100% but we should see it as an upgradeable contract
      await executeOrder(erc20.address, assetId, itemPrice, {
        from: buyer
      }).should.be.rejectedWith(EVMRevert)
    })

    it('[LEGACY] should execute a created order', async function() {
      await createOrder(legacyErc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      const { logs } = await executeOrderLegacy(assetId, itemPrice, {
        from: buyer
      })

      // Event emitted
      logs.length.should.be.equal(2)
      checkOrderSuccessfulLogs(
        logs,
        assetId,
        seller,
        legacyErc721.address,
        itemPrice,
        buyer
      )
    })

    it('[LEGACY] should execute a created legacy order', async function() {
      await createOrderLegacy(assetId, itemPrice, endTime, { from: seller })
      const { logs } = await executeOrderLegacy(assetId, itemPrice, {
        from: buyer
      })

      // Event emitted
      logs.length.should.be.equal(2)
      checkOrderSuccessfulLogs(
        logs,
        assetId,
        seller,
        legacyErc721.address,
        itemPrice,
        buyer
      )
    })

    it('[LEGACY] should not execute a created order for a not legacy token', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      await executeOrderLegacy(assetId, itemPrice, {
        from: buyer
      }).should.be.rejectedWith(EVMRevert)
    })
  })

  describe('Safe Execute', function() {
    beforeEach(async () => {
      fingerprint = await verifiableErc721.getFingerprint(0)
      fingerprint = fingerprint.toString()
    })

    it('should verify and execute a created order', async function() {
      await createOrder(verifiableErc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      const { logs } = await market.safeExecuteOrder(
        verifiableErc721.address,
        assetId,
        itemPrice,
        fingerprint,
        { from: buyer }
      )

      logs.length.should.be.equal(1)
      checkOrderSuccessfulLogs(
        logs,
        assetId,
        seller,
        verifiableErc721.address,
        itemPrice,
        buyer
      )
    })

    it('should fail on execute a created order :: (wrong fingerprint)', async function() {
      await createOrder(verifiableErc721.address, assetId, itemPrice, endTime, {
        from: seller
      })

      await market
        .safeExecuteOrder(verifiableErc721.address, assetId, itemPrice, '-1', {
          from: seller
        })
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail on execute a created order :: (wrong user)', async function() {
      await createOrder(verifiableErc721.address, assetId, itemPrice, endTime, {
        from: seller
      })

      await market
        .safeExecuteOrder(
          verifiableErc721.address,
          assetId,
          itemPrice,
          fingerprint,
          { from: seller }
        )
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail on unsafe executeOrder :: (verifiable NFT registry)', async function() {
      await createOrder(verifiableErc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      await market
        .executeOrder(verifiableErc721.address, assetId, itemPrice, {
          from: buyer
        })
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail execute a created order :: (expired)', async function() {
      await createOrder(verifiableErc721.address, assetId, itemPrice, endTime, {
        from: seller
      })

      // move an hour ahead
      await increaseTime(3600)
      await market
        .safeExecuteOrder(
          verifiableErc721.address,
          assetId,
          itemPrice,
          fingerprint,
          { from: buyer }
        )
        .should.be.rejectedWith(EVMRevert)
    })
  })

  describe('setPublicationFee', function() {
    it('should be initialized to 0', async function() {
      const response = await market.publicationFeeInWei()
      response.should.be.bignumber.equal(0)
    })

    it('should change publication fee', async function() {
      let publicationFee = web3.toWei(0.005, 'ether')

      const { logs } = await market.setPublicationFee(publicationFee, {
        from: owner
      })
      let response = await market.publicationFeeInWei()
      response.should.be.bignumber.equal(publicationFee)
      logs.length.should.be.equal(1)
      checkChangedPublicationFeeLog(logs[0], publicationFee)

      await market.setPublicationFee(0, {
        from: owner
      })

      response = await market.publicationFeeInWei()
      response.should.be.bignumber.equal(0)
    })

    it('should fail to change publication fee (not owner)', async function() {
      const publicationFee = web3.toWei(0.005, 'ether')

      await market
        .setPublicationFee(publicationFee, { from: seller })
        .should.be.rejectedWith(EVMRevert)
    })
  })

  describe('ownerCutPerMillion', function() {
    it('should be initialized to 0', async function() {
      const response = await market.ownerCutPerMillion()
      response.should.be.bignumber.equal(0)
    })

    it('should change owner sale cut', async function() {
      const ownerCut = 10

      const { logs } = await market.setOwnerCutPerMillion(ownerCut, {
        from: owner
      })
      let response = await market.ownerCutPerMillion()
      response.should.be.bignumber.equal(ownerCut)
      logs.length.should.be.equal(1)
      checkChangedOwnerCutPerMillionLog(logs[0], ownerCut)

      await market.setOwnerCutPerMillion(0, {
        from: owner
      })
      response = await market.ownerCutPerMillion()
      response.should.be.bignumber.equal(0)
    })

    it('should fail to change owner cut (% invalid above)', async function() {
      await market
        .setOwnerCutPerMillion(10000000, { from: owner })
        .should.be.rejectedWith(EVMRevert)

      // -1 is a uint256 in solidity 1.157920892373162e+77
      await market
        .setOwnerCutPerMillion(-1, { from: owner })
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail to change owner cut (not owner)', async function() {
      const ownerCut = 10

      await market
        .setOwnerCutPerMillion(ownerCut, { from: seller })
        .should.be.rejectedWith(EVMRevert)
    })
  })

  describe('Create with fee', function() {
    it('should publish with fee', async function() {
      // Set token balances
      erc20.setBalance(owner, web3.toWei(10.0, 'ether'))
      erc20.setBalance(seller, web3.toWei(10.0, 'ether'))

      let publicationFee = web3.toWei(0.5, 'ether')

      await market.setPublicationFee(publicationFee, { from: owner })
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })

      let balancePost = await erc20.balanceOf(seller)

      balancePost.should.be.bignumber.equal(web3.toWei(9.5, 'ether'))
    })
  })

  describe('Create with owner cut', function() {
    it('should sell with owner sale cut', async function() {
      // Set token balances
      erc20.setBalance(owner, web3.toWei(10.0, 'ether'))
      erc20.setBalance(buyer, web3.toWei(10.0, 'ether'))
      erc20.setBalance(seller, web3.toWei(10.0, 'ether'))

      let ownerCut = 100000

      await market.setOwnerCutPerMillion(ownerCut, { from: owner })
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })
      await executeOrder(erc721.address, assetId, itemPrice, {
        from: buyer
      })

      // Verify balances
      let ownerBalance = await erc20.balanceOf(owner)
      ownerBalance.should.be.bignumber.equal(web3.toWei(10.1, 'ether'))

      let sellerBalance = await erc20.balanceOf(seller)
      sellerBalance.should.be.bignumber.equal(web3.toWei(10.9, 'ether'))

      let buyerBalance = await erc20.balanceOf(buyer)
      buyerBalance.should.be.bignumber.equal(web3.toWei(9.0, 'ether'))
    })
  })

  describe('Legacy auctionByAssetId', function() {
    it('should return the order of a published nft with the old Auction structure', async function() {
      await createOrderLegacy(assetId, itemPrice, endTime, { from: seller })

      const [
        _,
        orderSeller,
        orderPrice,
        orderExpiresAt
      ] = await market.auctionByAssetId(assetId)

      orderSeller.should.be.equal(seller, 'seller')
      orderPrice.should.be.bignumber.equal(itemPrice, 'itemPrice')
      orderExpiresAt.should.be.bignumber.equal(endTime, 'expiresAt')
    })

    it('should get legacy token with order getter', async function() {
      await createOrderLegacy(assetId, itemPrice, endTime, {
        from: seller
      })

      let s = await market.orderByAssetId.call(legacyErc721.address, assetId)
      s[1].should.be.equal(seller)
      s[2].should.be.equal(legacyErc721.address)
      s[3].should.be.bignumber.equal(itemPrice)
      s[4].should.be.bignumber.equal(endTime)
    })

    it('should get legacy token with order legacy getter', async function() {
      await createOrder(legacyErc721.address, assetId, itemPrice, endTime, {
        from: seller
      })

      // Check data
      let s = await market.auctionByAssetId(assetId)
      s[1].should.be.equal(seller)
      s[2].should.be.bignumber.equal(itemPrice)
      s[3].should.be.bignumber.equal(endTime)
    })

    it('should not get not legacy token with order legacy getter', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller
      })

      // Check data
      let s = await market.auctionByAssetId(assetId)
      s[1].should.be.equal(zeroAddress)
      s[2].should.be.bignumber.equal(0)
      s[3].should.be.bignumber.equal(0)
    })
  })

  describe('setLegacyNFTAddress', function() {
    it('should return the legacy nft address', async function() {
      const address = await market.legacyNFTAddress()
      address.should.be.equal(legacyErc721.address)
    })

    it('should change the legacy nft address', async function() {
      let address = await market.legacyNFTAddress()
      address.should.be.equal(legacyErc721.address)

      const { logs } = await market.setLegacyNFTAddress(
        erc721.address,
        fromOwner
      )

      // Event emitted
      logs.length.should.be.equal(1)
      checkSetLegacyNFTAddressLog(logs[0], erc721.address)
      address = await market.legacyNFTAddress()
      address.should.be.equal(erc721.address)
    })

    it('should rever if not the owner try to change the legacy nft address', async function() {
      await market
        .setLegacyNFTAddress(erc721.address)
        .should.be.rejectedWith(EVMRevert)
    })

    it('should revert when changing legacy nft address with an invalid contract address', async function() {
      let address = await market.legacyNFTAddress()
      address.should.be.equal(legacyErc721.address)

      await market
        .setLegacyNFTAddress(0, fromOwner)
        .should.be.rejectedWith(EVMRevert)

      await market
        .setLegacyNFTAddress(zeroAddress, fromOwner)
        .should.be.rejectedWith(EVMRevert)

      await market
        .setLegacyNFTAddress('0x123', fromOwner)
        .should.be.rejectedWith(EVMRevert)

      address = await market.legacyNFTAddress()
      address.should.be.equal(legacyErc721.address)
    })
  })
})
