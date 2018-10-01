pragma solidity ^0.4.23;

import "openzeppelin-zos/contracts/token/ERC20/StandardToken.sol";


contract ERC20Test is StandardToken {
  function setBalance(address holder, uint256 amount) public {
    balances[holder] = amount;
  }
}
