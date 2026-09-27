// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RigsAuctions
/// @notice Dutch auctions of ERC-20 tokens for ETH. The seller deposits tokens; the price per
/// whole token (1e18 units) falls linearly from `startPrice` to `floorPrice` between `start` and
/// `end`, then stays at the floor until the auction ends. Buyers pay the current price. The seller
/// withdraws ETH proceeds at any time and unsold tokens once the auction is over. The seller can
/// end an auction early. No fees are taken.
contract RigsAuctions is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint64 public constant MAX_DURATION = 30 days;

    struct Auction {
        address seller;
        address token;
        uint128 amount; // tokens deposited
        uint128 sold;
        uint128 startPrice; // wei per 1e18 token units
        uint128 floorPrice;
        uint64 start;
        uint64 end;
        uint128 proceeds; // ETH not yet withdrawn
        bool unsoldWithdrawn;
    }

    Auction[] internal _auctions;

    event Created(uint256 indexed id, address indexed seller, address indexed token, uint256 amount, uint256 startPrice, uint256 floorPrice, uint64 start, uint64 end);
    event Bought(uint256 indexed id, address indexed buyer, uint256 tokens, uint256 paid);
    event Ended(uint256 indexed id);
    event Withdrawn(uint256 indexed id, uint256 eth, uint256 tokens);

    error BadParams();
    error NotActive();
    error NotSeller();
    error NotOver();
    error Underpaid(uint256 cost);
    error SoldOut();

    function create(address token, uint256 amount, uint256 startPrice, uint256 floorPrice, uint64 start, uint64 duration)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (start == 0) start = uint64(block.timestamp);
        if (
            token.code.length == 0 || amount == 0 || floorPrice == 0 || startPrice < floorPrice || duration == 0
                || duration > MAX_DURATION || start < block.timestamp || amount > type(uint128).max
                || startPrice > type(uint128).max
        ) revert BadParams();
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        if (received == 0) revert BadParams();

        id = _auctions.length;
        _auctions.push(Auction(msg.sender, token, uint128(received), 0, uint128(startPrice), uint128(floorPrice), start, start + duration, 0, false));
        emit Created(id, msg.sender, token, received, startPrice, floorPrice, start, start + duration);
    }

    /// @notice Current price in wei per 1e18 token units.
    function priceOf(uint256 id) public view returns (uint256) {
        Auction storage a = _auctions[id];
        if (block.timestamp <= a.start) return a.startPrice;
        if (block.timestamp >= a.end) return a.floorPrice;
        uint256 elapsed = block.timestamp - a.start;
        return a.startPrice - (uint256(a.startPrice - a.floorPrice) * elapsed) / (a.end - a.start);
    }

    /// @notice ETH needed for `tokens` at the current price (rounded up).
    function quote(uint256 id, uint256 tokens) public view returns (uint256) {
        return (tokens * priceOf(id) + 1e18 - 1) / 1e18;
    }

    /// @notice Buys up to `tokens` (fewer if fewer remain). Excess ETH is refunded.
    function buy(uint256 id, uint256 tokens) external payable nonReentrant returns (uint256 bought, uint256 cost) {
        Auction storage a = _auctions[id];
        if (block.timestamp < a.start || block.timestamp >= a.end) revert NotActive();
        uint256 left = a.amount - a.sold;
        if (left == 0) revert SoldOut();
        bought = tokens > left ? left : tokens;
        if (bought == 0) revert BadParams();
        cost = quote(id, bought);
        if (msg.value < cost) revert Underpaid(cost);

        a.sold += uint128(bought);
        a.proceeds += uint128(cost);
        IERC20(a.token).safeTransfer(msg.sender, bought);
        if (msg.value > cost) {
            (bool ok,) = msg.sender.call{value: msg.value - cost}("");
            require(ok, "refund failed");
        }
        emit Bought(id, msg.sender, bought, cost);
    }

    /// @notice Seller ends the auction now.
    function end(uint256 id) external {
        Auction storage a = _auctions[id];
        if (msg.sender != a.seller) revert NotSeller();
        if (block.timestamp >= a.end) revert NotActive();
        a.end = uint64(block.timestamp);
        if (a.start > a.end) a.start = a.end;
        emit Ended(id);
    }

    /// @notice Seller takes ETH proceeds so far, plus unsold tokens once the auction is over.
    function withdraw(uint256 id) external nonReentrant returns (uint256 eth, uint256 tokens) {
        Auction storage a = _auctions[id];
        if (msg.sender != a.seller) revert NotSeller();
        eth = a.proceeds;
        a.proceeds = 0;
        if (block.timestamp >= a.end && !a.unsoldWithdrawn) {
            a.unsoldWithdrawn = true;
            tokens = a.amount - a.sold;
            if (tokens != 0) IERC20(a.token).safeTransfer(a.seller, tokens);
        }
        if (eth != 0) {
            (bool ok,) = a.seller.call{value: eth}("");
            require(ok, "eth transfer failed");
        }
        emit Withdrawn(id, eth, tokens);
    }

    function auctions(uint256 id) external view returns (Auction memory) {
        return _auctions[id];
    }

    function auctionCount() external view returns (uint256) {
        return _auctions.length;
    }
}
