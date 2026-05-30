// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

contract MockERC721 {
    mapping(uint256 => address) private _owners;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    function mint(address to, uint256 tokenId) external {
        _owners[tokenId] = to;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(_owners[tokenId] == from, "Not owner");
        require(
            msg.sender == from || _operatorApprovals[from][msg.sender],
            "Not approved"
        );
        _owners[tokenId] = to;
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function supportsInterface(bytes4) external pure returns (bool) {
        return true;
    }
}

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

contract NFTTimeLockTest is Test {

    NFTTimeLock public timeLock;
    MockERC721  public nft;

    address public constant OWNER_1   = 0x40Ea55E0b8f02f8eBc9D91e082e202ed988647fA;
    address public constant OWNER_2   = 0xdfC19DD5f80048dF12D7a71cB01226F8ce24a954;
    address public constant OWNER_3   = 0x18D5346216315667C51D69F346E3C768136F8018;
    address public constant OWNER_4   = 0xf10eD040f182511ef2179AdeA749920881A4eef9;
    address public constant NON_OWNER = address(0xBEEF);

    uint256 public constant TOKEN_1              = 1;
    uint256 public constant TOKEN_2              = 2;
    uint256 public constant TOKEN_3              = 3;
    uint256 public constant TOKEN_NOT_IN_CONTRACT = 999;

    uint256 public constant DEPLOY_TS     = 1_000_000;
    uint256 public constant LOCK_DURATION = 3 * 365 days + 1 days;
    uint256 public constant UNLOCK_TS     = DEPLOY_TS + LOCK_DURATION;

    function setUp() public {
        vm.warp(DEPLOY_TS);
        nft      = new MockERC721();
        timeLock = new NFTTimeLock(address(nft));
        nft.mint(address(timeLock), TOKEN_1);
        nft.mint(address(timeLock), TOKEN_2);
        nft.mint(address(timeLock), TOKEN_3);
        vm.prank(address(timeLock));
        nft.setApprovalForAll(address(timeLock), true);
    }

    function test_constructor_revertsOnZeroAddress() public {
        vm.expectRevert("Invalid NFT contract");
        new NFTTimeLock(address(0));
    }

    function test_constructor_isOwner_allFourOwnersSet() public view {
        assertTrue(timeLock.isOwner(OWNER_1));
        assertTrue(timeLock.isOwner(OWNER_2));
        assertTrue(timeLock.isOwner(OWNER_3));
        assertTrue(timeLock.isOwner(OWNER_4));
    }

    function test_constructor_isOwner_nonOwnerReturnsFalse() public view {
        assertFalse(timeLock.isOwner(NON_OWNER));
        assertFalse(timeLock.isOwner(address(0)));
    }

    function test_constructor_ownersArray_lengthAndOrder() public view {
        address[] memory returnedOwners = timeLock.getOwners();
        assertEq(returnedOwners.length, 4);
        assertEq(returnedOwners[0], OWNER_1);
        assertEq(returnedOwners[1], OWNER_2);
        assertEq(returnedOwners[2], OWNER_3);
        assertEq(returnedOwners[3], OWNER_4);
    }

    function test_constructor_unlockTime_exactlyThreeYearsPlusOneDay() public view {
        assertEq(timeLock.unlockTime(), UNLOCK_TS);
    }

    function test_constructor_nftContract_storedCorrectly() public view {
        assertEq(timeLock.nftContract(), address(nft));
    }

    function test_withdrawNFT_revertsIfNotOwner() public {
        vm.warp(UNLOCK_TS + 1);
        vm.prank(NON_OWNER);
        vm.expectRevert("Not an owner");
        timeLock.withdrawNFT(TOKEN_1);
    }

    function test_withdrawNFT_revertsOneSecondBeforeUnlock() public {
        vm.warp(UNLOCK_TS - 1);
        vm.prank(OWNER_1);
        vm.expectRevert("NFTs are still locked");
        timeLock.withdrawNFT(TOKEN_1);
    }

    function test_withdrawNFT_revertsAtDeployTime() public {
        vm.prank(OWNER_1);
        vm.expectRevert("NFTs are still locked");
        timeLock.withdrawNFT(TOKEN_1);
    }

    function test_withdrawNFT_succeedsExactlyAtUnlockTime() public {
        vm.warp(UNLOCK_TS);
        vm.prank(OWNER_1);
        timeLock.withdrawNFT(TOKEN_1);
        assertEq(nft.ownerOf(TOKEN_1), OWNER_1);
    }

    function test_withdrawNFT_succeedsAfterUnlock_postStateCheck() public {
        vm.warp(UNLOCK_TS + 1);
        vm.prank(OWNER_1);
        timeLock.withdrawNFT(TOKEN_1);
        assertEq(nft.ownerOf(TOKEN_1), OWNER_1);
    }

    function test_withdrawNFT_emitsNFTWithdrawnEvent() public {
        vm.warp(UNLOCK_TS + 1);
        vm.expectEmit(true, true, false, true);
        emit NFTTimeLock.NFTWithdrawn(OWNER_1, OWNER_1, TOKEN_1);
        vm.prank(OWNER_1);
        timeLock.withdrawNFT(TOKEN_1);
    }

    function test_withdrawNFT_revertsIfTokenNotHeldByContract() public {
        vm.warp(UNLOCK_TS + 1);
        vm.prank(OWNER_1);
        vm.expectRevert();
        timeLock.withdrawNFT(TOKEN_NOT_IN_CONTRACT);
    }

    function test_withdrawNFT_allFourOwnersCanWithdraw() public {
        vm.warp(UNLOCK_TS + 1);
        nft.mint(address(timeLock), 10);
        nft.mint(address(timeLock), 11);
        nft.mint(address(timeLock), 12);
        vm.prank(OWNER_1); timeLock.withdrawNFT(TOKEN_1);
        vm.prank(OWNER_2); timeLock.withdrawNFT(TOKEN_2);
        vm.prank(OWNER_3); timeLock.withdrawNFT(TOKEN_3);
        vm.prank(OWNER_4); timeLock.withdrawNFT(10);
        assertEq(nft.ownerOf(TOKEN_1), OWNER_1);
        assertEq(nft.ownerOf(TOKEN_2), OWNER_2);
        assertEq(nft.ownerOf(TOKEN_3), OWNER_3);
        assertEq(nft.ownerOf(10),      OWNER_4);
    }

    function test_withdrawMultipleNFTs_revertsIfNotOwner() public {
        vm.warp(UNLOCK_TS + 1);
        uint256[] memory ids = new uint256[](2);
        ids[0] = TOKEN_1; ids[1] = TOKEN_2;
        vm.prank(NON_OWNER);
        vm.expectRevert("Not an owner");
        timeLock.withdrawMultipleNFTs(ids);
    }

    function test_withdrawMultipleNFTs_revertsOneSecondBeforeUnlock() public {
        vm.warp(UNLOCK_TS - 1);
        uint256[] memory ids = new uint256[](2);
        ids[0] = TOKEN_1; ids[1] = TOKEN_2;
        vm.prank(OWNER_1);
        vm.expectRevert("NFTs are still locked");
        timeLock.withdrawMultipleNFTs(ids);
    }

    function test_withdrawMultipleNFTs_revertsIfTokenNotHeldByContract() public {
        vm.warp(UNLOCK_TS + 1);
        uint256[] memory ids = new uint256[](2);
        ids[0] = TOKEN_1; ids[1] = TOKEN_NOT_IN_CONTRACT;
        vm.prank(OWNER_1);
        vm.expectRevert();
        timeLock.withdrawMultipleNFTs(ids);
    }

    function test_withdrawMultipleNFTs_revertsOnDuplicateId() public {
        vm.warp(UNLOCK_TS + 1);
        uint256[] memory ids = new uint256[](2);
        ids[0] = TOKEN_1; ids[1] = TOKEN_1;
        vm.prank(OWNER_1);
        vm.expectRevert();
        timeLock.withdrawMultipleNFTs(ids);
    }

    function test_withdrawMultipleNFTs_allTransferSucceed_postStateCheck() public {
        vm.warp(UNLOCK_TS + 1);
        uint256[] memory ids = new uint256[](3);
        ids[0] = TOKEN_1; ids[1] = TOKEN_2; ids[2] = TOKEN_3;
        vm.prank(OWNER_1);
        timeLock.withdrawMultipleNFTs(ids);
        assertEq(nft.ownerOf(TOKEN_1), OWNER_1);
        assertEq(nft.ownerOf(TOKEN_2), OWNER_1);
        assertEq(nft.ownerOf(TOKEN_3), OWNER_1);
    }

    function test_withdrawMultipleNFTs_emitsEventForEachToken() public {
        vm.warp(UNLOCK_TS + 1);
        uint256[] memory ids = new uint256[](2);
        ids[0] = TOKEN_1; ids[1] = TOKEN_2;
        vm.expectEmit(true, true, false, true);
        emit NFTTimeLock.NFTWithdrawn(OWNER_1, OWNER_1, TOKEN_1);
        vm.expectEmit(true, true, false, true);
        emit NFTTimeLock.NFTWithdrawn(OWNER_1, OWNER_1, TOKEN_2);
        vm.prank(OWNER_1);
        timeLock.withdrawMultipleNFTs(ids);
    }

    function test_withdrawMultipleNFTs_emptyArraySucceedsWithNoTransfers() public {
        vm.warp(UNLOCK_TS + 1);
        uint256[] memory ids = new uint256[](0);
        vm.prank(OWNER_1);
        timeLock.withdrawMultipleNFTs(ids);
        assertEq(nft.ownerOf(TOKEN_1), address(timeLock));
        assertEq(nft.ownerOf(TOKEN_2), address(timeLock));
        assertEq(nft.ownerOf(TOKEN_3), address(timeLock));
    }

    function test_withdrawMultipleNFTs_allFourOwnersCanWithdraw() public {
        vm.warp(UNLOCK_TS + 1);
        nft.mint(address(timeLock), 10);
        nft.mint(address(timeLock), 11);
        nft.mint(address(timeLock), 12);
        uint256[] memory ids1 = new uint256[](1); ids1[0] = TOKEN_1;
        uint256[] memory ids2 = new uint256[](1); ids2[0] = TOKEN_2;
        uint256[] memory ids3 = new uint256[](1); ids3[0] = TOKEN_3;
        uint256[] memory ids4 = new uint256[](1); ids4[0] = 10;
        vm.prank(OWNER_1); timeLock.withdrawMultipleNFTs(ids1);
        vm.prank(OWNER_2); timeLock.withdrawMultipleNFTs(ids2);
        vm.prank(OWNER_3); timeLock.withdrawMultipleNFTs(ids3);
        vm.prank(OWNER_4); timeLock.withdrawMultipleNFTs(ids4);
        assertEq(nft.ownerOf(TOKEN_1), OWNER_1);
        assertEq(nft.ownerOf(TOKEN_2), OWNER_2);
        assertEq(nft.ownerOf(TOKEN_3), OWNER_3);
        assertEq(nft.ownerOf(10),      OWNER_4);
    }

    function test_getOwners_returnsCorrectAddressesAndLength() public view {
        address[] memory returnedOwners = timeLock.getOwners();
        assertEq(returnedOwners.length, 4);
        assertEq(returnedOwners[0], OWNER_1);
        assertEq(returnedOwners[1], OWNER_2);
        assertEq(returnedOwners[2], OWNER_3);
        assertEq(returnedOwners[3], OWNER_4);
    }

    function test_timeUntilUnlock_returnsFullDurationAtDeployment() public view {
        assertEq(timeLock.timeUntilUnlock(), LOCK_DURATION);
    }

    function test_timeUntilUnlock_returnsOneAtOneBefore() public {
        vm.warp(UNLOCK_TS - 1);
        assertEq(timeLock.timeUntilUnlock(), 1);
    }

    function test_timeUntilUnlock_returnsZeroAtUnlockTime() public {
        vm.warp(UNLOCK_TS);
        assertEq(timeLock.timeUntilUnlock(), 0);
    }

    function test_timeUntilUnlock_returnsZeroAfterUnlock() public {
        vm.warp(UNLOCK_TS + 1000);
        assertEq(timeLock.timeUntilUnlock(), 0);
    }

    function test_unlockTime_equalsDeployTsPlusLockDuration() public view {
        assertEq(timeLock.unlockTime(), UNLOCK_TS);
    }

    function test_isOwner_trueForAllFour() public view {
        assertTrue(timeLock.isOwner(OWNER_1));
        assertTrue(timeLock.isOwner(OWNER_2));
        assertTrue(timeLock.isOwner(OWNER_3));
        assertTrue(timeLock.isOwner(OWNER_4));
    }

    function test_isOwner_falseForNonOwnerAndZeroAddress() public view {
        assertFalse(timeLock.isOwner(NON_OWNER));
        assertFalse(timeLock.isOwner(address(0)));
    }

    function test_nftContract_returnsCorrectAddress() public view {
        assertEq(timeLock.nftContract(), address(nft));
    }
}