// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IArgusPortal} from "./IArgus.sol";
import {ArgusVault} from "./ArgusVault.sol";

/// @notice Launches coins on Argus (Arc) through Rigs. Each coin's Argus creator is its own ArgusVault,
/// which sends 80% of what Argus credits the creator to the person who launched here and 20% to the
/// Rigs treasury. The vault address is deterministic (creator + salt), so the site can mine the
/// launch's hook salt before sending the transaction.
contract ArgusLauncher is Ownable {
    using SafeERC20 for IERC20;

    IArgusPortal public immutable portal;
    address public immutable vaultImplementation;
    address public treasury;

    struct Launch {
        address token;
        address vault;
        address creator;
        uint64 launchedAt;
    }

    Launch[] public launches;
    mapping(address token => uint256) public idOf;
    mapping(address creator => uint256[]) internal _byCreator;

    event Launched(uint256 indexed id, address indexed creator, address indexed token, address vault, uint256 devBuy);
    event TreasurySet(address treasury);

    constructor(IArgusPortal portal_, address vaultImplementation_, address owner_, address treasury_) Ownable(owner_) {
        require(treasury_ != address(0), "treasury=0");
        portal = portal_;
        vaultImplementation = vaultImplementation_;
        treasury = treasury_;
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "treasury=0");
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function vaultSalt(address creator, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(creator, salt));
    }

    /// @notice The vault (and so the Argus creator) a launch by `creator` with `salt` will use.
    function vaultFor(address creator, bytes32 salt) external view returns (address) {
        return Clones.predictDeterministicAddress(vaultImplementation, vaultSalt(creator, salt));
    }

    /// @notice Launches on Argus. For a dev buy, approve this contract for p.devBuyQuote of p.quoteAsset first.
    /// `salt` is used for both the vault and the Argus launch; `hookSalt` must be mined for vaultFor(msg.sender, salt).
    function launch(
        IArgusPortal.LaunchParams calldata p,
        IArgusPortal.LaunchMeta calldata meta,
        bytes32 salt,
        bytes32 hookSalt
    ) external returns (uint256 id, address token) {
        ArgusVault vault =
            ArgusVault(payable(Clones.cloneDeterministic(vaultImplementation, vaultSalt(msg.sender, salt))));
        vault.initialize(msg.sender);
        if (p.devBuyQuote != 0) IERC20(p.quoteAsset).safeTransferFrom(msg.sender, address(vault), p.devBuyQuote);

        token = vault.launchOn(portal, p, meta, salt, hookSalt);

        id = launches.length;
        launches.push(Launch(token, address(vault), msg.sender, uint64(block.timestamp)));
        idOf[token] = id;
        _byCreator[msg.sender].push(id);
        emit Launched(id, msg.sender, token, address(vault), p.devBuyQuote);
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }

    /// @notice Launch ids started by `creator` (by original launcher, not current vault creator).
    function launchesOf(address creator) external view returns (uint256[] memory) {
        return _byCreator[creator];
    }
}
