// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// @title HookseHook
/// @notice One Uniswap v4 hook that runs a per-pool selection of rule blocks:
///  - ANTI_SNIPE: caps ETH per buy and adds a decaying extra LP fee for the first blocks
///  - SURGE_FEE: LP fee rises with trade size (ETH-equivalent)
///  - AUTO_BURN: a share of every exact-input buy's token output goes to the dead address
///  - LP_REWARDS: a share of each swap is donated to in-range liquidity
///  - NTH_BUY_POT: a share of each swap funds a pot paid to every Nth qualifying buy
/// Each enabled block may also pay a royalty to its registered author.
/// Pools must pair native ETH (currency0) with a token and use the dynamic-fee flag.
contract HookseHook is BaseHook {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint8 public constant ANTI_SNIPE = 1 << 0;
    uint8 public constant SURGE_FEE = 1 << 1;
    uint8 public constant AUTO_BURN = 1 << 2;
    uint8 public constant LP_REWARDS = 1 << 3;
    uint8 public constant NTH_BUY_POT = 1 << 4;
    uint8 public constant BLOCK_COUNT = 5;

    uint24 public constant MAX_FEE = 100_000; // 10% LP fee, in pips
    uint16 public constant MAX_ROYALTY_BPS = 25; // per block
    uint16 public constant MAX_TAKE_BPS = 1_000; // burn + lp + pot + all royalties
    uint256 internal constant BPS = 10_000;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    struct Config {
        uint8 blocks;
        uint24 baseFee;
        uint32 snipeBlocks;
        uint24 snipeFee;
        uint128 snipeMaxBuy;
        uint24 surgeMaxFee;
        uint128 surgeRefSize;
        uint16 burnBps;
        uint16 lpBps;
        uint16 potBps;
        uint32 potEvery;
        uint128 potMinBuy;
    }

    struct PoolState {
        Config cfg;
        uint64 launchBlock;
        uint64 buyCount;
        bool registered;
    }

    struct Author {
        address account;
        uint16 royaltyBps;
    }

    address public owner;
    address public launcher;
    mapping(PoolId => PoolState) internal _pools;
    mapping(uint8 => Author) public authors; // block index (0..4) => author
    mapping(PoolId => mapping(Currency => uint256)) public pot;
    mapping(address => mapping(Currency => uint256)) public claimable;

    event PoolRegistered(PoolId indexed id, Config cfg);
    event Burned(PoolId indexed id, uint256 amount);
    event Donated(PoolId indexed id, Currency currency, uint256 amount);
    event PotFunded(PoolId indexed id, Currency currency, uint256 amount);
    event PotWon(PoolId indexed id, address indexed winner, uint64 buyNumber, uint256 amount0, uint256 amount1);
    event RoyaltyAccrued(uint8 indexed blockIndex, address indexed author, Currency currency, uint256 amount);
    event Claimed(address indexed account, Currency currency, uint256 amount);
    event AuthorSet(uint8 indexed blockIndex, address account, uint16 royaltyBps);

    error NotOwner();
    error NotLauncher();
    error LauncherAlreadySet();
    error BadConfig();
    error UnknownPool();
    error SnipeCapExceeded(uint256 ethIn, uint256 cap);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(IPoolManager manager, address owner_) BaseHook(manager) {
        owner = owner_;
    }

    receive() external payable {}

    function getHookPermissions() public pure override returns (Hooks.Permissions memory p) {
        p.beforeInitialize = true;
        p.beforeSwap = true;
        p.afterSwap = true;
        p.afterSwapReturnDelta = true;
    }

    // ---------------------------------------------------------------- admin

    function setLauncher(address launcher_) external onlyOwner {
        if (launcher != address(0)) revert LauncherAlreadySet();
        launcher = launcher_;
    }

    function setAuthor(uint8 blockIndex, address account, uint16 royaltyBps) external onlyOwner {
        if (blockIndex >= BLOCK_COUNT || royaltyBps > MAX_ROYALTY_BPS) revert BadConfig();
        authors[blockIndex] = Author(account, royaltyBps);
        emit AuthorSet(blockIndex, account, royaltyBps);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ---------------------------------------------------------------- pools

    /// @notice Called by the launcher right before it initializes a pool.
    function register(PoolKey calldata key, Config calldata cfg) external {
        if (msg.sender != launcher) revert NotLauncher();
        _validate(key, cfg);
        PoolState storage s = _pools[key.toId()];
        if (s.registered) revert BadConfig();
        s.cfg = cfg;
        s.registered = true;
        emit PoolRegistered(key.toId(), cfg);
    }

    function getPool(PoolId id) external view returns (Config memory cfg, uint64 launchBlock, uint64 buyCount) {
        PoolState storage s = _pools[id];
        return (s.cfg, s.launchBlock, s.buyCount);
    }

    /// @notice Current LP fee (pips) a swap of `ethSize` would pay, including anti-snipe decay.
    function quoteFee(PoolId id, uint256 ethSize) public view returns (uint24) {
        PoolState storage s = _pools[id];
        return _fee(s.cfg, s.launchBlock, ethSize);
    }

    function claim(Currency currency) external returns (uint256 amount) {
        amount = claimable[msg.sender][currency];
        if (amount == 0) return 0;
        claimable[msg.sender][currency] = 0;
        currency.transfer(msg.sender, amount);
        emit Claimed(msg.sender, currency, amount);
    }

    // ---------------------------------------------------------------- hook callbacks

    function _beforeInitialize(address sender, PoolKey calldata key, uint160) internal override returns (bytes4) {
        PoolState storage s = _pools[key.toId()];
        if (sender != launcher) revert NotLauncher();
        if (!s.registered) revert UnknownPool();
        s.launchBlock = uint64(block.number);
        return IHooks.beforeInitialize.selector;
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        internal
        view
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolState storage s = _pools[key.toId()];
        uint256 size = (s.cfg.blocks & SURGE_FEE) != 0 ? _ethSize(key, params) : 0;
        uint24 fee = _fee(s.cfg, s.launchBlock, size);
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128) {
        PoolId id = key.toId();
        PoolState storage s = _pools[id];
        Config memory c = s.cfg;
        bool isBuy = params.zeroForOne; // ETH (currency0) in, token out
        uint256 ethIn = isBuy ? _abs(delta.amount0()) : 0;

        if (isBuy && (c.blocks & ANTI_SNIPE) != 0 && c.snipeMaxBuy != 0 && _inSnipeWindow(c, s.launchBlock)) {
            if (ethIn > c.snipeMaxBuy) revert SnipeCapExceeded(ethIn, c.snipeMaxBuy);
        }

        // Fees are taken in the unspecified currency (the side v4 lets a hook adjust after the swap).
        bool specifiedIs0 = (params.amountSpecified < 0) == params.zeroForOne;
        Currency cur = specifiedIs0 ? key.currency1 : key.currency0;
        uint256 amt = _abs(specifiedIs0 ? delta.amount1() : delta.amount0());

        uint256 total;
        if (amt != 0) total = _takeCuts(key, id, c, cur, amt, isBuy);

        if (isBuy && (c.blocks & NTH_BUY_POT) != 0 && ethIn >= c.potMinBuy) {
            uint64 n = ++s.buyCount;
            if (n % c.potEvery == 0) _payPot(key, id, n, _winner(hookData));
        }

        return (IHooks.afterSwap.selector, int128(int256(total)));
    }

    // ---------------------------------------------------------------- internals

    function _takeCuts(PoolKey calldata key, PoolId id, Config memory c, Currency cur, uint256 amt, bool isBuy)
        internal
        returns (uint256 total)
    {
        uint256 burnAmt;
        if ((c.blocks & AUTO_BURN) != 0 && isBuy && cur == key.currency1) burnAmt = amt * c.burnBps / BPS;

        uint256 lpAmt;
        if ((c.blocks & LP_REWARDS) != 0 && poolManager.getLiquidity(id) != 0) lpAmt = amt * c.lpBps / BPS;

        uint256 potAmt;
        if ((c.blocks & NTH_BUY_POT) != 0) potAmt = amt * c.potBps / BPS;

        uint256 royalties = _accrueRoyalties(c.blocks, cur, amt);

        if (burnAmt != 0) {
            poolManager.take(cur, DEAD, burnAmt);
            emit Burned(id, burnAmt);
        }
        if (potAmt + royalties != 0) poolManager.take(cur, address(this), potAmt + royalties);
        if (potAmt != 0) {
            pot[id][cur] += potAmt;
            emit PotFunded(id, cur, potAmt);
        }
        if (lpAmt != 0) {
            // The hook's credit from the returned delta pays for the donation.
            if (cur == key.currency0) poolManager.donate(key, lpAmt, 0, "");
            else poolManager.donate(key, 0, lpAmt, "");
            emit Donated(id, cur, lpAmt);
        }
        total = burnAmt + lpAmt + potAmt + royalties;
    }

    function _accrueRoyalties(uint8 blocks, Currency cur, uint256 amt) internal returns (uint256 total) {
        for (uint8 i; i < BLOCK_COUNT; ++i) {
            if ((blocks & (1 << i)) == 0) continue;
            Author memory a = authors[i];
            if (a.account == address(0) || a.royaltyBps == 0) continue;
            uint256 r = amt * a.royaltyBps / BPS;
            if (r == 0) continue;
            claimable[a.account][cur] += r;
            total += r;
            emit RoyaltyAccrued(i, a.account, cur, r);
        }
    }

    function _payPot(PoolKey calldata key, PoolId id, uint64 n, address winner) internal {
        uint256 a0 = pot[id][key.currency0];
        uint256 a1 = pot[id][key.currency1];
        if (a0 == 0 && a1 == 0) return;
        pot[id][key.currency0] = 0;
        pot[id][key.currency1] = 0;
        claimable[winner][key.currency0] += a0;
        claimable[winner][key.currency1] += a1;
        emit PotWon(id, winner, n, a0, a1);
    }

    /// @dev Routers pass the real buyer in hookData; fall back to tx.origin otherwise.
    function _winner(bytes calldata hookData) internal view returns (address) {
        if (hookData.length >= 32) {
            address w = abi.decode(hookData, (address));
            if (w != address(0)) return w;
        }
        return tx.origin;
    }

    function _fee(Config memory c, uint64 launchBlock, uint256 ethSize) internal view returns (uint24) {
        uint256 fee = c.baseFee;
        if ((c.blocks & SURGE_FEE) != 0 && c.surgeRefSize != 0 && c.surgeMaxFee > c.baseFee) {
            uint256 size = ethSize > c.surgeRefSize ? c.surgeRefSize : ethSize;
            fee += uint256(c.surgeMaxFee - c.baseFee) * size / c.surgeRefSize;
        }
        if ((c.blocks & ANTI_SNIPE) != 0 && _inSnipeWindow(c, launchBlock)) {
            uint256 remaining = uint256(launchBlock) + c.snipeBlocks - block.number;
            fee += uint256(c.snipeFee) * remaining / c.snipeBlocks;
        }
        return uint24(fee > MAX_FEE ? MAX_FEE : fee);
    }

    function _inSnipeWindow(Config memory c, uint64 launchBlock) internal view returns (bool) {
        return c.snipeBlocks != 0 && block.number < uint256(launchBlock) + c.snipeBlocks;
    }

    /// @dev Trade size in ETH. When the token amount is specified, convert at the current price.
    function _ethSize(PoolKey calldata key, SwapParams calldata params) internal view returns (uint256) {
        uint256 amt = params.amountSpecified < 0 ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        if ((params.amountSpecified < 0) == params.zeroForOne) return amt;
        (uint160 sqrtP,,,) = poolManager.getSlot0(key.toId());
        // price = token1 per token0 = (sqrtP / 2^96)^2, so eth = tokens * 2^192 / sqrtP^2
        return FullMath.mulDiv(FullMath.mulDiv(amt, 1 << 96, sqrtP), 1 << 96, sqrtP);
    }

    function _validate(PoolKey calldata key, Config calldata c) internal view {
        bool ok = Currency.unwrap(key.currency0) == address(0) && address(key.hooks) == address(this)
            && key.fee == LPFeeLibrary.DYNAMIC_FEE_FLAG && c.baseFee <= MAX_FEE && c.surgeMaxFee <= MAX_FEE
            && c.snipeFee <= MAX_FEE
            && uint256(c.burnBps) + c.lpBps + c.potBps + uint256(MAX_ROYALTY_BPS) * BLOCK_COUNT <= MAX_TAKE_BPS
            && ((c.blocks & NTH_BUY_POT) == 0 || c.potEvery != 0) && c.blocks < (1 << BLOCK_COUNT);
        if (!ok) revert BadConfig();
    }

    function _abs(int128 x) internal pure returns (uint256) {
        return x < 0 ? uint256(uint128(-x)) : uint256(uint128(x));
    }
}
