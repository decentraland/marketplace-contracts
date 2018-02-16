const BigNumber = web3.BigNumber

const should = require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const EVMThrow = 'invalid opcode'

const ERC20Mock = artifacts.require('FakeERC20')
const ERC821Mock = artifacts.require('FakeERC821')
const Marketplace = artifacts.require('Marketplace')

const duration = {
  seconds: function(val) { return val},
  minutes: function(val) { return val * this.seconds(60) },
  hours:   function(val) { return val * this.minutes(60) },
  days:    function(val) { return val * this.hours(24) },
  weeks:   function(val) { return val * this.days(7) },
  years:   function(val) { return val * this.days(365)}
}

contract('Marketplace', function ([_, owner, seller, buyer]) {

  let endtime = ((new Date().getTime() + duration.days(15)) / 1000).toFixed(0)
  let assetId = 10000

  let mPlaceContract

  beforeEach(async function () {
    let erc20 = await ERC20Mock.new({ from: owner })
    let erc821 = await ERC821Mock.new({ from: owner })

    // Set holder of the asset 
    await erc821.setAssetHolder(seller)

    // Create a Marketplace with mocks
    mPlaceContract = await Marketplace.new(erc20.address, erc821.address, { from: owner })
  })

  it('should create a new order', async function () {
    let itemPrice = web3.toWei(1.0, 'ether')

    await mPlaceContract.createOrder(assetId, itemPrice, endtime, { from: seller })

    let s = await mPlaceContract.auctionList(assetId)

    s[0].should.be.equal('0x0000000000000000000000000000000000000000')
    s[1].should.be.bignumber.equal(itemPrice)
    s[3].should.be.bignumber.equal(endtime)

  })

  it('should update an order', async function () {
    let newPrice = web3.toWei(2.0, 'ether')
    let newEndTime = endtime + duration.days(5)

    await mPlaceContract.createOrder(assetId, newPrice, newEndTime, { from: seller })

    let s = await mPlaceContract.auctionList(assetId)

    s[0].should.be.equal('0x0000000000000000000000000000000000000000')
    s[1].should.be.bignumber.equal(newPrice)
    s[3].should.be.bignumber.equal(newEndTime)
  })
  
  // cancel

  it('should cancel a created order', async function () {
    await mPlaceContract.cancelOrder(assetId, { from: seller })
  }) 

  it('should fail canceling an order', async function () {
    await mPlaceContract.cancelOrder(assetId, { from: buyer })
  })

  // Execute

  it('should execute a created order', async function () {
    await mPlaceContract.cancelOrder(assetId, { from: buyer })

  }) 

  it('should fail on execute a created order :: (wrong user)', async function () {
    await mPlaceContract.cancelOrder(assetId, { from: seller })

  }) 

  it('should fail execute a created order :: (expired)', async function () {
    await this.contract.cancelOrder(assetId, { from: seller })

  }) 


  //
})
  