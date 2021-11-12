const BN = web3.utils.BN
const expect = require('chai').use(require('bn-chai')(BN)).expect

const abiDecoder = require('abi-decoder')
const { Erc721 } = require('decentraland-contract-plugins')

const EVMRevert = 'VM Exception while processing transaction: revert'

const RoyaltiesManager = artifacts.require('RoyaltiesManager')
const Marketplace = artifacts.require('MarketplaceV2')
const ERC20Token = artifacts.require('ERC20Test')
const ERC721Token = artifacts.require('ERC721Test')
const ERC721Collection = artifacts.require('ERC721TestCollection')
const VerfiableERC721Token = artifacts.require('VerifiableERC721Test')

const { increaseTime, duration } = require('./helpers/increaseTime')
const { sendMetaTx } = require('./helpers/metaTx')
const { assertRevert } = require('./helpers/assertRevert')

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
      log.event.should.be.equal('OrderCreated')
      log.args.nftAddress
        .toLowerCase()
        .should.be.equal(nftAddress.toLowerCase(), 'nftAddress')
    } else {
      log.event.should.be.equal('AuctionCreated')
    }
    log.args.assetId.should.be.eq.BN(assetId, 'assetId')
    log.args.seller
      .toLowerCase()
      .should.be.equal(seller.toLowerCase(), 'seller')
    log.args.priceInWei.should.be.eq.BN(priceInWei, 'priceInWei')
    log.args.expiresAt.should.be.eq.BN(expiresAt, 'expiresAt')
  })
}

function checkOrderCancelledLogs(logs, assetId, seller, nftAddress) {
  logs.forEach((log, index) => {
    if (index === 0) {
      log.event.should.be.equal('OrderCancelled')
      log.args.nftAddress
        .toLowerCase()
        .should.be.equal(nftAddress.toLowerCase(), 'nftAddress')
    } else {
      log.event.should.be.equal('AuctionCancelled')
    }
    log.args.assetId.should.be.eq.BN(assetId, 'assetId')
    log.args.seller
      .toLowerCase()
      .should.be.equal(seller.toLowerCase(), 'seller')
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
      log.event.should.be.equal('OrderSuccessful')
      log.args.nftAddress
        .toLowerCase()
        .should.be.equal(nftAddress.toLowerCase(), 'nftAddress')
      log.args.buyer.toLowerCase().should.be.equal(buyer.toLowerCase(), 'buyer')
    } else {
      log.event.should.be.equal('AuctionSuccessful')
      log.args.winner
        .toLowerCase()
        .should.be.equal(buyer.toLowerCase(), 'buyer')
    }
    log.args.assetId.should.be.eq.BN(assetId, 'assetId')
    log.args.seller
      .toLowerCase()
      .should.be.equal(seller.toLowerCase(), 'seller')
    log.args.totalPrice.should.be.eq.BN(totalPrice, 'totalPrice')
  })
}

function checkChangedPublicationFeeLog(log, publicationFee) {
  log.event.should.be.equal('ChangedPublicationFee')
  log.args.publicationFee.should.be.eq.BN(publicationFee, 'publicationFee')
}

function checkChangedFeesCollectorCutPerMillionLog(
  log,
  feesCollectorCutPerMillion
) {
  log.event.should.be.equal('ChangedFeesCollectorCutPerMillion')
  log.args.feesCollectorCutPerMillion.should.be.eq.BN(
    feesCollectorCutPerMillion,
    'feesCollectorCutPerMillion'
  )
}

function checkChangedRoyaltiesCutPerMillionLog(log, royaltiesCutPerMillion) {
  log.event.should.be.equal('ChangedRoyaltiesCutPerMillion')
  log.args.royaltiesCutPerMillion.should.be.eq.BN(
    royaltiesCutPerMillion,
    'royaltiesCutPerMillion'
  )
}

function checkFeesCollectorSetLog(log, oldFeesCollector, newFeesCollector) {
  log.event.should.be.equal('FeesCollectorSet')
  log.args.oldFeesCollector.should.be.eq.BN(
    oldFeesCollector,
    'oldFeesCollector'
  )
  log.args.newFeesCollector.should.be.eq.BN(
    newFeesCollector,
    'newFeesCollector'
  )
}

function checkRoyaltiesManagerSetLog(
  log,
  oldRoyaltiesManager,
  newRoyaltiesManager
) {
  log.event.should.be.equal('RoyaltiesManagerSet')
  log.args.oldRoyaltiesManager.should.be.eq.BN(
    oldRoyaltiesManager,
    'oldRoyaltiesManager'
  )
  log.args.newRoyaltiesManager.should.be.eq.BN(
    newRoyaltiesManager,
    'newRoyaltiesManager'
  )
}

async function getEndTime(minutesAhead = 15) {
  const block = await web3.eth.getBlock('latest')
  return block.timestamp + duration.minutes(minutesAhead)
}

