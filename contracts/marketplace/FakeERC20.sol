pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";

contract FakeERC20 is StandardToken {
    function setBalance(address holder, uint256 amount) public {
        balances[holder] = amount;
    }
}
