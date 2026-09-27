// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPonsFeeEscrow, IPonsCurve} from "./IPons.sol";

interface ITreasurySource {
    function treasury() external view returns (address);
}

/// @notice Registered with Pons as a coin's creator-fee recipient, so on Pons the "creator"
/// shows as this contract. `harvest` (callable by anyone) sweeps the curve fees into the Pons
/// escrow, claims them, pays TREASURY_BPS to the Rigs treasury and credits the rest to the
/// coin's creator, who withdraws it from the Rigs site.
/// There is no function to change the Pons fee recipient, so the pairing is permanent.
/// Deployed once as an implementation; each coin gets a minimal-proxy clone.
contract CreatorFeeSplitter {
    uint256 public constant CREATOR_BPS = 8_000;
    uint256 public constant TREASURY_BPS = 2_000;

    IPonsFeeEscrow public immutable escrow;

    address public launcher;
    address public creator;
    address public curve;
    uint256 public creatorOwed;
    uint256 public totalToCreator;
    uint256 public totalToTreasury;

    event Harvested(uint256 toCreator, uint256 toTreasury);
    event Withdrawn(address indexed creator, uint256 amount);
    event CreatorChanged(address indexed previous, address indexed next);

    constructor(IPonsFeeEscrow escrow_) {
        escrow = escrow_;
        launcher = address(1); // the implementation itself is never used directly
    }

    /// @dev Called by the launcher in the same transaction that creates the clone.
    function initialize(address creator_) external {
        require(launcher == address(0), "initialized");
        require(creator_ != address(0), "creator=0");
        launcher = msg.sender;
        creator = creator_;
    }

    /// @dev The curve only exists after Pons launches the coin, so the launcher sets it once.
    function setCurve(address curve_) external {
        require(msg.sender == launcher && curve == address(0), "curve set");
        curve = curve_;
    }

    receive() external payable {}

    /// @notice Fees not yet split: still in the Pons escrow or held here unsplit.
    function pending() public view returns (uint256) {
        return escrow.balanceOf(address(this)) + address(this).balance - creatorOwed;
    }

    /// @notice What the creator could withdraw right now if they harvested first.
    function claimable() external view returns (uint256) {
        return creatorOwed + pending() * CREATOR_BPS / 10_000;
    }

    function harvest() public {
        // Pre-graduation fees sit on the curve until swept. After graduation the curve
        // rejects this and Pons' sweep operator credits pool fees, so failure is ignored.
        if (curve != address(0)) {
            (bool swept,) = curve.call(abi.encodeCall(IPonsCurve.sweepFees, (0)));
            swept;
        }
        if (escrow.balanceOf(address(this)) > 0) escrow.claim();

        uint256 amount = address(this).balance - creatorOwed;
        if (amount == 0) return;
        uint256 toTreasury = amount * TREASURY_BPS / 10_000;
        uint256 toCreator = amount - toTreasury;
        creatorOwed += toCreator;
        totalToCreator += toCreator;
        totalToTreasury += toTreasury;

        (bool ok,) = ITreasurySource(launcher).treasury().call{value: toTreasury}("");
        require(ok, "treasury transfer failed");
        emit Harvested(toCreator, toTreasury);
    }

    /// @notice Harvests, then pays the creator everything owed. Only the creator.
    function claim() external returns (uint256 amount) {
        require(msg.sender == creator, "not creator");
        harvest();
        amount = creatorOwed;
        if (amount == 0) return 0;
        creatorOwed = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "creator transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Hands the creator share (including anything owed) to a new address.
    function setCreator(address next) external {
        require(msg.sender == creator, "not creator");
        require(next != address(0), "creator=0");
        emit CreatorChanged(creator, next);
        creator = next;
    }
}
