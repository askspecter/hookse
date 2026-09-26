// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// Pulls Uniswap v4 core contracts into the Hardhat build for local tests and deployments.
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
