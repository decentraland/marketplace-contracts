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
        // Assets for sale - array allows Auction to be used for both single and multi-asset orders
        uint256[] assets;
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
        uint256 indexed assetId,
        address indexed seller, 
        uint256 priceInWei, 
        uint256 expiresAt,
        bool indexed estate
    );
    event AuctionSuccessful(
        uint256 indexed assetId, 
        address indexed seller, 
        uint256 totalPrice, 
        address indexed winner,
        bool indexed estate
    );
    event AuctionCancelled(
        uint256 indexed assetId, 
        address indexed seller,
        bool indexed estate
    );
    event EstateAuctionCreated(
        uint256[] assets
    );
    event EstateAuctionSuccessful(
        uint256[] assets 
    );
    event EstateAuctionCancelled(
        uint256[] assets 
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
     * @dev Create a new order
     * @param assetId - ID of the published NFT
     * @param priceInWei - Price in Wei for the supported coin.
     * @param expiresAt - Duration of the auction (in hours)
     */
    function createOrder(uint256 assetId, uint256 priceInWei, uint256 expiresAt) public {
        require(!auctionList[assetId]);
        require(nonFungibleRegistry.isAuthorized(msg.sender, assetId));
        require(nonFungibleRegistry.isAuthorized(address(this), assetId));
        require(priceInWei > 0);
        require(expiresAt > now.add(1 minutes));
        
        uint256[1] memory asset = [assetId];
        
        auctionList[assetId] = Auction({
            assets: asset,
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
            assetId, 
            auctionList[assetId].seller, 
            priceInWei, 
            expiresAt,
            0
        );
    }

    /**
     * @dev Create a new ESTATE order
     * @param assets[] - Assets for sale
     * @param priceInWei - Price in Wei for the supported coin.
     * @param expiresAt - Duration of the auction (in hours)
     */
    function createEstate(uint256[] assets, uint256 priceInWei, uint256 expiresAt) public {
        // Store locally calls needed in for loops
        uint256 memory length = assets.length;
        address memory myAddr = address(this);
        
        for (i = 0; i < length; i++) {
            require(!auctionList[assets[i]]);
            require(nonFungibleRegistry.isAuthorized(msg.sender, assets[i]));
            require(nonFungibleRegistry.isAuthorized(myAddr, assets[i]));
        }
        require(priceInWei > 0);
        require(expiresAt > now.add(1 minutes));
        
        // Check if there's a publication fee and
        // transfer the amount to marketplace owner.
        if (publicationFeeInWei > 0) {
            acceptedToken.transferFrom(
                msg.sender,
                owner,
                publicationFeeInWei
            );
        }

        // Same seller for all assets - call not needed in loop
        address memory _seller = nonFungibleRegistry.ownerOf(assets[0]);
        Auction memory auction = Auction({
            assets: assets,
            seller: _seller,
            price: priceInWei,
            startedAt: now,
            expiresAt: expiresAt
        });
        
        for (i = 0; i < length; i++) {
            auctionList[assets[i]] = auction; 
            AuctionCreated( 
                assets[i], 
                _seller, 
                priceInWei, 
                expiresAt,
                1
            );
            EstateAuctionCreated(assets);
    }

    /**
     * @dev Cancel an already published order
     *  can only be canceled by seller or the contract owner.
     * @param assetId - ID of the published NFT
     */
    function cancelOrder(uint256 assetId) public {
        require(auctionList[assetId].seller == msg.sender || msg.sender == owner);

        address auctionSeller = auctionList[assetId].seller;
        delete auctionList[assetId];

        AuctionCancelled(assetId, auctionSeller, 0);
    }

    /**
     * @dev Cancel an already published ESTATE order
     *  can only be canceled by seller or the contract owner.
     * @param assets[] - Array of the published NFT
     */
    function cancelEstate(uint256[] assets) public {
        require(auctionList[assets[0]].seller == msg.sender || msg.sender == owner);
        
        uint256 memory length = assets.length;
        address auctionSeller = auctionList[assets[0]].seller;
        
        for (i = 0; i < length; i++) {
            delete auctionList[assets[i]];
            AuctionCancelled(assets[i], auctionSeller, 1);
        }
        EstateAuctionCancelled(assets);
    }

    /**
     * @dev Executes the sale for a published NTF
     * @param assetId - ID of the published NFT
     */
    function executeOrder(uint256 assetId, uint256 price) public {
        address memory _seller = auctionList[assetId].seller;
        require(_seller != address(0));  
        require(_seller != msg.sender);  
        require(auctionList[assetId].price == price);
        require(now < auctionList[assetId].expiresAt);

        address nonFungibleHolder = nonFungibleRegistry.ownerOf(assetId);

        require(_seller == nonFungibleHolder);
        
        uint256 memory _price = auctionList[assetId].price;
        uint saleShareAmount = 0;

        if (ownerCutPercentage > 0) {

            // Calculate sale share
            saleShareAmount = _price.mul(ownerCutPercentage).div(100);

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
            _price.price.sub(saleShareAmount)
        );

        // Transfer asset owner
        nonFungibleRegistry.safeTransferFrom(
            _seller.seller,
            msg.sender,
            assetId
        );

        delete auctionList[assetId];

        AuctionSuccessful(assetId, _seller, _price, msg.sender, 0);
    }
    
    /**
     * @dev Executes the sale for a published ESTATE NTF
     * @param assets[] - Array of the published NFT
     */
    function executeEstate(uint256[] assets, uint256 price) public {
        address memory _seller = auctionList[assets[0]].seller;
        require(_seller != address(0));  
        require(_seller != msg.sender); 
        require(auctionList[assets[0]].price == price);
        require(now < auctionList[assets[0]].expiresAt);

        address nonFungibleHolder = nonFungibleRegistry.ownerOf(assets[0]);

        require(auctionList[assetId].seller == nonFungibleHolder);

        uint256 memory _price = auctionList[assets[0]].price;
        uint saleShareAmount = 0;

        if (ownerCutPercentage > 0) {

            // Calculate sale share
            saleShareAmount = _price.mul(ownerCutPercentage).div(100);

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
            _price.sub(saleShareAmount)
        );

        // Transfer asset owner
        uint256 memory length = assets.length;
        
        for (i = 0; i < length; i++) {
            nonFungibleRegistry.safeTransferFrom(
                _seller,
                msg.sender,
                assets[i]
            );

            delete auctionList[assets[i]];
            AuctionSuccessful(assets[i], _seller, _price, msg.sender, 1);
         }
         EstateAuctionSuccessful(assets);
    }
 }

/**
 * If you still need auctionId for a reason I am unaware of, I would
 * add a mapping(bytes32 => Auction) auctionIds
 *
 * after auction item is created after 133 and after 190:
 * bytes32 auctionId = keccak256(
 *         block.timestamp, 
 *         Auction object
 * );
 */
