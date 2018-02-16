pragma solidity 0.4.18;

import "zeppelin-solidity/contracts/ownership/Ownable.sol";

/// @title Interface for contracts conforming to ERC-20
contract ERC20Interface {
    function transferFrom(address from, address to, uint tokens) public returns (bool success);
}

/// @title Interface for contracts conforming to ERC-821
contract ERC821Interface {
    function holderOf(uint256 assetId) public view returns (address);
    function transfer(address to, uint256 assetId) public;
    function isApprovedFor(address operator, uint256 assetId) public view returns (bool);
}

contract Marketplace is Ownable {

    ERC20Interface acceptedToken;
    ERC821Interface nonFungibleRegistry;

    struct Auction {
        // Owner of the NFT
        address seller;
        // Price (in wei) for the published item
        uint256 price;
        // Time when this sale started, 0 if closed
        uint256 startedAt;
        // Time when this sale ends
        uint256 expiresAt;
    }

    mapping (uint256 => Auction) public auctionList;

    /* EVENTS */    
    event AuctionCreated(uint256 assetId, uint256 priceInWei, uint256 expiresAt);
    event AuctionSuccessful(uint256 assetId, uint256 totalPrice, address winner);
    event AuctionCancelled(uint256 assetId);

    function Marketplace(address _acceptedToken, address _nonFungibleRegistry) public {
        acceptedToken = ERC20Interface(_acceptedToken);
        nonFungibleRegistry = ERC821Interface(_nonFungibleRegistry);
    }

    /// @dev Cancel an already published order
    /// @param assetId - ID of the published NFT
    /// @param priceInWei - Price in Wei for the supported coin.
    /// @param expiresAt - Duration of the auction (in hours)    
    function createOrder(uint256 assetId, uint256 priceInWei, uint256 expiresAt) public {
        require(nonFungibleRegistry.isApprovedFor(msg.sender, assetId));
        require(priceInWei > 0);
        require(expiresAt > now + 1 minutes);

        auctionList[assetId] = Auction({
            seller: nonFungibleRegistry.holderOf(assetId),
            price: priceInWei,
            expiresAt: expiresAt,
            startedAt: now
        });

        AuctionCreated(assetId, priceInWei, expiresAt);
    }

    /// @dev Cancel an already published order
    /// @param assetId - ID of the published NFT
    function cancelOrder(uint256 assetId) public {
        require(auctionList[assetId].seller == msg.sender);

        delete auctionList[assetId];
        
        AuctionCancelled(assetId);
    }

    /// @dev Executes the sale for a published NTF 
    /// @param assetId - ID of the published NFT
    function executeOrder(uint256 assetId) public {
        address nonFungibleHolder = nonFungibleRegistry.holderOf(assetId);

        require(nonFungibleRegistry.isApprovedFor(this, assetId));
        require(nonFungibleHolder == auctionList[assetId].seller);
        require(now < auctionList[assetId].expiresAt);

        acceptedToken.transferFrom(
            msg.sender, 
            nonFungibleHolder, 
            auctionList[assetId].price
        );

        nonFungibleRegistry.transfer(msg.sender, assetId);

        delete auctionList[assetId];

        AuctionSuccessful(assetId, auctionList[assetId].price, msg.sender);
    }

 }