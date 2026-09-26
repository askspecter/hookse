// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply token minted once to the launcher, which seeds it into the pool.
contract HookseToken is ERC20 {
    address public immutable creator;

    constructor(string memory name_, string memory symbol_, uint256 supply, address to, address creator_)
        ERC20(name_, symbol_)
    {
        creator = creator_;
        _mint(to, supply);
    }
}
