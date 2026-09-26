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
import {HookseHook} from "./HookseHook.sol";
import {HookseToken} from "./HookseToken.sol";

/// @title HookseLauncher
/// @notice Permissionless, pool-first token launches. Each launch mints a fixed-supply token,
/// opens an ETH/token v4 pool on HookseHook with the chosen rule blocks, and seeds the whole
/// supply as single-sided liquidity. The position is owned by this contract and can never be
/// removed; its trading fees are claimable by the token's creator.
contract HookseLauncher is IUnlockCallback {
    using PoolIdLibrary for PoolKey;

    int24 public constant TICK_SPACING = 60;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IPoolManager public immutable poolManager;
    HookseHook public immutable hook;

    struct Launch {
        address token;
        address creator;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    mapping(PoolId => Launch) public launches;
    mapping(address => PoolKey) internal _keyOf;
    address[] public tokens;

    event Launched(
        address indexed token, address indexed creator, PoolId indexed id, string name, string symbol, uint256 supply, int24 startTick
    );
    event CreatorFeesCollected(PoolId indexed id, address creator, uint256 amount0, uint256 amount1);

    error NotPoolManager();
    error BadTick();
    error UnknownLaunch();

    enum Action {
        Seed,
        Collect
    }

    constructor(IPoolManager manager, HookseHook hook_) {
        poolManager = manager;
        hook = hook_;
    }

    /// @param startTick Opening tick, a multiple of 60. Price is token-per-ETH = 1.0001^startTick.
    function launch(
        string calldata name,
        string calldata symbol,
        uint256 supply,
        int24 startTick,
        HookseHook.Config calldata cfg
    ) external returns (address token, PoolId id) {
        int24 tickLower = TickMath.minUsableTick(TICK_SPACING);
        if (startTick % TICK_SPACING != 0 || startTick <= tickLower || startTick > TickMath.maxUsableTick(TICK_SPACING)) {
            revert BadTick();
        }

        token = address(new HookseToken(name, symbol, supply, address(this), msg.sender));
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
            LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(tickLower), sqrtStart, supply);
        launches[id] = Launch(token, msg.sender, tickLower, startTick, liquidity);
        _keyOf[token] = key;
        tokens.push(token);

        poolManager.unlock(abi.encode(Action.Seed, key));

        // Rounding dust that did not fit into the position is burned.
        uint256 dust = HookseToken(token).balanceOf(address(this));
        if (dust != 0) HookseToken(token).transfer(DEAD, dust);

        emit Launched(token, msg.sender, id, name, symbol, supply, startTick);
    }

    /// @notice Sends accrued LP fees of a launch's locked position to its creator. Callable by anyone.
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
            HookseToken(l.token).transfer(address(poolManager), owed);
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
