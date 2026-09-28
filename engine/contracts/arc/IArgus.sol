// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice The parts of Argus Portal #7 on Arc that Rigs uses (ABI from arguspad.io/argus-v4.json, version 3).
interface IArgusPortal {
    struct LaunchParams {
        string name;
        string symbol;
        uint256 totalSupply;
        uint256 startFdvUsdc6;
        uint256 bondFdvUsdc6;
        uint16 buyTaxBps;
        uint16 sellTaxBps;
        uint16 creatorBps;
        uint16 burnBps;
        uint16 dividendBps;
        uint16 liquidityBps;
        uint256 devBuyQuote;
        address quoteAsset;
        uint8 expectConvert;
    }

    struct LaunchMeta {
        string imageURI;
        string website;
        string twitter;
        string telegram;
        string description;
    }

    function launch(LaunchParams calldata p, LaunchMeta calldata meta, bytes32 salt, bytes32 hookSalt)
        external
        returns (address token);

    function launches(address token)
        external
        view
        returns (
            address creator,
            int24 tickStart,
            bool tokenIsToken0,
            address locker,
            address hook,
            address splitter,
            uint16 buyTaxBps,
            uint16 sellTaxBps,
            uint256 positionId,
            int24 tickBond,
            address quoteAsset
        );
}

/// @notice Per-launch Argus splitter. claim(account) is permissionless and always pays `account`.
interface IArgusSplitter {
    function claim(address account) external returns (uint256 amountQuote6, uint256 amount18, uint256 usdcOut6);
}
