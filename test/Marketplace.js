const BigNumber = web3.BigNumber

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const EVMThrow = 'invalid opcode'
const EVMRevert = 'VM Exception while processing transaction: revert'

const ERC20Token = artifacts.require('FakeERC20')
const ERC721Token = artifacts.require("FakeERC721");
const Marketplace = artifacts.require('Marketplace')

const { increaseTime, duration } = require('./helpers/increaseTime')

function checkAuctionCreatedLog(log, assetId, seller, nftAddress, priceInWei, expiresAt) {
  log.event.should.be.eq('AuctionCreated')
  log.args.assetId.should.be.bignumber.equal(assetId, 'assetId')
  log.args.seller.should.be.equal(seller, 'seller')
  log.args.nftAddress.should.be.equal(nftAddress, 'nftAddress')
  log.args.priceInWei.should.be.bignumber.equal(priceInWei, 'priceInWei')
  log.args.expiresAt.should.be.bignumber.equal(expiresAt, 'expiresAt')
}

function checkAuctionCancelledLog(log, assetId, seller, nftAddress) {
  log.event.should.be.eq('AuctionCancelled')
  log.args.assetId.should.be.bignumber.equal(assetId, 'assetId')
  log.args.seller.should.be.equal(seller, 'seller')
  log.args.nftAddress.should.be.equal(nftAddress, 'nftAddress')
}

function checkAuctionSuccessfulLog(log, assetId, seller, nftAddress, totalPrice, winner) {
  log.event.should.be.eq('AuctionSuccessful')
  log.args.assetId.should.be.bignumber.equal(assetId, 'assetId')
  log.args.seller.should.be.equal(seller, 'seller')
  log.args.nftAddress.should.be.equal(nftAddress, 'nftAddress')
  log.args.totalPrice.should.be.bignumber.equal(totalPrice, 'totalPrice')
  log.args.winner.should.be.equal(winner, 'winner')
}

