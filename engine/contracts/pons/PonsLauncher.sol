// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPonsFactory, IPonsCurve} from "./IPons.sol";
import {CreatorFeeSplitter} from "./CreatorFeeSplitter.sol";

/// @notice Launches coins on Pons V2 (bonding curve, then graduation into a locked Uniswap v4
/// pool) through Rigs. Each coin's Pons creator-fee recipient is its own CreatorFeeSplitter,
/// which sends 80% of creator fees to the person who launched here and 20% to the treasury.
/// Optionally buys on the curve for the creator in the same transaction.
contract PonsLauncher is Ownable {
    IPonsFactory public immutable pons;
    address public immutable splitterImplementation;
    address public treasury;

    struct Launch {
        address token;
        address curve;
        address splitter;
        address creator;
        uint64 launchedAt;
    }

    struct LaunchParams {
        string name;
        string symbol;
        string logo;
        string description;
        IPonsFactory.Socials socials;
        uint16 creatorTaxBps;
        uint256 launchConfigId;
        bytes32 expectedEconomics;
        bytes32 salt;
        uint256 minTokensOut; // for the optional creator buy (msg.value above the launch fee)
    }

    Launch[] public launches;
    mapping(address token => uint256) public idOf;
    mapping(address creator => uint256[]) internal _byCreator;

    event Launched(
        uint256 indexed id, address indexed creator, address indexed token, address curve, address splitter, uint256 devBuy
    );
    event TreasurySet(address treasury);

    constructor(IPonsFactory pons_, address splitterImplementation_, address owner_, address treasury_)
        Ownable(owner_)
    {
        require(treasury_ != address(0), "treasury=0");
        pons = pons_;
        splitterImplementation = splitterImplementation_;
        treasury = treasury_;
        require(
            address(CreatorFeeSplitter(payable(splitterImplementation_)).escrow()) == pons_.feeEscrow(), "splitter escrow"
        );
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "treasury=0");
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    /// @notice msg.value = pons.launchFee() + optional ETH to buy on the curve for the creator.
    function launch(LaunchParams calldata p) external payable returns (uint256 id) {
        uint256 fee = pons.launchFee();
        require(msg.value >= fee, "launch fee");
        uint256 devBuy = msg.value - fee;

        CreatorFeeSplitter splitter = CreatorFeeSplitter(payable(Clones.clone(splitterImplementation)));
        splitter.initialize(msg.sender);

        (address token, address curve) = pons.launchToken{value: fee}(
            IPonsFactory.TokenParams({
                name: p.name,
                symbol: p.symbol,
                logo: p.logo,
                description: p.description,
                socials: p.socials,
                creatorFeeRecipient: address(splitter),
                creatorTaxBps: p.creatorTaxBps,
                buybackEnabled: false,
                expectedEconomics: p.expectedEconomics,
                salt: p.salt
            }),
            p.launchConfigId,
            address(0) // priced in native ETH
        );
        splitter.setCurve(curve);

        if (devBuy != 0) IPonsCurve(curve).buy{value: devBuy}(devBuy, p.minTokensOut, msg.sender);

        id = launches.length;
        launches.push(Launch(token, curve, address(splitter), msg.sender, uint64(block.timestamp)));
        idOf[token] = id;
        _byCreator[msg.sender].push(id);
        emit Launched(id, msg.sender, token, curve, address(splitter), devBuy);
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }

    /// @notice Launch ids started by `creator` (by original launcher, not current splitter creator).
    function launchesOf(address creator) external view returns (uint256[] memory) {
        return _byCreator[creator];
    }
}
