const BigNumber = web3.BigNumber

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const EVMThrow = 'invalid opcode'
const EVMRevert = 'VM Exception while processing transaction: revert'

const ERC20Mock = artifacts.require('FakeERC20')
const ERC821Mock = artifacts.require('FakeERC821')
const Marketplace = artifacts.require('Marketplace')

const { increaseTime, duration } = require('./helpers/increaseTime')

contract('Marketplace', function ([_, owner, seller, buyer]) {

  let endtime = web3.eth.getBlock('latest').timestamp + duration.minutes(5)
  let assetId = 10000

  let mPlaceContract

  beforeEach(async function () {
    let erc20 = await ERC20Mock.new({ from: owner })
    let erc821 = await ERC821Mock.new({ from: owner })

    // Create a Marketplace with mocks
    mPlaceContract = await Marketplace.new(erc20.address, erc821.address, { from: owner })

    // Set holder of the asset and aproved on registry
    await erc821.setAssetHolder(seller)
    await erc821.setApprovedFor(mPlaceContract.address)
  })

  it('should create a new order', async function () {
    let itemPrice = web3.toWei(1.0, 'ether')

    await mPlaceContract.createOrder(assetId, itemPrice, endtime, { from: seller })

    let s = await mPlaceContract.auctionList(assetId)

    s[0].should.be.equal(seller)
    s[1].should.be.bignumber.equal(itemPrice)
    s[3].should.be.bignumber.equal(endtime)

  })

  it('should update an order', async function () {
    let newPrice = web3.toWei(2.0, 'ether')
    let newEndTime = endtime + duration.minutes(5)

    await mPlaceContract.createOrder(assetId, newPrice, newEndTime, { from: seller })

    let s = await mPlaceContract.auctionList(assetId)

    s[0].should.be.equal(seller)
    s[1].should.be.bignumber.equal(newPrice)
    s[3].should.be.bignumber.equal(newEndTime)
  })
  
  // cancel

  it('should cancel a created order', async function () {
    let itemPrice = web3.toWei(1.0, 'ether')

    await mPlaceContract.createOrder(assetId, itemPrice, endtime, { from: seller })
    await mPlaceContract.cancelOrder(assetId, { from: seller })
  }) 

  it('should fail canceling an order', async function () {
    let itemPrice = web3.toWei(1.0, 'ether')

    await mPlaceContract.createOrder(assetId, itemPrice, endtime, { from: seller })
    await mPlaceContract.cancelOrder(assetId, { from: buyer }).should.be.rejectedWith(EVMRevert)
  })

  // Execute

  it('should execute a created order', async function () {
    let itemPrice = web3.toWei(1.0, 'ether')

    await mPlaceContract.createOrder(assetId, itemPrice, endtime, { from: seller })
    await mPlaceContract.executeOrder(assetId, { from: buyer })
  }) 

  it('should fail on execute a created order :: (wrong user)', async function () {
    let itemPrice = web3.toWei(1.0, 'ether')

    await mPlaceContract.createOrder(assetId, itemPrice, endtime, { from: seller })
    await mPlaceContract.executeOrder(assetId, { from: seller }).should.be.rejectedWith(EVMRevert)
  }) 

  it('should fail execute a created order :: (expired)', async function () {
    let itemPrice = web3.toWei(1.0, 'ether')

    await mPlaceContract.createOrder(assetId, itemPrice, endtime, { from: seller })

    // move 10 mins ahead.
    await increaseTime(600)
    await mPlaceContract.executeOrder(assetId, { from: buyer }).should.be.rejectedWith(EVMRevert)
  }) 
  //
})
  