contract('Marketplace V2', function([
  _,
  owner,
  seller,
  buyer,
  otherAddress,
  relayer,
  feesCollector,
  royaltiesCollector,
  itemCreator,
  itemBeneficiary,
  anotherUser,
]) {
  const itemPrice = web3.utils.toWei('1', 'ether')
  const itemPrice2 = web3.utils.toWei('2', 'ether')

  const assetId = 10000
  const notLegacyAssetId = 2
  const zeroAddress = '0x0000000000000000000000000000000000000000'
  const domain = 'Decentraland Marketplace'
  const version = '2'

  let royaltiesManager
  let market
  let erc20
  let erc721
  let verifiableErc721
  let erc721Collection

  let fingerprint
  let endTime

  const fromOwner = {
    from: owner,
  }

  const creationParams = {
    ...fromOwner,
    gas: 6e6,
    gasPrice: 21e9,
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

    const { tx } = await market.methods[`${methodName}(${argTypes})`](...params)
    const receipt = await new Promise((resolve, reject) =>
      web3.eth.getTransactionReceipt(tx, (err, data) =>
        err ? reject(err) : resolve(data)
      )
    )

    const decodedLogs = abiDecoder.decodeLogs(receipt.logs)
    receipt.logs = decodedLogs
      .filter((log) => !!log)
      .map((log) => ({
        event: log.name,
        args: log.events.reduce(
          (args, arg) => ({ ...args, [arg.name]: arg.value }),
          {}
        ),
      }))

    return receipt
  }

  beforeEach(async function() {
    // Create tokens
    erc20 = await ERC20Token.new('Mana', 'MANA', creationParams)
    erc721 = await ERC721Token.new('LAND', 'DCL', creationParams)
    verifiableErc721 = await VerfiableERC721Token.new(
      'LAND',
      'DCL',
      creationParams
    )
    erc721Collection = await ERC721Collection.new(
      'COLLECTION',
      'COL',
      creationParams
    )

    // Create a Marketplace with mocks
    royaltiesManager = await RoyaltiesManager.new({
      from: owner,
    })

    // Create a Marketplace with mocks
    market = await Marketplace.new(
      owner,
      feesCollector,
      erc20.address,
      royaltiesManager.address,
      0,
      0,
      {
        from: owner,
      }
    )

    // Set holder of the asset and aproved on registry
    await erc721.mint(seller, assetId)
    await erc721.setApprovalForAll(market.address, true, { from: seller })
    await erc721.setApprovalForAll(market.address, true, { from: buyer })

    await verifiableErc721.mint(seller, assetId)
    await verifiableErc721.mint(seller, notLegacyAssetId)
    await verifiableErc721.setApprovalForAll(market.address, true, {
      from: seller,
    })
    await verifiableErc721.setApprovalForAll(market.address, true, {
      from: buyer,
    })

    await erc721Collection.mint(seller, 0) // return beneficiary
    await erc721Collection.mint(seller, assetId) // return creator
    await erc721Collection.setApprovalForAll(market.address, true, {
      from: seller,
    })
    await erc721Collection.setApprovalForAll(market.address, true, {
      from: buyer,
    })

    // Assign balance to buyer and allow marketplace to move ERC20
    await erc20.setBalance(buyer, web3.utils.toWei('10', 'ether'))
    await erc20.setBalance(seller, web3.utils.toWei('10', 'ether'))
    await erc20.approve(market.address, web3.utils.toWei('30', 'ether'), {
      from: seller,
    })
    await erc20.approve(market.address, web3.utils.toWei('30', 'ether'), {
      from: buyer,
    })

    endTime = await getEndTime()

    abiDecoder.addABI(market.abi)
  })

  describe('Initialize', function() {
    it('should initialize with token', async function() {
      let _market = await Marketplace.new(
        owner,
        feesCollector,
        erc20.address,
        royaltiesManager.address,
        0,
        0,
        {
          from: owner,
        }
      )
      let acceptedToken = await _market.acceptedToken.call()
      acceptedToken.should.be.be.equal(erc20.address)
    })

    it('should revert if owner is invalid', async function() {
      await assertRevert(
        Marketplace.new(
          zeroAddress,
          feesCollector,
          erc20.address,
          royaltiesManager.address,
          0,
          0,
          {
            from: owner,
          }
        ),
        'MarketplaceV2#constructor: INVALID_OWNER'
      )
    })

    it('should revert if fees collector is invalid', async function() {
      await assertRevert(
        Marketplace.new(
          owner,
          zeroAddress,
          erc20.address,
          royaltiesManager.address,
          0,
          0,
          {
            from: owner,
          }
        ),
        'MarketplaceV2#setFeesCollector: INVALID_FEES_COLLECTOR'
      )
    })

    it('should revert if accepted token is invalid', async function() {
      await assertRevert(
        Marketplace.new(
          owner,
          feesCollector,
          zeroAddress,
          royaltiesManager.address,
          0,
          0,
          {
            from: owner,
          }
        ),
        'MarketplaceV2#constructor: INVALID_ACCEPTED_TOKEN'
      )
    })

    it('should revert if royalties manager is invalid', async function() {
      await assertRevert(
        Marketplace.new(
          owner,
          feesCollector,
          erc20.address,
          zeroAddress,
          0,
          0,
          {
            from: owner,
          }
        ),
        'MarketplaceV2#setRoyaltiesManager: INVALID_ROYALTIES_MANAGER'
      )
    })

    it('should revert if fee is invalid', async function() {
      await assertRevert(
        Marketplace.new(
          owner,
          feesCollector,
          erc20.address,
          royaltiesManager.address,
          1000000,
          0,
          {
            from: owner,
          }
        ),
        'MarketplaceV2#setFeesCollectorCutPerMillion: TOTAL_FEES_MUST_BE_BETWEEN_0_AND_999999'
      )
    })

    it('should revert if royalties is invalid', async function() {
      await assertRevert(
        Marketplace.new(
          owner,
          feesCollector,
          erc20.address,
          royaltiesManager.address,
          0,
          1000000,
          {
            from: owner,
          }
        ),
        'MarketplaceV2#setRoyaltiesCutPerMillion: TOTAL_FEES_MUST_BE_BETWEEN_0_AND_999999'
      )
    })

    it('should revert if the sum of the fees and royalties are invalid', async function() {
      await assertRevert(
        Marketplace.new(
          owner,
          feesCollector,
          erc20.address,
          royaltiesManager.address,
          1,
          999999,
          {
            from: owner,
          }
        ),
        'MarketplaceV2#setRoyaltiesCutPerMillion: TOTAL_FEES_MUST_BE_BETWEEN_0_AND_999999'
      )

      await assertRevert(
        Marketplace.new(
          owner,
          feesCollector,
          erc20.address,
          royaltiesManager.address,
          500000,
          500000,
          {
            from: owner,
          }
        ),
        'MarketplaceV2#setRoyaltiesCutPerMillion: TOTAL_FEES_MUST_BE_BETWEEN_0_AND_999999'
      )
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
      s[3].should.be.eq.BN(itemPrice)
      s[4].should.be.eq.BN(endTime)
    })

    it('should create a new order :: Relayed EIP721', async function() {
      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: 'nftAddress',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'assetId',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'priceInWei',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'expiresAt',
              type: 'uint256',
            },
          ],
          name: 'createOrder',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [erc721.address, assetId, itemPrice, endTime]
      )

      const { logs } = await sendMetaTx(
        market,
        functionSignature,
        seller,
        relayer,
        null,
        domain,
        version
      )

      logs.length.should.be.equal(2)

      checkOrderCreatedLogs(
        [logs[1]],
        assetId,
        seller,
        erc721.address,
        itemPrice,
        endTime
      )

      // Check data
      let s = await market.orderByAssetId.call(erc721.address, assetId)
      s[1].toLowerCase().should.be.equal(seller.toLowerCase())
      s[2].toLowerCase().should.be.equal(erc721.address.toLowerCase())
      s[3].should.be.eq.BN(itemPrice)
      s[4].should.be.eq.BN(endTime)
    })

    it('should update an order', async function() {
      let newPrice = web3.utils.toWei('2.0', 'ether')
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
      s[3].should.be.eq.BN(newPrice)
      s[4].should.be.eq.BN(newEndTime)
    })

    it('should update an order :: Relayed EIP721', async function() {
      let newPrice = web3.utils.toWei('2.0', 'ether')
      let newEndTime = endTime + duration.minutes(5)

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: 'nftAddress',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'assetId',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'priceInWei',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'expiresAt',
              type: 'uint256',
            },
          ],
          name: 'createOrder',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [erc721.address, assetId, newPrice, newEndTime]
      )

      const { logs } = await sendMetaTx(
        market,
        functionSignature,
        seller,
        relayer,
        null,
        domain,
        version
      )

      logs.length.should.be.equal(2)

      checkOrderCreatedLogs(
        [logs[1]],
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
      s[3].should.be.eq.BN(newPrice)
      s[4].should.be.eq.BN(newEndTime)
    })

    it('should fail to create an order :: (contract not approved)', async function() {
      const newAssetId = 123123123
      await erc721.mint(otherAddress, newAssetId)

      await assertRevert(
        createOrder(erc721.address, newAssetId, itemPrice, endTime, {
          from: seller,
        })
      )
    })

    it('should fail to create an order :: (address not the owner of asset)', async function() {
      await assertRevert(
        createOrder(erc721.address, assetId, itemPrice, endTime, {
          from: otherAddress,
        }),
        'MarketplaceV2#_createOrder: NOT_ASSET_OWNER'
      )
    })

    it('should fail to create an order :: (address not the owner of asset) :: Relayed EIP721', async function() {
      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: 'nftAddress',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'assetId',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'priceInWei',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'expiresAt',
              type: 'uint256',
            },
          ],
          name: 'createOrder',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [erc721.address, assetId, itemPrice, endTime]
      )

      await assertRevert(
        sendMetaTx(
          market,
          functionSignature,
          otherAddress,
          relayer,
          null,
          domain,
          version
        )
      )
    })

    it('should fail to create an order :: (price is 0)', async function() {
      await assertRevert(
        market.createOrder(erc721.address, assetId, 0, endTime, {
          from: seller,
        }),
        EVMRevert
      )
    })

    it('should fail to create an order :: (expires too soon)', async function() {
      const newTime =
        (await web3.eth.getBlock('latest')).timestamp + duration.seconds(59)
      await assertRevert(
        market.createOrder(erc721.address, assetId, itemPrice, newTime, {
          from: seller,
        }),
        'MarketplaceV2#_createOrder: INVALID_EXPIRES_AT'
      )
    })

    it('should fail to create an order :: (nft not approved)', async function() {
      await erc721.setApprovalForAll(market.address, false, { from: seller })
      await assertRevert(
        market.createOrder(erc721.address, assetId, itemPrice, endTime, {
          from: seller,
        })
      )
    })

    it('should fail to create an order :: (publication fee not paid)', async function() {
      await erc20.approve(market.address, 1, { from: seller })
      await market.setPublicationFee(2, { from: owner })
      await assertRevert(
        market.createOrder(erc721.address, assetId, itemPrice, endTime, {
          from: seller,
        }),
        'ERC20: transfer amount exceeds allowance'
      )
    })
  })

  describe('Cancel', function() {
    it('should let the seller cancel a created order', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      const { logs } = await cancelOrder(erc721.address, assetId, {
        from: seller,
      })

      logs.length.should.be.equal(1)
      checkOrderCancelledLogs(logs, assetId, seller, erc721.address)
    })

    it('should let the seller cancel a created order :: Relayed EIP721', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: 'nftAddress',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'assetId',
              type: 'uint256',
            },
          ],
          name: 'cancelOrder',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [erc721.address, assetId]
      )

      const { logs } = await sendMetaTx(
        market,
        functionSignature,
        seller,
        relayer,
        null,
        domain,
        version
      )

      logs.length.should.be.equal(2)
      checkOrderCancelledLogs([logs[1]], assetId, seller, erc721.address)
    })

    it('should let the contract owner cancel a created order', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      const { logs } = await cancelOrder(erc721.address, assetId, {
        from: owner,
      })

      logs.length.should.be.equal(1)
      checkOrderCancelledLogs(logs, assetId, seller, erc721.address)
    })

    it('should let the contract owner cancel a created order :: Relayed EIP721', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: 'nftAddress',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'assetId',
              type: 'uint256',
            },
          ],
          name: 'cancelOrder',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [erc721.address, assetId]
      )

      const { logs } = await sendMetaTx(
        market,
        functionSignature,
        owner,
        relayer,
        null,
        domain,
        version
      )

      logs.length.should.be.equal(2)
      checkOrderCancelledLogs([logs[1]], assetId, seller, erc721.address)
    })

    it('should fail canceling an order :: (wrong user)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await assertRevert(
        cancelOrder(erc721.address, assetId, {
          from: buyer,
        }),
        'MarketplaceV2#_cancelOrder: UNAUTHORIZED_USER'
      )
    })

    it('should fail canceling an order :: (wrong user) :: Relayed EIP721', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: 'nftAddress',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'assetId',
              type: 'uint256',
            },
          ],
          name: 'cancelOrder',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [erc721.address, assetId]
      )

      await assertRevert(
        sendMetaTx(
          market,
          functionSignature,
          buyer,
          relayer,
          null,
          domain,
          version
        )
      )
    })

    it('should fail canceling an order :: (wrong NFT address)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await assertRevert(
        cancelOrder(erc20.address, assetId, {
          from: seller,
        }),
        'MarketplaceV2#_cancelOrder: INVALID_ORDER'
      )
    })

    it('should fail canceling an order :: (double cancel)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await cancelOrder(erc721.address, assetId, { from: seller })

      await assertRevert(
        cancelOrder(erc721.address, assetId, {
          from: seller,
        }),
        'MarketplaceV2#_cancelOrder: INVALID_ORDER'
      )
    })
  })

  describe('Execute', function() {
    it('should execute a created order', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      const { logs } = await executeOrder(erc721.address, assetId, itemPrice, {
        from: buyer,
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

    it('should execute a created order :: Relayed EIP721', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: 'nftAddress',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'assetId',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'price',
              type: 'uint256',
            },
          ],
          name: 'executeOrder',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [erc721.address, assetId, itemPrice]
      )

      const { logs } = await sendMetaTx(
        market,
        functionSignature,
        buyer,
        relayer,
        null,
        domain,
        version
      )

      logs.length.should.be.equal(2)
      logs.shift()
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
        from: seller,
      })

      await assertRevert(
        executeOrder(erc721.address, assetId, itemPrice, {
          from: seller,
        }),
        'MarketplaceV2#_executeOrder: SENDER_IS_SELLER'
      )
    })

    it('should fail on execute a created order :: (wrong NFT address)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
    })

    it('should fail execute a created order :: (expired)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })

      // move an hour ahead
      await increaseTime(3600)
      await assertRevert(
        executeOrder(erc721.address, assetId, itemPrice, {
          from: buyer,
        }),
        'MarketplaceV2#_executeOrder: ORDER_EXPIRED'
      )
    })

    it('should fail on execute a created order :: (double execute)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await executeOrder(erc721.address, assetId, itemPrice, {
        from: buyer,
      })

      await assertRevert(
        executeOrder(erc721.address, assetId, itemPrice, {
          from: buyer,
        }),
        'MarketplaceV2#_executeOrder: ASSET_NOT_FOR_SALE'
      )
    })

    it('should fail to execute a created order :: (not an ERC721 contract)', async function() {
      await assertRevert(
        createOrder(erc20.address, assetId, itemPrice, endTime, {
          from: seller,
        })
      )
    })

    it('should fail to execute a created order :: (price mismatch)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await assertRevert(
        executeOrder(erc721.address, assetId, itemPrice2, {
          from: buyer,
        }),
        'MarketplaceV2#_executeOrder: PRICE_MISMATCH'
      )
    })

    it('should fail to execute a created order :: (seller is not the owner)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })

      await erc721.transferFrom(seller, anotherUser, assetId, {
        from: seller,
      })

      await assertRevert(
        executeOrder(erc721.address, assetId, itemPrice, {
          from: buyer,
        }),
        'MarketplaceV2#_executeOrder: SELLER_NOT_OWNER'
      )
    })
  })

  describe('Safe Execute', function() {
    beforeEach(async () => {
      fingerprint = await verifiableErc721.getFingerprint(0)
      fingerprint = fingerprint.toString()
    })

    it('should verify and execute a created order', async function() {
      await createOrder(verifiableErc721.address, assetId, itemPrice, endTime, {
        from: seller,
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

    it('should verify and execute a created order :: Relayed EIP721', async function() {
      await createOrder(verifiableErc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: 'nftAddress',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'assetId',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'price',
              type: 'uint256',
            },
            {
              internalType: 'bytes',
              name: 'fingerprint',
              type: 'bytes',
            },
          ],
          name: 'safeExecuteOrder',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [verifiableErc721.address, assetId, itemPrice, fingerprint]
      )

      const { logs } = await sendMetaTx(
        market,
        functionSignature,
        buyer,
        relayer,
        null,
        domain,
        version
      )

      logs.length.should.be.equal(2)
      logs.shift()
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
        from: seller,
      })

      await assertRevert(
        market.safeExecuteOrder(
          verifiableErc721.address,
          assetId,
          itemPrice,
          web3.utils.randomHex(32),
          {
            from: seller,
          }
        ),
        'MarketplaceV2#_executeOrder: INVALID_FINGERPRINT'
      )
    })

    it('should fail on execute a created order :: (wrong user)', async function() {
      await createOrder(verifiableErc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })

      await assertRevert(
        market.safeExecuteOrder(
          verifiableErc721.address,
          assetId,
          itemPrice,
          fingerprint,
          { from: seller }
        ),
        'MarketplaceV2#_executeOrder: SENDER_IS_SELLER'
      )
    })

    it('should fail on unsafe executeOrder :: (verifiable NFT registry)', async function() {
      await createOrder(verifiableErc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await assertRevert(
        market.executeOrder(verifiableErc721.address, assetId, itemPrice, {
          from: buyer,
        }),
        'MarketplaceV2#_executeOrder: INVALID_FINGERPRINT'
      )
    })

    it('should fail execute a created order :: (expired)', async function() {
      await createOrder(verifiableErc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })

      // move an hour ahead
      await increaseTime(3600)
      await assertRevert(
        market.safeExecuteOrder(
          verifiableErc721.address,
          assetId,
          itemPrice,
          fingerprint,
          { from: buyer }
        ),
        'MarketplaceV2#_executeOrder: ORDER_EXPIRED'
      )
    })

    it('should fail to execute a created order :: (price mismatch)', async function() {
      await createOrder(verifiableErc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })

      await assertRevert(
        market.safeExecuteOrder(
          verifiableErc721.address,
          assetId,
          itemPrice2,
          fingerprint,
          { from: buyer }
        ),
        'MarketplaceV2#_executeOrder: PRICE_MISMATCH'
      )
    })

    it('should fail to execute a created order :: (seller is not the owner)', async function() {
      await createOrder(verifiableErc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })

      await verifiableErc721.transferFrom(seller, anotherUser, assetId, {
        from: seller,
      })

      await assertRevert(
        market.safeExecuteOrder(
          verifiableErc721.address,
          assetId,
          itemPrice,
          fingerprint,
          { from: buyer }
        ),
        'MarketplaceV2#_executeOrder: SELLER_NOT_OWNER'
      )
    })
  })

  describe('setPublicationFee', function() {
    it('should be initialized to 0', async function() {
      const response = await market.publicationFeeInWei()
      response.should.be.eq.BN(0)
    })

    it('should change publication fee', async function() {
      let publicationFee = web3.utils.toWei('0.005', 'ether')

      const { logs } = await market.setPublicationFee(publicationFee, {
        from: owner,
      })
      let response = await market.publicationFeeInWei()
      response.should.be.eq.BN(publicationFee)
      logs.length.should.be.equal(1)
      checkChangedPublicationFeeLog(logs[0], publicationFee)

      await market.setPublicationFee(0, {
        from: owner,
      })

      response = await market.publicationFeeInWei()
      response.should.be.eq.BN(0)
    })

    it('should change publication fee :: Relayed EIP721', async function() {
      let publicationFee = web3.utils.toWei('0.005', 'ether')

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'uint256',
              name: '_publicationFee',
              type: 'uint256',
            },
          ],
          name: 'setPublicationFee',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [publicationFee]
      )

      const { logs } = await sendMetaTx(
        market,
        functionSignature,
        owner,
        relayer,
        null,
        domain,
        version
      )

      logs.length.should.be.equal(2)
      logs.shift()

      let response = await market.publicationFeeInWei()
      response.should.be.eq.BN(publicationFee)
      logs.length.should.be.equal(1)
      checkChangedPublicationFeeLog(logs[0], publicationFee)
    })

    it('should fail to change publication fee (not owner)', async function() {
      const publicationFee = web3.utils.toWei('0.005', 'ether')

      await assertRevert(
        market.setPublicationFee(publicationFee, { from: seller }),
        'Ownable: caller is not the owner'
      )
    })

    it('should fail to change publication fee (not owner) :: Relayed EIP721', async function() {
      let publicationFee = web3.utils.toWei('0.005', 'ether')

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'uint256',
              name: '_publicationFee',
              type: 'uint256',
            },
          ],
          name: 'setPublicationFee',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [publicationFee]
      )

      await assertRevert(
        sendMetaTx(
          market,
          functionSignature,
          seller,
          relayer,
          null,
          domain,
          version
        )
      )
    })
  })

  describe('setFeesCollector', function() {
    it('should change fee collector', async function() {
      let _feesCollector = await market.feesCollector()
      expect(_feesCollector).to.be.equal(feesCollector)

      const { logs } = await market.setFeesCollector(anotherUser, {
        from: owner,
      })

      _feesCollector = await market.feesCollector()
      expect(_feesCollector).to.be.equal(anotherUser)

      logs.length.should.be.equal(1)
      checkFeesCollectorSetLog(logs[0], feesCollector, anotherUser)

      await market.setFeesCollector(feesCollector, {
        from: owner,
      })

      _feesCollector = await market.feesCollector()
      expect(_feesCollector).to.be.equal(feesCollector)
    })

    it('should change fee collector :: Relayed EIP721', async function() {
      let _feesCollector = await market.feesCollector()
      expect(_feesCollector).to.be.equal(feesCollector)

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: '_feesCollector',
              type: 'address',
            },
          ],
          name: 'setFeesCollector',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [anotherUser]
      )

      const { logs } = await sendMetaTx(
        market,
        functionSignature,
        owner,
        relayer,
        null,
        domain,
        version
      )

      logs.length.should.be.equal(2)
      logs.shift()

      _feesCollector = await market.feesCollector()
      expect(_feesCollector).to.be.equal(anotherUser)

      logs.length.should.be.equal(1)
      checkFeesCollectorSetLog(logs[0], feesCollector, anotherUser)
    })

    it('should fail to change fee collector address zero', async function() {
      await assertRevert(
        market.setFeesCollector(zeroAddress, { from: owner }),
        'MarketplaceV2#setFeesCollector: INVALID_FEES_COLLECTOR'
      )
    })

    it('should fail to change fee collector (not owner)', async function() {
      await assertRevert(
        market.setFeesCollector(anotherUser, { from: seller }),
        'Ownable: caller is not the owner'
      )
    })

    it('should fail to change fee collector (not owner) :: Relayed EIP721', async function() {
      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: '_feesCollector',
              type: 'address',
            },
          ],
          name: 'setFeesCollector',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [anotherUser]
      )

      await assertRevert(
        sendMetaTx(
          market,
          functionSignature,
          seller,
          relayer,
          null,
          domain,
          version
        )
      )
    })
  })

  describe('setRoyaltiesManager', function() {
    it('should change royalties manager', async function() {
      let _royaltiesManager = await market.royaltiesManager()
      expect(_royaltiesManager).to.be.equal(royaltiesManager.address)

      const { logs } = await market.setRoyaltiesManager(erc721.address, {
        from: owner,
      })

      _royaltiesManager = await market.royaltiesManager()
      expect(_royaltiesManager).to.be.equal(erc721.address)

      logs.length.should.be.equal(1)
      checkRoyaltiesManagerSetLog(
        logs[0],
        royaltiesManager.address,
        erc721.address
      )

      await market.setRoyaltiesManager(royaltiesManager.address, {
        from: owner,
      })

      _royaltiesManager = await market.royaltiesManager()
      expect(_royaltiesManager).to.be.equal(royaltiesManager.address)
    })

    it('should change royalties manager :: Relayed EIP721', async function() {
      let _royaltiesManager = await market.royaltiesManager()
      expect(_royaltiesManager).to.be.equal(royaltiesManager.address)

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: '_royaltiesManager',
              type: 'address',
            },
          ],
          name: 'setRoyaltiesManager',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [erc721.address]
      )

      const { logs } = await sendMetaTx(
        market,
        functionSignature,
        owner,
        relayer,
        null,
        domain,
        version
      )

      logs.length.should.be.equal(2)
      logs.shift()

      _royaltiesManager = await market.royaltiesManager()
      expect(_royaltiesManager).to.be.equal(erc721.address)

      logs.length.should.be.equal(1)
      checkRoyaltiesManagerSetLog(
        logs[0],
        royaltiesManager.address,
        erc721.address
      )
    })

    it('should fail to change royalties manager address zero', async function() {
      await assertRevert(
        market.setRoyaltiesManager(zeroAddress, { from: owner }),
        'MarketplaceV2#setRoyaltiesManager: INVALID_ROYALTIES_MANAGER'
      )
    })

    it('should fail to change royalties manager to a not contract', async function() {
      await assertRevert(
        market.setRoyaltiesManager(anotherUser, { from: owner }),
        'MarketplaceV2#setRoyaltiesManager: INVALID_ROYALTIES_MANAGER'
      )
    })

    it('should fail to change royalties manager (not owner)', async function() {
      await assertRevert(
        market.setRoyaltiesManager(erc721.address, { from: seller }),
        'Ownable: caller is not the owner'
      )
    })

    it('should fail to change royalties manager (not owner) :: Relayed EIP721', async function() {
      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: '_royaltiesManager',
              type: 'address',
            },
          ],
          name: 'setRoyaltiesManager',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [anotherUser]
      )

      await assertRevert(
        sendMetaTx(
          market,
          functionSignature,
          seller,
          relayer,
          null,
          domain,
          version
        )
      )
    })
  })

  describe('feesCollectorCutPerMillion', function() {
    it('should be initialized to 0', async function() {
      const response = await market.feesCollectorCutPerMillion()
      response.should.be.eq.BN(0)
    })

    it('should change fee collector sale cut', async function() {
      const feesCollectorCut = 10

      const { logs } = await market.setFeesCollectorCutPerMillion(
        feesCollectorCut,
        {
          from: owner,
        }
      )
      let response = await market.feesCollectorCutPerMillion()
      response.should.be.eq.BN(feesCollectorCut)
      logs.length.should.be.equal(1)
      checkChangedFeesCollectorCutPerMillionLog(logs[0], feesCollectorCut)

      await market.setFeesCollectorCutPerMillion(0, {
        from: owner,
      })
      response = await market.feesCollectorCutPerMillion()
      response.should.be.eq.BN(0)
    })

    it('should change fee collector sale cut :: Relayed EIP721', async function() {
      const feesCollectorCut = 10

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'uint256',
              name: '_feesCollectorCutPerMillion',
              type: 'uint256',
            },
          ],
          name: 'setFeesCollectorCutPerMillion',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [feesCollectorCut]
      )

      const { logs } = await sendMetaTx(
        market,
        functionSignature,
        owner,
        relayer,
        null,
        domain,
        version
      )

      logs.length.should.be.equal(2)
      logs.shift()

      let response = await market.feesCollectorCutPerMillion()
      response.should.be.eq.BN(feesCollectorCut)
      logs.length.should.be.equal(1)
      checkChangedFeesCollectorCutPerMillionLog(logs[0], feesCollectorCut)
    })

    it('should fail to change fee collector cut (% invalid above)', async function() {
      await assertRevert(
        market.setFeesCollectorCutPerMillion(10000000, { from: owner }),
        'MarketplaceV2#setFeesCollectorCutPerMillion: TOTAL_FEES_MUST_BE_BETWEEN_0_AND_999999'
      )
    })

    it('should fail to change fee collector cut (% invalid above along with royalties cut)', async function() {
      await market.setRoyaltiesCutPerMillion(1, { from: owner })

      await assertRevert(
        market.setFeesCollectorCutPerMillion(999999, { from: owner }),
        'MarketplaceV2#setFeesCollectorCutPerMillion: TOTAL_FEES_MUST_BE_BETWEEN_0_AND_999999'
      )
    })

    it('should fail to change fee collector cut (not owner)', async function() {
      const feesCollectorCut = 10

      await assertRevert(
        market.setFeesCollectorCutPerMillion(feesCollectorCut, {
          from: seller,
        }),
        'Ownable: caller is not the owner'
      )
    })

    it('should fail to change fee collector cut (not owner) :: Relayed EIP721', async function() {
      const feesCollectorCut = 10

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'uint256',
              name: '_feesCollectorCutPerMillion',
              type: 'uint256',
            },
          ],
          name: 'setFeesCollectorCutPerMillion',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [feesCollectorCut]
      )

      await assertRevert(
        sendMetaTx(
          market,
          functionSignature,
          seller,
          relayer,
          null,
          domain,
          version
        )
      )
    })
  })

  describe('royaltiesCutPerMillion', function() {
    it('should be initialized to 0', async function() {
      const response = await market.royaltiesCutPerMillion()
      response.should.be.eq.BN(0)
    })

    it('should change royalties cut', async function() {
      const royaltiesCut = 10

      const { logs } = await market.setRoyaltiesCutPerMillion(royaltiesCut, {
        from: owner,
      })
      let response = await market.royaltiesCutPerMillion()
      response.should.be.eq.BN(royaltiesCut)
      logs.length.should.be.equal(1)
      checkChangedRoyaltiesCutPerMillionLog(logs[0], royaltiesCut)

      await market.setRoyaltiesCutPerMillion(0, {
        from: owner,
      })
      response = await market.royaltiesCutPerMillion()
      response.should.be.eq.BN(0)
    })

    it('should change royalties cut :: Relayed EIP721', async function() {
      const royaltiesCut = 10

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'uint256',
              name: '_royaltiesCutPerMillion',
              type: 'uint256',
            },
          ],
          name: 'setRoyaltiesCutPerMillion',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [royaltiesCut]
      )

      const { logs } = await sendMetaTx(
        market,
        functionSignature,
        owner,
        relayer,
        null,
        domain,
        version
      )

      logs.length.should.be.equal(2)
      logs.shift()

      let response = await market.royaltiesCutPerMillion()
      response.should.be.eq.BN(royaltiesCut)
      logs.length.should.be.equal(1)
      checkChangedRoyaltiesCutPerMillionLog(logs[0], royaltiesCut)
    })

    it('should fail to change royalties cut (% invalid above)', async function() {
      await assertRevert(
        market.setRoyaltiesCutPerMillion(10000000, { from: owner }),
        'MarketplaceV2#setRoyaltiesCutPerMillion: TOTAL_FEES_MUST_BE_BETWEEN_0_AND_999999'
      )
    })

    it('should fail to change royalties cut (% invalid above along with fee collector cut)', async function() {
      await market.setFeesCollectorCutPerMillion(1, { from: owner })

      await assertRevert(
        market.setRoyaltiesCutPerMillion(999999, { from: owner }),
        'MarketplaceV2#setRoyaltiesCutPerMillion: TOTAL_FEES_MUST_BE_BETWEEN_0_AND_999999'
      )
    })

    it('should fail to change royalties cut (not owner)', async function() {
      const royaltiesCut = 10

      await assertRevert(
        market.setRoyaltiesCutPerMillion(royaltiesCut, { from: seller }),
        'Ownable: caller is not the owner'
      )
    })

    it('should fail to change royalties cut (not owner) :: Relayed EIP721', async function() {
      const royaltiesCut = 10

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'uint256',
              name: '_royaltiesCutPerMillion',
              type: 'uint256',
            },
          ],
          name: 'setRoyaltiesCutPerMillion',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [royaltiesCut]
      )

      await assertRevert(
        sendMetaTx(
          market,
          functionSignature,
          seller,
          relayer,
          null,
          domain,
          version
        )
      )
    })
  })

  describe('Create with publication fee', function() {
    it('should publish with fee', async function() {
      const balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      // Set token balances
      await erc20.setBalance(owner, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))

      let publicationFee = web3.utils.toWei('0.5', 'ether')

      await market.setPublicationFee(publicationFee, { from: owner })
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })

      let balancePost = await erc20.balanceOf(seller)

      balancePost.should.be.eq.BN(web3.utils.toWei('9.5', 'ether'))
    })

    it('should publish with fee :: Relayed EIP721', async function() {
      const balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      // Set token balances
      await erc20.setBalance(owner, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))

      let publicationFee = web3.utils.toWei('0.5', 'ether')

      await market.setPublicationFee(publicationFee, { from: owner })

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: 'nftAddress',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'assetId',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'priceInWei',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'expiresAt',
              type: 'uint256',
            },
          ],
          name: 'createOrder',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [erc721.address, assetId, itemPrice, endTime]
      )

      await sendMetaTx(
        market,
        functionSignature,
        seller,
        relayer,
        null,
        domain,
        version
      )

      let balancePost = await erc20.balanceOf(seller)

      balancePost.should.be.eq.BN(web3.utils.toWei('9.5', 'ether'))
    })
  })

  describe('Create with cut', function() {
    it('should sell with fees collector sale cut', async function() {
      await erc721Collection.setCreator(itemCreator)
      await erc721Collection.setBeneficiary(itemBeneficiary)

      let balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      balance = await erc20.balanceOf(buyer)
      await erc20.transfer(otherAddress, balance, { from: buyer })

      // Set token balances
      await erc20.setBalance(feesCollector, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(buyer, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemCreator, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemBeneficiary, web3.utils.toWei('10.0', 'ether'))

      let feesCollectorCut = 100000

      await market.setFeesCollectorCutPerMillion(feesCollectorCut, {
        from: owner,
      })
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await executeOrder(erc721.address, assetId, itemPrice, {
        from: buyer,
      })

      // Verify balances
      let feesCollectorBalance = await erc20.balanceOf(feesCollector)
      feesCollectorBalance.should.be.eq.BN(web3.utils.toWei('10.1', 'ether'))

      let itemCreatorBalance = await erc20.balanceOf(itemCreator)
      itemCreatorBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let itemBeneficiaryBalance = await erc20.balanceOf(itemBeneficiary)
      itemBeneficiaryBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let sellerBalance = await erc20.balanceOf(seller)
      sellerBalance.should.be.eq.BN(web3.utils.toWei('10.9', 'ether'))

      let buyerBalance = await erc20.balanceOf(buyer)
      buyerBalance.should.be.eq.BN(web3.utils.toWei('9.0', 'ether'))
    })

    it('should sell with fees collector sale cut :: Relayed EIP721', async function() {
      await erc721Collection.setCreator(itemCreator)
      await erc721Collection.setBeneficiary(itemBeneficiary)

      let balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      balance = await erc20.balanceOf(buyer)
      await erc20.transfer(otherAddress, balance, { from: buyer })

      // Set token balances
      await erc20.setBalance(feesCollector, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(buyer, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemCreator, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemBeneficiary, web3.utils.toWei('10.0', 'ether'))

      let feesCollectorCut = 100000

      await market.setFeesCollectorCutPerMillion(feesCollectorCut, {
        from: owner,
      })
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: 'nftAddress',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'assetId',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'price',
              type: 'uint256',
            },
          ],
          name: 'executeOrder',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [erc721.address, assetId, itemPrice]
      )

      await sendMetaTx(
        market,
        functionSignature,
        buyer,
        relayer,
        null,
        domain,
        version
      )

      // Verify balances
      let feesCollectorBalance = await erc20.balanceOf(feesCollector)
      feesCollectorBalance.should.be.eq.BN(web3.utils.toWei('10.1', 'ether'))

      let itemCreatorBalance = await erc20.balanceOf(itemCreator)
      itemCreatorBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let itemBeneficiaryBalance = await erc20.balanceOf(itemBeneficiary)
      itemBeneficiaryBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let sellerBalance = await erc20.balanceOf(seller)
      sellerBalance.should.be.eq.BN(web3.utils.toWei('10.9', 'ether'))

      let buyerBalance = await erc20.balanceOf(buyer)
      buyerBalance.should.be.eq.BN(web3.utils.toWei('9.0', 'ether'))
    })

    it('should sell with royalties collector sale cut (item beneficiary)', async function() {
      await erc721Collection.setCreator(itemCreator)
      await erc721Collection.setBeneficiary(itemBeneficiary)

      let balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      balance = await erc20.balanceOf(buyer)
      await erc20.transfer(otherAddress, balance, { from: buyer })

      // Set token balances
      await erc20.setBalance(feesCollector, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(buyer, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemCreator, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemBeneficiary, web3.utils.toWei('10.0', 'ether'))

      let royaltiesCutPerMillion = 100000

      await market.setRoyaltiesCutPerMillion(royaltiesCutPerMillion, {
        from: owner,
      })
      await createOrder(erc721Collection.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await executeOrder(erc721Collection.address, assetId, itemPrice, {
        from: buyer,
      })

      // Verify balances
      let feesCollectorBalance = await erc20.balanceOf(feesCollector)
      feesCollectorBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let itemCreatorBalance = await erc20.balanceOf(itemCreator)
      itemCreatorBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let itemBeneficiaryBalance = await erc20.balanceOf(itemBeneficiary)
      itemBeneficiaryBalance.should.be.eq.BN(web3.utils.toWei('10.1', 'ether'))

      let sellerBalance = await erc20.balanceOf(seller)
      sellerBalance.should.be.eq.BN(web3.utils.toWei('10.9', 'ether'))

      let buyerBalance = await erc20.balanceOf(buyer)
      buyerBalance.should.be.eq.BN(web3.utils.toWei('9.0', 'ether'))
    })

    it('should sell with fees collector sale cut (item beneficiary) :: Relayed EIP721', async function() {
      await erc721Collection.setCreator(itemCreator)
      await erc721Collection.setBeneficiary(itemBeneficiary)

      let balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      balance = await erc20.balanceOf(buyer)
      await erc20.transfer(otherAddress, balance, { from: buyer })

      // Set token balances
      await erc20.setBalance(feesCollector, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(buyer, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemCreator, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemBeneficiary, web3.utils.toWei('10.0', 'ether'))

      let royaltiesCutPerMillion = 100000

      await market.setRoyaltiesCutPerMillion(royaltiesCutPerMillion, {
        from: owner,
      })
      await createOrder(erc721Collection.address, assetId, itemPrice, endTime, {
        from: seller,
      })

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: 'nftAddress',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'assetId',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'price',
              type: 'uint256',
            },
          ],
          name: 'executeOrder',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [erc721Collection.address, assetId, itemPrice]
      )

      await sendMetaTx(
        market,
        functionSignature,
        buyer,
        relayer,
        null,
        domain,
        version
      )

      // Verify balances
      let feesCollectorBalance = await erc20.balanceOf(feesCollector)
      feesCollectorBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let itemCreatorBalance = await erc20.balanceOf(itemCreator)
      itemCreatorBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let itemBeneficiaryBalance = await erc20.balanceOf(itemBeneficiary)
      itemBeneficiaryBalance.should.be.eq.BN(web3.utils.toWei('10.1', 'ether'))

      let sellerBalance = await erc20.balanceOf(seller)
      sellerBalance.should.be.eq.BN(web3.utils.toWei('10.9', 'ether'))

      let buyerBalance = await erc20.balanceOf(buyer)
      buyerBalance.should.be.eq.BN(web3.utils.toWei('9.0', 'ether'))
    })

    it('should sell with royalties collector sale cut (item creator)', async function() {
      await erc721Collection.setCreator(itemCreator)
      await erc721Collection.setBeneficiary(itemBeneficiary)

      let balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      balance = await erc20.balanceOf(buyer)
      await erc20.transfer(otherAddress, balance, { from: buyer })

      // Set token balances
      await erc20.setBalance(feesCollector, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(buyer, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemCreator, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemBeneficiary, web3.utils.toWei('10.0', 'ether'))

      let royaltiesCutPerMillion = 100000

      await market.setRoyaltiesCutPerMillion(royaltiesCutPerMillion, {
        from: owner,
      })
      await createOrder(erc721Collection.address, 0, itemPrice, endTime, {
        from: seller,
      })
      await executeOrder(erc721Collection.address, 0, itemPrice, {
        from: buyer,
      })

      // Verify balances
      let feesCollectorBalance = await erc20.balanceOf(feesCollector)
      feesCollectorBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let itemCreatorBalance = await erc20.balanceOf(itemCreator)
      itemCreatorBalance.should.be.eq.BN(web3.utils.toWei('10.1', 'ether'))

      let itemBeneficiaryBalance = await erc20.balanceOf(itemBeneficiary)
      itemBeneficiaryBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let sellerBalance = await erc20.balanceOf(seller)
      sellerBalance.should.be.eq.BN(web3.utils.toWei('10.9', 'ether'))

      let buyerBalance = await erc20.balanceOf(buyer)
      buyerBalance.should.be.eq.BN(web3.utils.toWei('9.0', 'ether'))
    })

    it('should sell and no compute royalties if the receiver is the zero address', async function() {
      await erc721Collection.setCreator(zeroAddress)
      await erc721Collection.setBeneficiary(zeroAddress)

      let balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      balance = await erc20.balanceOf(buyer)
      await erc20.transfer(otherAddress, balance, { from: buyer })

      // Set token balances
      await erc20.setBalance(feesCollector, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(buyer, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemCreator, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemBeneficiary, web3.utils.toWei('10.0', 'ether'))

      let royaltiesCutPerMillion = 100000

      await market.setRoyaltiesCutPerMillion(royaltiesCutPerMillion, {
        from: owner,
      })
      await createOrder(erc721Collection.address, 0, itemPrice, endTime, {
        from: seller,
      })
      await executeOrder(erc721Collection.address, 0, itemPrice, {
        from: buyer,
      })

      // Verify balances
      let feesCollectorBalance = await erc20.balanceOf(feesCollector)
      feesCollectorBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let itemCreatorBalance = await erc20.balanceOf(itemCreator)
      itemCreatorBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let itemBeneficiaryBalance = await erc20.balanceOf(itemBeneficiary)
      itemBeneficiaryBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let sellerBalance = await erc20.balanceOf(seller)
      sellerBalance.should.be.eq.BN(web3.utils.toWei('11.0', 'ether'))

      let buyerBalance = await erc20.balanceOf(buyer)
      buyerBalance.should.be.eq.BN(web3.utils.toWei('9.0', 'ether'))
    })

    it('should sell and compute only fees collector cut if royalties beneficiary is the zero address', async function() {
      await erc721Collection.setCreator(zeroAddress)
      await erc721Collection.setBeneficiary(zeroAddress)

      let balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      balance = await erc20.balanceOf(buyer)
      await erc20.transfer(otherAddress, balance, { from: buyer })

      // Set token balances
      await erc20.setBalance(feesCollector, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(buyer, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemCreator, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemBeneficiary, web3.utils.toWei('10.0', 'ether'))

      let cutPerMillion = 100000

      await market.setFeesCollectorCutPerMillion(cutPerMillion, {
        from: owner,
      })
      await market.setRoyaltiesCutPerMillion(cutPerMillion, {
        from: owner,
      })
      await createOrder(erc721Collection.address, 0, itemPrice, endTime, {
        from: seller,
      })
      await executeOrder(erc721Collection.address, 0, itemPrice, {
        from: buyer,
      })

      // Verify balances
      let feesCollectorBalance = await erc20.balanceOf(feesCollector)
      feesCollectorBalance.should.be.eq.BN(web3.utils.toWei('10.1', 'ether'))

      let itemCreatorBalance = await erc20.balanceOf(itemCreator)
      itemCreatorBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let itemBeneficiaryBalance = await erc20.balanceOf(itemBeneficiary)
      itemBeneficiaryBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let sellerBalance = await erc20.balanceOf(seller)
      sellerBalance.should.be.eq.BN(web3.utils.toWei('10.9', 'ether'))

      let buyerBalance = await erc20.balanceOf(buyer)
      buyerBalance.should.be.eq.BN(web3.utils.toWei('9.0', 'ether'))
    })

    it('should sell and compute only fees collector cut if the NFT is not a collection interface compliant', async function() {
      await erc721Collection.setCreator(itemCreator)
      await erc721Collection.setBeneficiary(itemBeneficiary)

      let balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      balance = await erc20.balanceOf(buyer)
      await erc20.transfer(otherAddress, balance, { from: buyer })

      // Set token balances
      await erc20.setBalance(feesCollector, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(buyer, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemCreator, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemBeneficiary, web3.utils.toWei('10.0', 'ether'))

      let cutPerMillion = 100000

      await market.setFeesCollectorCutPerMillion(cutPerMillion, {
        from: owner,
      })
      await market.setRoyaltiesCutPerMillion(cutPerMillion, {
        from: owner,
      })
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await executeOrder(erc721.address, assetId, itemPrice, {
        from: buyer,
      })

      // Verify balances
      let feesCollectorBalance = await erc20.balanceOf(feesCollector)
      feesCollectorBalance.should.be.eq.BN(web3.utils.toWei('10.1', 'ether'))

      let itemCreatorBalance = await erc20.balanceOf(itemCreator)
      itemCreatorBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let itemBeneficiaryBalance = await erc20.balanceOf(itemBeneficiary)
      itemBeneficiaryBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let sellerBalance = await erc20.balanceOf(seller)
      sellerBalance.should.be.eq.BN(web3.utils.toWei('10.9', 'ether'))

      let buyerBalance = await erc20.balanceOf(buyer)
      buyerBalance.should.be.eq.BN(web3.utils.toWei('9.0', 'ether'))
    })

    it('should sell and compute only fees collector cut if royalties manager is invalid (not collection compliant)', async function() {
      await erc721Collection.setCreator(itemCreator)
      await erc721Collection.setBeneficiary(itemBeneficiary)

      await market.setRoyaltiesManager(erc721.address, { from: owner })

      let balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      balance = await erc20.balanceOf(buyer)
      await erc20.transfer(otherAddress, balance, { from: buyer })

      // Set token balances
      await erc20.setBalance(feesCollector, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(buyer, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemCreator, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemBeneficiary, web3.utils.toWei('10.0', 'ether'))

      let cutPerMillion = 100000

      await market.setFeesCollectorCutPerMillion(cutPerMillion, {
        from: owner,
      })
      await market.setRoyaltiesCutPerMillion(cutPerMillion, {
        from: owner,
      })
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await executeOrder(erc721.address, assetId, itemPrice, {
        from: buyer,
      })

      // Verify balances
      let feesCollectorBalance = await erc20.balanceOf(feesCollector)
      feesCollectorBalance.should.be.eq.BN(web3.utils.toWei('10.1', 'ether'))

      let itemCreatorBalance = await erc20.balanceOf(itemCreator)
      itemCreatorBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let itemBeneficiaryBalance = await erc20.balanceOf(itemBeneficiary)
      itemBeneficiaryBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let sellerBalance = await erc20.balanceOf(seller)
      sellerBalance.should.be.eq.BN(web3.utils.toWei('10.9', 'ether'))

      let buyerBalance = await erc20.balanceOf(buyer)
      buyerBalance.should.be.eq.BN(web3.utils.toWei('9.0', 'ether'))
    })

    it('should sell and compute only fees collector cut if royalties manager is invalid (collection compliant)', async function() {
      await erc721Collection.setCreator(itemCreator)
      await erc721Collection.setBeneficiary(itemBeneficiary)

      await market.setRoyaltiesManager(erc721.address, { from: owner })

      let balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      balance = await erc20.balanceOf(buyer)
      await erc20.transfer(otherAddress, balance, { from: buyer })

      // Set token balances
      await erc20.setBalance(feesCollector, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(buyer, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemCreator, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemBeneficiary, web3.utils.toWei('10.0', 'ether'))

      let cutPerMillion = 100000

      await market.setFeesCollectorCutPerMillion(cutPerMillion, {
        from: owner,
      })
      await market.setRoyaltiesCutPerMillion(cutPerMillion, {
        from: owner,
      })
      await createOrder(erc721Collection.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await executeOrder(erc721Collection.address, assetId, itemPrice, {
        from: buyer,
      })

      // Verify balances
      let feesCollectorBalance = await erc20.balanceOf(feesCollector)
      feesCollectorBalance.should.be.eq.BN(web3.utils.toWei('10.1', 'ether'))

      let itemCreatorBalance = await erc20.balanceOf(itemCreator)
      itemCreatorBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let itemBeneficiaryBalance = await erc20.balanceOf(itemBeneficiary)
      itemBeneficiaryBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let sellerBalance = await erc20.balanceOf(seller)
      sellerBalance.should.be.eq.BN(web3.utils.toWei('10.9', 'ether'))

      let buyerBalance = await erc20.balanceOf(buyer)
      buyerBalance.should.be.eq.BN(web3.utils.toWei('9.0', 'ether'))
    })

    it('should sell and compute both fees', async function() {
      await erc721Collection.setCreator(itemCreator)
      await erc721Collection.setBeneficiary(itemBeneficiary)

      let balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      balance = await erc20.balanceOf(buyer)
      await erc20.transfer(otherAddress, balance, { from: buyer })

      // Set token balances
      await erc20.setBalance(feesCollector, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(buyer, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemCreator, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(itemBeneficiary, web3.utils.toWei('10.0', 'ether'))

      let cutPerMillion = 100000

      await market.setFeesCollectorCutPerMillion(cutPerMillion, {
        from: owner,
      })
      await market.setRoyaltiesCutPerMillion(cutPerMillion, {
        from: owner,
      })
      await createOrder(erc721Collection.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await executeOrder(erc721Collection.address, assetId, itemPrice, {
        from: buyer,
      })

      // Verify balances
      let feesCollectorBalance = await erc20.balanceOf(feesCollector)
      feesCollectorBalance.should.be.eq.BN(web3.utils.toWei('10.1', 'ether'))

      let itemCreatorBalance = await erc20.balanceOf(itemCreator)
      itemCreatorBalance.should.be.eq.BN(web3.utils.toWei('10.0', 'ether'))

      let itemBeneficiaryBalance = await erc20.balanceOf(itemBeneficiary)
      itemBeneficiaryBalance.should.be.eq.BN(web3.utils.toWei('10.1', 'ether'))

      let sellerBalance = await erc20.balanceOf(seller)
      sellerBalance.should.be.eq.BN(web3.utils.toWei('10.8', 'ether'))

      let buyerBalance = await erc20.balanceOf(buyer)
      buyerBalance.should.be.eq.BN(web3.utils.toWei('9.0', 'ether'))
    })
  })
})
