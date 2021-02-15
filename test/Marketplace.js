const BigNumber = web3.BigNumber

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const BN = web3.utils.BN
const expect = require('chai').use(require('bn-chai')(BN)).expect

const abiDecoder = require('abi-decoder')

const EVMRevert = 'VM Exception while processing transaction: revert'

const Marketplace = artifacts.require('MarketplaceTest')
const ERC20Token = artifacts.require('ERC20Test')
const ERC721Token = artifacts.require('ERC721Test')
const VerfiableERC721Token = artifacts.require('VerifiableERC721Test')

const { increaseTime, duration } = require('./helpers/increaseTime')
const { sendMetaTx } = require('./helpers/metaTx')

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

function checkChangedOwnerCutPerMillionLog(log, ownerCutPerMillion) {
  log.event.should.be.equal('ChangedOwnerCutPerMillion')
  log.args.ownerCutPerMillion.should.be.eq.BN(
    ownerCutPerMillion,
    'ownerCutPerMillion'
  )
}

async function getEndTime(minutesAhead = 15) {
  const block = await web3.eth.getBlock('latest')
  return block.timestamp + duration.minutes(minutesAhead)
}

contract('Marketplace', function([
  _,
  owner,
  seller,
  buyer,
  otherAddress,
  relayer,
]) {
  const itemPrice = web3.utils.toWei('1', 'ether')
  const assetId = 10000
  const notLegacyAssetId = 2
  const zeroAddress = '0x0000000000000000000000000000000000000000'
  const domain = 'Decentraland Marketplace'
  const version = '1'

  let market
  let erc20
  let erc721
  let verifiableErc721

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

    // Create a Marketplace with mocks
    market = await Marketplace.new(erc20.address, 0, owner, {
      from: owner,
    })

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
      let _market = await Marketplace.new(erc20.address, 0, owner, {
        from: owner,
      })
      let acceptedToken = await _market.acceptedToken.call()

      acceptedToken.should.be.equal(erc20.address)
    })

    it('should revert if token is invalid', async function() {
      await Marketplace.new(zeroAddress, 0, owner, {
        from: owner,
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should revert if fee is invalid address is invalid', async function() {
      await Marketplace.new(erc20.address, 1000000, owner, {
        from: owner,
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should revert if owner is invalid', async function() {
      await Marketplace.new(erc20.address, 0, zeroAddress, {
        from: owner,
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

      await createOrder(erc721.address, newAssetId, itemPrice, endTime, {
        from: seller,
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should fail to create an order :: (address not the owner of asset)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: otherAddress,
      }).should.be.rejectedWith(EVMRevert)
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

      await sendMetaTx(
        market,
        functionSignature,
        otherAddress,
        relayer,
        null,
        domain,
        version
      ).should.be.rejectedWith(EVMRevert)
    })

    it('should fail to create an order :: (price is 0)', async function() {
      await market
        .createOrder(erc721.address, assetId, 0, endTime, { from: seller })
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail to create an order :: (expires too soon)', async function() {
      const newTime =
        (await web3.eth.getBlock('latest')).timestamp + duration.seconds(59)
      await market
        .createOrder(erc721.address, assetId, itemPrice, newTime, {
          from: seller,
        })
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail to create an order :: (nft not approved)', async function() {
      await erc721.setApprovalForAll(market.address, false, { from: seller })
      await market
        .createOrder(erc721.address, assetId, itemPrice, endTime, {
          from: seller,
        })
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail to create an order :: (publication fee not paid)', async function() {
      await erc20.approve(market.address, 1, { from: seller })
      await market.setPublicationFee(2, { from: owner })
      await market
        .createOrder(erc721.address, assetId, itemPrice, endTime, {
          from: seller,
        })
        .should.be.rejectedWith(EVMRevert)
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
      await cancelOrder(erc721.address, assetId, {
        from: buyer,
      }).should.be.rejectedWith(EVMRevert)
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

      await sendMetaTx(
        market,
        functionSignature,
        buyer,
        relayer,
        null,
        domain,
        version
      ).should.be.rejectedWith(EVMRevert)
    })

    it('should fail canceling an order :: (wrong NFT address)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await cancelOrder(erc20.address, assetId, {
        from: seller,
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should fail canceling an order :: (double cancel)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await cancelOrder(erc721.address, assetId, { from: seller })

      await cancelOrder(erc721.address, assetId, {
        from: seller,
      }).should.be.rejectedWith(EVMRevert)
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

      await executeOrder(erc721.address, assetId, itemPrice, {
        from: seller,
      }).should.be.rejectedWith(EVMRevert)
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
      await executeOrder(erc721.address, assetId, itemPrice, {
        from: buyer,
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should fail on execute a created order :: (double execute)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await executeOrder(erc721.address, assetId, itemPrice, {
        from: buyer,
      })

      await executeOrder(erc721.address, assetId, itemPrice, {
        from: buyer,
      }).should.be.rejectedWith(EVMRevert)
    })

    it('should fail to execute a created order :: (not an ERC721 contract)', async function() {
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
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

      await market
        .safeExecuteOrder(
          verifiableErc721.address,
          assetId,
          itemPrice,
          web3.utils.randomHex(32),
          {
            from: seller,
          }
        )
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail on execute a created order :: (wrong user)', async function() {
      await createOrder(verifiableErc721.address, assetId, itemPrice, endTime, {
        from: seller,
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
        from: seller,
      })
      await market
        .executeOrder(verifiableErc721.address, assetId, itemPrice, {
          from: buyer,
        })
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail execute a created order :: (expired)', async function() {
      await createOrder(verifiableErc721.address, assetId, itemPrice, endTime, {
        from: seller,
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

      await market
        .setPublicationFee(publicationFee, { from: seller })
        .should.be.rejectedWith(EVMRevert)
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

      await sendMetaTx(
        market,
        functionSignature,
        seller,
        relayer,
        null,
        domain,
        version
      ).should.be.rejectedWith(EVMRevert)
    })
  })

  describe('ownerCutPerMillion', function() {
    it('should be initialized to 0', async function() {
      const response = await market.ownerCutPerMillion()
      response.should.be.eq.BN(0)
    })

    it('should change owner sale cut', async function() {
      const ownerCut = 10

      const { logs } = await market.setOwnerCutPerMillion(ownerCut, {
        from: owner,
      })
      let response = await market.ownerCutPerMillion()
      response.should.be.eq.BN(ownerCut)
      logs.length.should.be.equal(1)
      checkChangedOwnerCutPerMillionLog(logs[0], ownerCut)

      await market.setOwnerCutPerMillion(0, {
        from: owner,
      })
      response = await market.ownerCutPerMillion()
      response.should.be.eq.BN(0)
    })

    it('should change owner sale cut :: Relayed EIP721', async function() {
      const ownerCut = 10

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'uint256',
              name: '_ownerCutPerMillion',
              type: 'uint256',
            },
          ],
          name: 'setOwnerCutPerMillion',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [ownerCut]
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

      let response = await market.ownerCutPerMillion()
      response.should.be.eq.BN(ownerCut)
      logs.length.should.be.equal(1)
      checkChangedOwnerCutPerMillionLog(logs[0], ownerCut)
    })

    it('should fail to change owner cut (% invalid above)', async function() {
      await market
        .setOwnerCutPerMillion(10000000, { from: owner })
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail to change owner cut (not owner)', async function() {
      const ownerCut = 10

      await market
        .setOwnerCutPerMillion(ownerCut, { from: seller })
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail to change owner cut (not owner) :: Relayed EIP721', async function() {
      const ownerCut = 10

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'uint256',
              name: '_ownerCutPerMillion',
              type: 'uint256',
            },
          ],
          name: 'setOwnerCutPerMillion',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        [ownerCut]
      )

      await sendMetaTx(
        market,
        functionSignature,
        seller,
        relayer,
        null,
        domain,
        version
      ).should.be.rejectedWith(EVMRevert)
    })
  })

  describe('Create with fee', function() {
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

  describe('Create with owner cut', function() {
    it('should sell with owner sale cut', async function() {
      let balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      balance = await erc20.balanceOf(buyer)
      await erc20.transfer(otherAddress, balance, { from: buyer })

      // Set token balances
      await erc20.setBalance(owner, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(buyer, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))

      let ownerCut = 100000

      await market.setOwnerCutPerMillion(ownerCut, { from: owner })
      await createOrder(erc721.address, assetId, itemPrice, endTime, {
        from: seller,
      })
      await executeOrder(erc721.address, assetId, itemPrice, {
        from: buyer,
      })

      // Verify balances
      let ownerBalance = await erc20.balanceOf(owner)
      ownerBalance.should.be.eq.BN(web3.utils.toWei('10.1', 'ether'))

      let sellerBalance = await erc20.balanceOf(seller)
      sellerBalance.should.be.eq.BN(web3.utils.toWei('10.9', 'ether'))

      let buyerBalance = await erc20.balanceOf(buyer)
      buyerBalance.should.be.eq.BN(web3.utils.toWei('9.0', 'ether'))
    })

    it('should sell with owner sale cut :: Relayed EIP721', async function() {
      let balance = await erc20.balanceOf(seller)
      await erc20.transfer(otherAddress, balance, { from: seller })

      balance = await erc20.balanceOf(buyer)
      await erc20.transfer(otherAddress, balance, { from: buyer })

      // Set token balances
      await erc20.setBalance(owner, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(buyer, web3.utils.toWei('10.0', 'ether'))
      await erc20.setBalance(seller, web3.utils.toWei('10.0', 'ether'))

      let ownerCut = 100000

      await market.setOwnerCutPerMillion(ownerCut, { from: owner })
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
      let ownerBalance = await erc20.balanceOf(owner)
      ownerBalance.should.be.eq.BN(web3.utils.toWei('10.1', 'ether'))

      let sellerBalance = await erc20.balanceOf(seller)
      sellerBalance.should.be.eq.BN(web3.utils.toWei('10.9', 'ether'))

      let buyerBalance = await erc20.balanceOf(buyer)
      buyerBalance.should.be.eq.BN(web3.utils.toWei('9.0', 'ether'))
    })
  })
})
