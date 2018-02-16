pragma solidity ^0.4.18;

contract FakeERC20 {

  event Transfer(address indexed from, address indexed to, uint tokens);

  function transferFrom(address _from, address _to, uint _tokens) public {
    Transfer(_from, _to, _tokens);
  }
}