contract('Marketplace', function([_, owner, seller, buyer]) {
  let endTime = web3.eth.getBlock('latest').timestamp + duration.minutes(5)
  let assetId = 10000

  let market
  let erc20
  let erc721

  const creationParams = {
    gas: 6e6,
    gasPrice: 21e9,
  }

  beforeEach(async function() {
    // Create tokens
    erc20 = await ERC20Token.new({ from: owner })
    erc721 = await ERC721Token.new('LAND', 'DCL', { from: owner, ...creationParams })

    // Create a Marketplace with mocks
    market = await Marketplace.new(erc20.address, {
      from: owner
    })

    // Set holder of the asset and aproved on registry
    await erc721.mint(seller, assetId)
    await erc721.setApprovalForAll(market.address, true, { from: seller })
    await erc721.setApprovalForAll(market.address, true, { from: buyer })

    // Assign balance to buyer and allow marketplace to move ERC20
    await erc20.setBalance(buyer, web3.toWei(10, 'ether'))
    await erc20.approve(market.address, 1e30, { from: seller })
    await erc20.approve(market.address, 1e30, { from: buyer })
  })

  describe('Create', function() {
    it('should create a new order', async function() {
      let itemPrice = web3.toWei(1, 'ether')

      const { logs } = await market.createOrder(assetId, erc721.address, itemPrice, endTime, {
        from: seller
      })

      // Event emitted
      logs.length.should.be.equal(1)
      checkAuctionCreatedLog(logs[0], assetId, seller, erc721.address, itemPrice, endTime)

      // Check data
      let s = await market.auctionByAssetId(assetId)
      s[1].should.be.equal(seller)
      s[2].should.be.equal(erc721.address)
      s[3].should.be.bignumber.equal(itemPrice)
      s[4].should.be.bignumber.equal(endTime)
    })

    it('should update an order', async function() {
      let newPrice = web3.toWei(2.0, 'ether')
      let newEndTime = endTime + duration.minutes(5)

      const { logs } = await market.createOrder(assetId, erc721.address, newPrice, newEndTime, {
        from: seller
      })

      // Event emitted
      logs.length.should.be.equal(1)
      checkAuctionCreatedLog(logs[0], assetId, seller, erc721.address, newPrice, newEndTime)

      // Check data
      let s = await market.auctionByAssetId(assetId)
      s[1].should.be.equal(seller)
      s[2].should.be.equal(erc721.address)
      s[3].should.be.bignumber.equal(newPrice)
      s[4].should.be.bignumber.equal(newEndTime)
    })

    it('should fail to create an order :: (not a contract)', async function() {
      let itemPrice = web3.toWei(1.0, 'ether')

      await market
        .createOrder(assetId, erc20.address, itemPrice, endTime, {
          from: seller
        })
        .should.be.rejectedWith(EVMRevert)
    })
  })

  describe('Cancel', function () {
    it('should cancel a created order', async function() {
      let itemPrice = web3.toWei(1.0, 'ether')

      await market.createOrder(assetId, erc721.address, itemPrice, endTime, {
        from: seller
      })
      const { logs } = await market.cancelOrder(assetId, { from: seller })

      // Event emitted
      logs.length.should.be.equal(1)
      checkAuctionCancelledLog(logs[0], assetId, seller, erc721.address)
    })

    it('should fail canceling an order :: (wrong user)', async function() {
      let itemPrice = web3.toWei(1.0, 'ether')

      await market.createOrder(assetId, erc721.address, itemPrice, endTime, {
        from: seller
      })
      await market
        .cancelOrder(assetId, { from: buyer })
        .should.be.rejectedWith(EVMRevert)
    })
  })
  
  describe('Execute', function() {
    it('should execute a created order', async function() {
      let itemPrice = web3.toWei(1.0, 'ether')

      await market.createOrder(assetId, erc721.address, itemPrice, endTime, {
        from: seller
      })
      const { logs } = await market.executeOrder(assetId, itemPrice, { from: buyer })

      // Event emitted
      logs.length.should.be.equal(1)
      checkAuctionSuccessfulLog(logs[0], assetId, seller, erc721.address, itemPrice, buyer)
    })

    it('should fail on execute a created order :: (wrong user)', async function() {
      let itemPrice = web3.toWei(1.0, 'ether')

      await market.createOrder(assetId, erc721.address, itemPrice, endTime, {
        from: seller
      })
      await market
        .executeOrder(assetId, itemPrice, { from: seller })
        .should.be.rejectedWith(EVMRevert)
    })

    it('should fail execute a created order :: (expired)', async function() {
      let itemPrice = web3.toWei(1.0, 'ether')

      await market.createOrder(assetId, erc721.address, itemPrice, endTime, {
        from: seller
      })

      // move 10 mins ahead.
      await increaseTime(600)
      await market
        .executeOrder(assetId, itemPrice, { from: buyer })
        .should.be.rejectedWith(EVMRevert)
    })
  })

  describe('setPublicationFee', function() {
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
  })

  // Test owner sale cut.
  describe('ownerCutPercentage', function() {
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
  })

  describe('Create with fee', function() {
    it('should publish with fee', async function() {
      // Set token balances
      erc20.setBalance(owner, web3.toWei(10.0, 'ether'))
      erc20.setBalance(seller, web3.toWei(10.0, 'ether'))

      let itemPrice = web3.toWei(1.0, 'ether')
      let publicationFee = web3.toWei(0.5, 'ether')

      let newEndtime = web3.eth.getBlock('latest').timestamp + duration.minutes(5)

      await market.setPublicationFee(publicationFee, { from: owner })
      await market.createOrder(assetId, erc721.address, itemPrice, newEndtime, {
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

      let ownerCut = 10
      let itemPrice = web3.toWei(1.0, 'ether')
      let newEndtime = web3.eth.getBlock('latest').timestamp + duration.minutes(5)

      await market.setOwnerCut(ownerCut, { from: owner })
      await market.createOrder(assetId, erc721.address, itemPrice, newEndtime, {
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
})
