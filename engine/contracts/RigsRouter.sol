// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title RigsRouter
/// @notice Exact-input swaps for native-ETH/token Uniswap v4 pools (currency0 = ETH), used by the
/// Rigs coin pages. The caller is passed to the hook as hookData so pot winnings go to the real buyer.
contract RigsRouter is IUnlockCallback {
    using SafeERC20 for IERC20;

    IPoolManager public immutable poolManager;

    struct Job {
        PoolKey key;
        bool buy; // ETH -> token
        uint256 amountIn;
        uint256 minOut;
        address payer;
        address recipient;
    }

    event Swapped(address indexed token, address indexed trader, bool buy, uint256 amountIn, uint256 amountOut);

    error NotPoolManager();
    error NotEthPool();
    error TooLittleReceived(uint256 out, uint256 minOut);

    constructor(IPoolManager manager) {
        poolManager = manager;
    }

    function buy(PoolKey calldata key, uint256 minOut, address recipient) external payable returns (uint256 out) {
        out = _run(Job(key, true, msg.value, minOut, msg.sender, recipient));
    }

    /// @notice Sells `amountIn` tokens (approve this router first).
    function sell(PoolKey calldata key, uint256 amountIn, uint256 minOut, address recipient) external returns (uint256 out) {
        out = _run(Job(key, false, amountIn, minOut, msg.sender, recipient));
    }

    function _run(Job memory job) internal returns (uint256 out) {
        if (Currency.unwrap(job.key.currency0) != address(0)) revert NotEthPool();
        out = abi.decode(poolManager.unlock(abi.encode(job)), (uint256));
        emit Swapped(Currency.unwrap(job.key.currency1), job.payer, job.buy, job.amountIn, out);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        Job memory job = abi.decode(data, (Job));
        BalanceDelta d = poolManager.swap(
            job.key,
            SwapParams({
                zeroForOne: job.buy,
                amountSpecified: -int256(job.amountIn),
                sqrtPriceLimitX96: job.buy ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            abi.encode(job.payer)
        );
        int128 a0 = d.amount0();
        int128 a1 = d.amount1();

        uint256 paid;
        uint256 out;
        if (job.buy) {
            paid = uint256(uint128(-a0));
            out = uint256(uint128(a1));
            if (out < job.minOut) revert TooLittleReceived(out, job.minOut);
            poolManager.settle{value: paid}();
            poolManager.take(job.key.currency1, job.recipient, out);
            // Unused ETH (price limit reached) goes back to the payer.
            if (job.amountIn > paid) {
                (bool ok,) = job.payer.call{value: job.amountIn - paid}("");
                require(ok, "refund failed");
            }
        } else {
            paid = uint256(uint128(-a1));
            out = uint256(uint128(a0));
            if (out < job.minOut) revert TooLittleReceived(out, job.minOut);
            poolManager.sync(job.key.currency1);
            IERC20(Currency.unwrap(job.key.currency1)).safeTransferFrom(job.payer, address(poolManager), paid);
            poolManager.settle();
            poolManager.take(job.key.currency0, job.recipient, out);
        }
        return abi.encode(out);
    }
}
