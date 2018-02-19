pragma solidity ^0.4.18;

contract FakeERC20 {

  mapping (address => uint256) balances;

  event Transfer(address indexed from, address indexed to, uint tokens);

  function transferFrom(address _from, address _to, uint _tokens) public {
    Transfer(_from, _to, _tokens);

    balances[_from] -= _tokens;
    balances[_to] += _tokens;
  }

  function balanceOf(address tokenOwner) public constant returns (uint balance) {
  	balance = balances[tokenOwner];
  }

  function setBalance(address holder, uint256 amount) public {
  	balances[holder] = amount;
  }

}
