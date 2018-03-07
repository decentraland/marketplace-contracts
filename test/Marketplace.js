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

contract('Marketplace', function([_, owner, seller, buyer]) {
  let endtime = web3.eth.getBlock('latest').timestamp + duration.minutes(5)
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
    await erc721.setAssetHolder(seller)
    await erc721.setApprovalForAll(market.address, true)
  })

  it('should create a new order', async function() {
    let itemPrice = web3.toWei(1, 'ether')

    await market.createOrder(assetId, itemPrice, endtime, {
      from: seller
    })

    let s = await market.auctionList(assetId)

    s[0].should.be.equal(seller)
    s[1].should.be.bignumber.equal(itemPrice)
    s[3].should.be.bignumber.equal(endtime)
  })

  it('should update an order', async function() {
    let newPrice = web3.toWei(2.0, 'ether')
    let newEndTime = endtime + duration.minutes(5)

    await market.createOrder(assetId, newPrice, newEndTime, {
      from: seller
    })

    let s = await market.auctionList(assetId)

    s[0].should.be.equal(seller)
    s[1].should.be.bignumber.equal(newPrice)
    s[3].should.be.bignumber.equal(newEndTime)
  })

  // cancel

  it('should cancel a created order', async function() {
    let itemPrice = web3.toWei(1.0, 'ether')

    await market.createOrder(assetId, itemPrice, endtime, {
      from: seller
    })
    await market.cancelOrder(assetId, { from: seller })
  })

  it('should fail canceling an order', async function() {
    let itemPrice = web3.toWei(1.0, 'ether')

    await market.createOrder(assetId, itemPrice, endtime, {
      from: seller
    })
    await market
      .cancelOrder(assetId, { from: buyer })
      .should.be.rejectedWith(EVMRevert)
  })

  // Execute

  it('should execute a created order', async function() {
    let itemPrice = web3.toWei(1.0, 'ether')

    await market.createOrder(assetId, itemPrice, endtime, {
      from: seller
    })
    await market.executeOrder(assetId, itemPrice, { from: buyer })
  })

  it('should fail on execute a created order :: (wrong user)', async function() {
    let itemPrice = web3.toWei(1.0, 'ether')

    await market.createOrder(assetId, itemPrice, endtime, {
      from: seller
    })
    await market
      .executeOrder(assetId, itemPrice, { from: seller })
      .should.be.rejectedWith(EVMRevert)
  })

  it('should fail execute a created order :: (expired)', async function() {
    let itemPrice = web3.toWei(1.0, 'ether')

    await market.createOrder(assetId, itemPrice, endtime, {
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

  // Test publish with fee.

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
