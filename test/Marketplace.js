const BigNumber = web3.BigNumber

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const EVMThrow = 'invalid opcode'
const EVMRevert = 'VM Exception while processing transaction: revert'

const ERC20Mock = artifacts.require('FakeERC20')
const ERC721Mock = artifacts.require('FakeERC721')
const Marketplace = artifacts.require('Marketplace')

const { increaseTime, duration } = require('./helpers/increaseTime')

function checkAuctionCreatedLog(log, assetId, seller, priceInWei, expiresAt) {
  log.event.should.be.eq('AuctionCreated')
  log.args.assetId.should.be.bignumber.equal(assetId)
  log.args.seller.should.be.equal(seller)
  log.args.priceInWei.should.be.bignumber.equal(priceInWei)
  log.args.expiresAt.should.be.bignumber.equal(expiresAt)
}

function checkAuctionCancelledLog(log, assetId, seller) {
  log.event.should.be.eq('AuctionCancelled')
  log.args.assetId.should.be.bignumber.equal(assetId)
  log.args.seller.should.be.equal(seller)
}

function checkAuctionSuccessfulLog(log, assetId, seller, totalPrice, winner) {
  log.event.should.be.eq('AuctionSuccessful')
  log.args.assetId.should.be.bignumber.equal(assetId)
  log.args.seller.should.be.equal(seller)
  log.args.totalPrice.should.be.bignumber.equal(totalPrice)
  log.args.winner.should.be.equal(winner)
}

