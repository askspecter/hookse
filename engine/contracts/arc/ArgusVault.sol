// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IArgusPortal, IArgusSplitter} from "./IArgus.sol";

interface ITreasurySource {
    function treasury() external view returns (address);
}

/// @notice The Argus creator of one Rigs coin on Arc. Argus credits the creator's share of every tax
/// and LP fee to whoever called Portal.launch, and its splitter's claim(account) is permissionless and
/// always pays `account`. So this vault calls launch, and whatever reaches it (quote, USDC or the coin
/// itself) is split on `release`: TREASURY_BPS to the Rigs treasury, the rest to the coin's creator.
/// Anyone can call `release`. Deployed once as an implementation; each coin gets a minimal-proxy clone.
contract ArgusVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant TREASURY_BPS = 2_000;

    /// @dev Arc's USDC ERC-20 view (0x3600…). Native USDC sent here shows up in the same balance.
    address public immutable usdc;

    address public launcher;
    address public creator;
    address public token;
    address public splitter;
    address public quote;

    /// @dev Creator payouts that failed (e.g. a blocked address), kept aside until `release` succeeds.
    mapping(address asset => uint256) public creatorOwed;
    mapping(address asset => uint256) public totalToCreator;
    mapping(address asset => uint256) public totalToTreasury;

    event Launched(address indexed token, address splitter, address quote);
    event Released(address indexed asset, uint256 toCreator, uint256 toTreasury);
    event CreatorPayoutDeferred(address indexed asset, uint256 amount);
    event CreatorChanged(address indexed previous, address indexed next);

    constructor(address usdc_) {
        usdc = usdc_;
        launcher = address(1); // the implementation itself is never used directly
    }

    receive() external payable {}

    /// @dev Called by the launcher in the same transaction that creates the clone.
    function initialize(address creator_) external {
        require(launcher == address(0), "initialized");
        require(creator_ != address(0), "creator=0");
        launcher = msg.sender;
        creator = creator_;
    }

    /// @notice Launches on Argus with this vault as the creator. Dev-buy funds must already be here.
    /// The coins the dev buy returns and any unspent quote go straight to the creator.
    function launchOn(
        IArgusPortal portal,
        IArgusPortal.LaunchParams calldata p,
        IArgusPortal.LaunchMeta calldata meta,
        bytes32 salt,
        bytes32 hookSalt
    ) external nonReentrant returns (address token_) {
        require(msg.sender == launcher && token == address(0), "launched");
        if (p.devBuyQuote != 0) IERC20(p.quoteAsset).forceApprove(address(portal), p.devBuyQuote);
        token_ = portal.launch(p, meta, salt, hookSalt);
        if (p.devBuyQuote != 0) IERC20(p.quoteAsset).forceApprove(address(portal), 0);

        (address recorded,,,,, address splitter_,,,,, address quote_) = portal.launches(token_);
        require(recorded == address(this), "creator mismatch");
        token = token_;
        splitter = splitter_;
        quote = quote_;

        uint256 bought = IERC20(token_).balanceOf(address(this));
        if (bought != 0) IERC20(token_).safeTransfer(creator, bought);
        uint256 unspent = IERC20(quote_).balanceOf(address(this));
        if (unspent != 0) IERC20(quote_).safeTransfer(creator, unspent);
        emit Launched(token_, splitter_, quote_);
    }

    /// @notice What `release` would split right now, per asset, not counting fees still in the Argus splitter.
    function unsplit(address asset) public view returns (uint256) {
        return IERC20(asset).balanceOf(address(this)) - creatorOwed[asset];
    }

    /// @notice Claims this coin's creator share from Argus, then splits everything held here 80/20.
    function release() external nonReentrant {
        require(token != address(0), "not launched");
        // Fails with NothingToClaim when nothing is credited; the vault may still hold funds pushed to it.
        try IArgusSplitter(splitter).claim(address(this)) {} catch {}
        _split(quote);
        if (usdc != quote && usdc != address(0)) _split(usdc);
        _split(token);
    }

    function _split(address asset) internal {
        uint256 amount = unsplit(asset);
        if (amount != 0) {
            uint256 toTreasury = amount * TREASURY_BPS / 10_000;
            uint256 toCreator = amount - toTreasury;
            totalToTreasury[asset] += toTreasury;
            totalToCreator[asset] += toCreator;
            if (toTreasury != 0) IERC20(asset).safeTransfer(ITreasurySource(launcher).treasury(), toTreasury);
            creatorOwed[asset] += toCreator;
            emit Released(asset, toCreator, toTreasury);
        }
        uint256 owed = creatorOwed[asset];
        if (owed == 0) return;
        creatorOwed[asset] = 0;
        // A failed creator payout must not block the treasury's share, so it is kept for the next release.
        if (!_tryTransfer(asset, creator, owed)) {
            creatorOwed[asset] = owed;
            emit CreatorPayoutDeferred(asset, owed);
        }
    }

    function _tryTransfer(address asset, address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory ret) = asset.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        return ok && (ret.length == 0 ? asset.code.length != 0 : abi.decode(ret, (bool)));
    }

    /// @notice Hands the creator share (including anything owed) to a new address.
    function setCreator(address next) external {
        require(msg.sender == creator, "not creator");
        require(next != address(0), "creator=0");
        emit CreatorChanged(creator, next);
        creator = next;
    }
}
