pragma solidity ^0.4.18;

import "zeppelin-solidity/contracts/token/ERC20/StandardToken.sol";

contract FakeERC20 is StandardToken {

  function setBalance(address holder, uint256 amount) public {
  	balances[holder] = amount;
  }

}
