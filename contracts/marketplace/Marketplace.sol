pragma solidity 0.4.19;

import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";

/**
 * @title Interface for contracts conforming to ERC-20
 */
contract ERC20Interface {
    function transferFrom(address from, address to, uint tokens) public returns (bool success);
}

/**
 * @title Interface for contracts conforming to ERC-721
 */
contract ERC721Interface {
    function ownerOf(uint256 assetId) public view returns (address);
    function safeTransferFrom(address from, address to, uint256 assetId) public;
    function isAuthorized(address operator, uint256 assetId) public view returns (bool);
}

contract Marketplace is Ownable {
    using SafeMath for uint256;

    ERC20Interface public acceptedToken;
    ERC721Interface public nonFungibleRegistry;

    struct Auction {
        // Auction ID
        bytes32 id;
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

    uint256 public ownerCutPercentage;
    uint256 public publicationFeeInWei;

    /* EVENTS */
    event AuctionCreated(
        bytes32 id,
        uint256 indexed assetId,
        address indexed seller, 
        uint256 priceInWei, 
        uint256 expiresAt
    );
    event AuctionSuccessful(
        bytes32 id,
        uint256 indexed assetId, 
        address indexed seller, 
        uint256 totalPrice, 
        address indexed winner
    );
    event AuctionCancelled(
        bytes32 id,
        uint256 indexed assetId, 
        address indexed seller
    );

    event ChangedPublicationFee(uint256 publicationFee);
    event ChangedOwnerCut(uint256 ownerCut);


    /**
     * @dev Constructor for this contract.
     * @param _acceptedToken - Address of the ERC20 accepted for this marketplace
     * @param _nonFungibleRegistry - Address of the ERC721 registry contract.
     */
    function Marketplace(address _acceptedToken, address _nonFungibleRegistry) public {
        acceptedToken = ERC20Interface(_acceptedToken);
        nonFungibleRegistry = ERC721Interface(_nonFungibleRegistry);
    }

    /**
     * @dev Sets the publication fee that's charged to users to publish items
     * @param publicationFee - Fee amount in wei this contract charges to publish an item
     */
    function setPublicationFee(uint256 publicationFee) onlyOwner public {
        publicationFeeInWei = publicationFee;

        ChangedPublicationFee(publicationFeeInWei);
    }

    /**
     * @dev Sets the share cut for the owner of the contract that's
     *  charged to the seller on a successful sale.
     * @param ownerCut - Share amount, from 0 to 100
     */
    function setOwnerCut(uint8 ownerCut) onlyOwner public {
        require(ownerCut < 100);

        ownerCutPercentage = ownerCut;

        ChangedOwnerCut(ownerCutPercentage);
    }

    /**
     * @dev Cancel an already published order
     * @param assetId - ID of the published NFT
     * @param priceInWei - Price in Wei for the supported coin.
     * @param expiresAt - Duration of the auction (in hours)
     */
    function createOrder(uint256 assetId, uint256 priceInWei, uint256 expiresAt) public {
        require(nonFungibleRegistry.isAuthorized(msg.sender, assetId));
        require(nonFungibleRegistry.isAuthorized(address(this), assetId));
        require(priceInWei > 0);
        require(expiresAt > now.add(1 minutes));

        bytes32 auctionId = keccak256(
            block.timestamp, 
            nonFungibleRegistry.ownerOf(assetId), 
            assetId, 
            priceInWei
        );

        auctionList[assetId] = Auction({
            id: auctionId,
            seller: nonFungibleRegistry.ownerOf(assetId),
            price: priceInWei,
            startedAt: now,
            expiresAt: expiresAt
        });

        // Check if there's a publication fee and
        // transfer the amount to marketplace owner.
        if (publicationFeeInWei > 0) {
            acceptedToken.transferFrom(
                msg.sender,
                owner,
                publicationFeeInWei
            );
        }

        AuctionCreated(
            auctionList[assetId].id, 
            assetId, 
            auctionList[assetId].seller, 
            priceInWei, 
            expiresAt
        );
    }

    /**
     * @dev Cancel an already published order
     *  can only be canceled by seller or the contract owner.
     * @param assetId - ID of the published NFT
     */
    function cancelOrder(uint256 assetId) public {
        require(auctionList[assetId].seller == msg.sender || msg.sender == owner);

        delete auctionList[assetId];

        AuctionCancelled(
            auctionList[assetId].id,
            assetId,
            auctionList[assetId].seller
        );
    }

    /**
     * @dev Executes the sale for a published NTF
     * @param assetId - ID of the published NFT
     */
    function executeOrder(uint256 assetId, uint256 price) public {
        require(auctionList[assetId].seller != address(0));
        require(auctionList[assetId].seller != msg.sender);
        require(auctionList[assetId].price == price);
        require(now < auctionList[assetId].expiresAt);

        address nonFungibleHolder = nonFungibleRegistry.ownerOf(assetId);

        require(auctionList[assetId].seller == nonFungibleHolder);

        uint saleShareAmount = 0;

        if (ownerCutPercentage > 0) {

            // Calculate sale share
            saleShareAmount = auctionList[assetId].price.mul(ownerCutPercentage).div(100);

            // Transfer share amount for marketplace Owner.
            acceptedToken.transferFrom(
                msg.sender,
                owner,
                saleShareAmount
            );
        }

        // Transfer sale amount to seller
        acceptedToken.transferFrom(
            msg.sender,
            nonFungibleHolder,
            auctionList[assetId].price.sub(saleShareAmount)
        );

        // Transfer asset owner
        nonFungibleRegistry.safeTransferFrom(
            auctionList[assetId].seller,
            msg.sender,
            assetId
        );

        delete auctionList[assetId];

        AuctionSuccessful(
            auctionList[assetId].id, 
            assetId, 
            auctionList[assetId].seller, 
            auctionList[assetId].price, 
            msg.sender
        );
    }
 }
