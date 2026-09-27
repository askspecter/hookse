// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {RigsHook} from "./RigsHook.sol";
import {RigsToken} from "./RigsToken.sol";

/// @title RigsLauncher
/// @notice Opens ETH/token Uniswap v4 pools on RigsHook with the chosen rule blocks.
///  - `launch` mints a new fixed-supply token and seeds the whole supply.
///  - `openExisting` takes tokens of an existing ERC-20 from the caller and seeds those.
/// In both cases the tokens become single-sided liquidity above the opening price, owned by this
/// contract and never removable. The position's LP fees are claimable for the opener.
contract RigsLauncher is IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using SafeERC20 for IERC20;

    int24 public constant TICK_SPACING = 60;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IPoolManager public immutable poolManager;
    RigsHook public immutable hook;

    struct Launch {
        address token;
        address creator;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        bool existing;
    }

    mapping(PoolId => Launch) public launches;
    mapping(address => PoolKey) internal _keyOf;
    address[] public tokens;

    event Launched(
        address indexed token, address indexed creator, PoolId indexed id, string name, string symbol, uint256 supply, int24 startTick
    );
    event Opened(address indexed token, address indexed creator, PoolId indexed id, uint256 amount, int24 startTick);
    event CreatorFeesCollected(PoolId indexed id, address creator, uint256 amount0, uint256 amount1);

    error NotPoolManager();
    error BadTick();
    error BadToken();
    error UnknownLaunch();

    enum Action {
        Seed,
        Collect
    }

    constructor(IPoolManager manager, RigsHook hook_) {
        poolManager = manager;
        hook = hook_;
    }

    /// @param startTick Opening tick, a multiple of 60. Price is token-per-ETH = 1.0001^startTick.
    function launch(
        string calldata name,
        string calldata symbol,
        uint256 supply,
        int24 startTick,
        RigsHook.Config calldata cfg
    ) external returns (address token, PoolId id) {
        token = address(new RigsToken(name, symbol, supply, address(this), msg.sender));
        id = _open(token, supply, startTick, cfg, false);
        // Rounding dust that did not fit into the position is burned.
        uint256 dust = IERC20(token).balanceOf(address(this));
        if (dust != 0) IERC20(token).safeTransfer(DEAD, dust);
        emit Launched(token, msg.sender, id, name, symbol, supply, startTick);
    }

    /// @notice Opens a hooked pool for a token that already exists. The caller must approve
    /// `amount` first; those tokens are locked in the pool for good. Reverts if this token
    /// already has a Rigs pool.
    function openExisting(address token, uint256 amount, int24 startTick, RigsHook.Config calldata cfg)
        external
        returns (PoolId id)
    {
        if (token == address(0) || token.code.length == 0 || amount == 0) revert BadToken();
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before; // fee-on-transfer safe
        id = _open(token, received, startTick, cfg, true);
        // Rounding dust goes back to the opener.
        uint256 dust = IERC20(token).balanceOf(address(this)) - before;
        if (dust != 0) IERC20(token).safeTransfer(msg.sender, dust);
        emit Opened(token, msg.sender, id, received, startTick);
    }

    function _open(address token, uint256 amount, int24 startTick, RigsHook.Config calldata cfg, bool existing)
        internal
        returns (PoolId id)
    {
        int24 tickLower = TickMath.minUsableTick(TICK_SPACING);
        if (startTick % TICK_SPACING != 0 || startTick <= tickLower || startTick > TickMath.maxUsableTick(TICK_SPACING)) {
            revert BadTick();
        }
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(token),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });
        id = key.toId();

        hook.register(key, cfg);
        uint160 sqrtStart = TickMath.getSqrtPriceAtTick(startTick);
        poolManager.initialize(key, sqrtStart);

        // Token-only liquidity sits below the opening price; buys push the price down into it.
        uint128 liquidity =
            LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(tickLower), sqrtStart, amount);
        launches[id] = Launch(token, msg.sender, tickLower, startTick, liquidity, existing);
        _keyOf[token] = key;
        tokens.push(token);

        poolManager.unlock(abi.encode(Action.Seed, key));
    }

    /// @notice Sends accrued LP fees of a pool's locked position to its creator. Callable by anyone.
    function collectCreatorFees(address token) external returns (uint256 amount0, uint256 amount1) {
        PoolKey memory key = _keyOf[token];
        if (!(key.currency1 == Currency.wrap(token))) revert UnknownLaunch();
        bytes memory res = poolManager.unlock(abi.encode(Action.Collect, key));
        (amount0, amount1) = abi.decode(res, (uint256, uint256));
        emit CreatorFeesCollected(key.toId(), launches[key.toId()].creator, amount0, amount1);
    }

    function keyOf(address token) external view returns (PoolKey memory) {
        return _keyOf[token];
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (Action action, PoolKey memory key) = abi.decode(data, (Action, PoolKey));
        Launch memory l = launches[key.toId()];

        if (action == Action.Seed) {
            (BalanceDelta delta,) = poolManager.modifyLiquidity(
                key, ModifyLiquidityParams(l.tickLower, l.tickUpper, int256(uint256(l.liquidity)), bytes32(0)), ""
            );
            uint256 owed = uint256(uint128(-delta.amount1()));
            poolManager.sync(key.currency1);
            IERC20(l.token).safeTransfer(address(poolManager), owed);
            poolManager.settle();
            return "";
        }

        // Collect: a zero-liquidity modification realizes the position's accrued fees.
        (BalanceDelta fees,) =
            poolManager.modifyLiquidity(key, ModifyLiquidityParams(l.tickLower, l.tickUpper, 0, bytes32(0)), "");
        uint256 a0 = uint256(uint128(fees.amount0()));
        uint256 a1 = uint256(uint128(fees.amount1()));
        if (a0 != 0) poolManager.take(key.currency0, l.creator, a0);
        if (a1 != 0) poolManager.take(key.currency1, l.creator, a1);
        return abi.encode(a0, a1);
    }
}
