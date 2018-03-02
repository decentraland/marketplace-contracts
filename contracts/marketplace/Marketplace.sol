pragma solidity 0.4.18;

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
    function isApprovedFor(address operator, uint256 assetId) public view returns (bool);
}

contract Marketplace is Ownable {
    using SafeMath for uint256;

    ERC20Interface public acceptedToken;
    ERC721Interface public nonFungibleRegistry;

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

    uint256 public ownerCutPercentage;
    uint256 public publicationFeeInWei;

    /* EVENTS */
    event AuctionCreated(uint256 indexed assetId, uint256 priceInWei, uint256 expiresAt);
    event AuctionSuccessful(uint256 indexed assetId, uint256 totalPrice, address indexed winner);
    event AuctionCancelled(uint256 indexed assetId);

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
        require(nonFungibleRegistry.isApprovedFor(msg.sender, assetId));
        require(priceInWei > 0);
        require(expiresAt > now.add(1 minutes));

        auctionList[assetId] = Auction({
            seller: nonFungibleRegistry.ownerOf(assetId),
            price: priceInWei,
            startedAt: now,
            expiresAt: expiresAt
        });

        // Check if there's a publication fee and
        // transfeer the amount to marketplace owner.
        if (publicationFeeInWei > 0) {
            acceptedToken.transferFrom(
                msg.sender,
                owner,
                publicationFeeInWei
            );
        }

        AuctionCreated(assetId, priceInWei, expiresAt);
    }

    /**
     * @dev Cancel an already published order
     *  can only be canceled by seller or the contract owner.
     * @param assetId - ID of the published NFT
     */
    function cancelOrder(uint256 assetId) public {
        require(auctionList[assetId].seller == msg.sender || msg.sender == owner);

        delete auctionList[assetId];

        AuctionCancelled(assetId);
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

        AuctionSuccessful(assetId, auctionList[assetId].price, msg.sender);
    }
 }
