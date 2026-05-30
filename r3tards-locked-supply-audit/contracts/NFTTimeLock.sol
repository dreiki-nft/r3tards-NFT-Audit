// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// OpenZeppelin IERC721 interface (flattened)
interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC721 is IERC165 {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    function balanceOf(address owner) external view returns (uint256 balance);
    function ownerOf(uint256 tokenId) external view returns (address owner);
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function setApprovalForAll(address operator, bool approved) external;
    function getApproved(uint256 tokenId) external view returns (address operator);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

contract NFTTimeLock {
    mapping(address => bool) public isOwner;
    address[] public owners;
    uint256 public unlockTime;
    address public nftContract;

    event NFTWithdrawn(address indexed by, address indexed to, uint256 tokenId);

    constructor(address _nftContract) {
        require(_nftContract != address(0), "Invalid NFT contract");

        address[4] memory _owners = [
            0x40Ea55E0b8f02f8eBc9D91e082e202ed988647fA,
            0xdfC19DD5f80048dF12D7a71cB01226F8ce24a954,
            0x18D5346216315667C51D69F346E3C768136F8018,
            0xf10eD040f182511ef2179AdeA749920881A4eef9
        ];

        for (uint256 i = 0; i < _owners.length; i++) {
            isOwner[_owners[i]] = true;
            owners.push(_owners[i]);
        }

        unlockTime = block.timestamp + (3 * 365 days + 1 days);
        nftContract = _nftContract;
    }

    modifier onlyOwner() {
        require(isOwner[msg.sender], "Not an owner");
        _;
    }

    modifier onlyAfterUnlock() {
        require(block.timestamp >= unlockTime, "NFTs are still locked");
        _;
    }

    function withdrawNFT(uint256 tokenId) external onlyOwner onlyAfterUnlock {
        IERC721(nftContract).transferFrom(address(this), msg.sender, tokenId);
        emit NFTWithdrawn(msg.sender, msg.sender, tokenId);
    }

    function withdrawMultipleNFTs(uint256[] calldata tokenIds) external onlyOwner onlyAfterUnlock {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            IERC721(nftContract).transferFrom(address(this), msg.sender, tokenIds[i]);
            emit NFTWithdrawn(msg.sender, msg.sender, tokenIds[i]);
        }
    }

    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    function timeUntilUnlock() external view returns (uint256) {
        if (block.timestamp >= unlockTime) return 0;
        return unlockTime - block.timestamp;
    }
}