contract('Marketplace', function([_, owner, seller, buyer]) {
  let endTime = web3.eth.getBlock('latest').timestamp + duration.minutes(5)
  let assetId = 10000

  let market
  let erc20
  let erc721

  beforeEach(async function() {
    erc20 = await ERC20Mock.new({ from: owner })
    erc721 = await ERC721Mock.new({ from: owner })

    // Create a Marketplace with mocks
    market = await Marketplace.new(erc20.address, erc721.address, {
      from: owner
    })

    // Set holder of the asset and aproved on registry
    await erc721.setAssetHolder(seller, assetId)
    await erc721.setApprovalForAll(market.address, true, { from: seller })
    await erc721.setApprovalForAll(market.address, true, { from: buyer })

    // Assign balance to buyer and allow marketplace to move ERC20
    await erc20.setBalance(buyer, web3.toWei(10, 'ether'))
    await erc20.approve(market.address, 1e30, { from: seller })
    await erc20.approve(market.address, 1e30, { from: buyer })
  })

  // Create

  it('should create a new order', async function() {
    let itemPrice = web3.toWei(1, 'ether')

    const { logs } = await market.createOrder(assetId, itemPrice, endTime, {
      from: seller
    })

    // Event emitted
    logs.length.should.be.equal(1)
    checkAuctionCreatedLog(logs[0], assetId, seller, itemPrice, endTime)

    // Check data
    let s = await market.auctionByAssetId(assetId)
    s[1].should.be.equal(seller)
    s[2].should.be.bignumber.equal(itemPrice)
    s[3].should.be.bignumber.equal(endTime)
  })

  it('should update an order', async function() {
    let newPrice = web3.toWei(2.0, 'ether')
    let newEndTime = endTime + duration.minutes(5)

    const { logs } = await market.createOrder(assetId, newPrice, newEndTime, {
      from: seller
    })

    // Event emitted
    logs.length.should.be.equal(1)
    checkAuctionCreatedLog(logs[0], assetId, seller, newPrice, newEndTime)

    // Check data
    let s = await market.auctionByAssetId(assetId)
    s[1].should.be.equal(seller)
    s[2].should.be.bignumber.equal(newPrice)
    s[3].should.be.bignumber.equal(newEndTime)
  })

  // Cancel

  it('should cancel a created order', async function() {
    let itemPrice = web3.toWei(1.0, 'ether')

    await market.createOrder(assetId, itemPrice, endTime, {
      from: seller
    })
    const { logs } = await market.cancelOrder(assetId, { from: seller })

    // Event emitted
    logs.length.should.be.equal(1)
    checkAuctionCancelledLog(logs[0], assetId, seller)
  })

  it('should fail canceling an order', async function() {
    let itemPrice = web3.toWei(1.0, 'ether')

    await market.createOrder(assetId, itemPrice, endTime, {
      from: seller
    })
    await market
      .cancelOrder(assetId, { from: buyer })
      .should.be.rejectedWith(EVMRevert)
  })

  // Execute

  it('should execute a created order', async function() {
    let itemPrice = web3.toWei(1.0, 'ether')

    await market.createOrder(assetId, itemPrice, endTime, {
      from: seller
    })
    const { logs } = await market.executeOrder(assetId, itemPrice, { from: buyer })

    // Event emitted
    logs.length.should.be.equal(1)
    checkAuctionSuccessfulLog(logs[0], assetId, seller, itemPrice, buyer)
  })

  it('should fail on execute a created order :: (wrong user)', async function() {
    let itemPrice = web3.toWei(1.0, 'ether')

    await market.createOrder(assetId, itemPrice, endTime, {
      from: seller
    })
    await market
      .executeOrder(assetId, itemPrice, { from: seller })
      .should.be.rejectedWith(EVMRevert)
  })

  it('should fail execute a created order :: (expired)', async function() {
    let itemPrice = web3.toWei(1.0, 'ether')

    await market.createOrder(assetId, itemPrice, endTime, {
      from: seller
    })

    // move 10 mins ahead.
    await increaseTime(600)
    await market
      .executeOrder(assetId, itemPrice, { from: buyer })
      .should.be.rejectedWith(EVMRevert)
  })

  // Test change publication Fees.
  it('should change publication Fee', async function() {
    let publicationFee = web3.toWei(0.005, 'ether')

    await market.setPublicationFee(publicationFee, { from: owner })
    let r = await market.publicationFeeInWei()
    r.should.be.bignumber.equal(publicationFee)
  })

  it('should fail to change publication Fee (not owner)', async function() {
    let publicationFee = web3.toWei(0.005, 'ether')

    await market
      .setPublicationFee(publicationFee, { from: seller })
      .should.be.rejectedWith(EVMRevert)
  })

  // Test owner sale cut.
  it('should change owner sale cut', async function() {
    let ownerCut = 10

    await market.setOwnerCut(ownerCut, { from: owner })
    let r = await market.ownerCutPercentage()
    r.should.be.bignumber.equal(ownerCut)
  })

  it('should fail to change owner cut (% invalid)', async function() {
    let ownerCut = 200

    await market
      .setOwnerCut(ownerCut, { from: owner })
      .should.be.rejectedWith(EVMRevert)
  })

  it('should fail to change owner cut (not owner)', async function() {
    let ownerCut = 10

    await market
      .setOwnerCut(ownerCut, { from: seller })
      .should.be.rejectedWith(EVMRevert)
  })

  // Test publish with fee

  it('should publish with fee', async function() {
    // Set token balances
    erc20.setBalance(owner, web3.toWei(10.0, 'ether'))
    erc20.setBalance(seller, web3.toWei(10.0, 'ether'))

    let itemPrice = web3.toWei(1.0, 'ether')
    let publicationFee = web3.toWei(0.5, 'ether')

    let newEndtime = web3.eth.getBlock('latest').timestamp + duration.minutes(5)

    await market.setPublicationFee(publicationFee, { from: owner })
    await market.createOrder(assetId, itemPrice, newEndtime, {
      from: seller
    })

    let balancePost = await erc20.balanceOf(seller)

    balancePost.should.be.bignumber.equal(web3.toWei(9.5, 'ether'))
  })

  it('should sell with owner sale cut', async function() {
    // Set token balances
    erc20.setBalance(owner, web3.toWei(10.0, 'ether'))
    erc20.setBalance(buyer, web3.toWei(10.0, 'ether'))
    erc20.setBalance(seller, web3.toWei(10.0, 'ether'))

    let ownerCut = 10
    let itemPrice = web3.toWei(1.0, 'ether')
    let newEndtime = web3.eth.getBlock('latest').timestamp + duration.minutes(5)

    await market.setOwnerCut(ownerCut, { from: owner })
    await market.createOrder(assetId, itemPrice, newEndtime, {
      from: seller
    })
    await market.executeOrder(assetId, itemPrice, { from: buyer })

    // Verify balances
    let ownerBalance = await erc20.balanceOf(owner)
    ownerBalance.should.be.bignumber.equal(web3.toWei(10.1, 'ether'))

    let sellerBalance = await erc20.balanceOf(seller)
    sellerBalance.should.be.bignumber.equal(web3.toWei(10.9, 'ether'))

    let buyerBalance = await erc20.balanceOf(buyer)
    buyerBalance.should.be.bignumber.equal(web3.toWei(9.0, 'ether'))
  })
})
