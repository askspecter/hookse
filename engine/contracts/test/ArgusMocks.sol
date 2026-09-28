// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IArgusPortal} from "../arc/IArgus.sol";

contract MockUsdc is ERC20 {
    mapping(address => bool) public blocked;

    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address a, bool b) external {
        blocked[a] = b;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[to] && !blocked[from], "blocked");
        super._update(from, to, value);
    }
}

contract MockArgusToken is ERC20 {
    constructor(string memory n, string memory s, address to) ERC20(n, s) {
        _mint(to, 1_000_000_000 ether);
    }
}

/// @dev Credits the creator; claim(account) is permissionless and pays `account`, like Argus #7.
contract MockArgusSplitter {
    address public immutable creator;
    ERC20 public immutable quote;
    ERC20 public immutable token;
    uint256 public creditedQuote;
    uint256 public creditedToken;

    constructor(address creator_, ERC20 quote_, ERC20 token_) {
        creator = creator_;
        quote = quote_;
        token = token_;
    }

    /// @dev Stands in for distribute(): pulls tax from the caller and credits the creator.
    function credit(uint256 q, uint256 t) external {
        if (q != 0) quote.transferFrom(msg.sender, address(this), q);
        if (t != 0) token.transferFrom(msg.sender, address(this), t);
        creditedQuote += q;
        creditedToken += t;
    }

    function claim(address account) external returns (uint256, uint256, uint256) {
        require(account == creator, "NothingToClaim");
        (uint256 q, uint256 t) = (creditedQuote, creditedToken);
        require(q != 0 || t != 0, "NothingToClaim");
        creditedQuote = 0;
        creditedToken = 0;
        if (q != 0) quote.transfer(account, q);
        if (t != 0) token.transfer(account, t);
        return (q, t, 0);
    }
}

/// @dev launch(): creator = msg.sender, pulls the dev buy from msg.sender, sends 1000 coins per quote unit
/// back for 90% of it and refunds the rest (like a partially filled dev buy).
contract MockArgusPortal {
    struct Rec {
        address creator;
        address splitter;
        address quote;
    }

    mapping(address => Rec) internal recs;
    IArgusPortal.LaunchParams public lastParams;
    bytes32 public lastSalt;
    bytes32 public lastHookSalt;

    function launch(
        IArgusPortal.LaunchParams calldata p,
        IArgusPortal.LaunchMeta calldata,
        bytes32 salt,
        bytes32 hookSalt
    ) external returns (address token) {
        require(p.creatorBps + p.burnBps + p.dividendBps + p.liquidityBps == 10_000, "InvalidAllocation");
        lastParams = p;
        lastSalt = salt;
        lastHookSalt = hookSalt;
        MockArgusToken t = new MockArgusToken(p.name, p.symbol, address(this));
        token = address(t);
        if (p.devBuyQuote != 0) {
            ERC20(p.quoteAsset).transferFrom(msg.sender, address(this), p.devBuyQuote);
            uint256 spent = p.devBuyQuote * 9 / 10;
            t.transfer(msg.sender, spent * 1000);
            ERC20(p.quoteAsset).transfer(msg.sender, p.devBuyQuote - spent);
        }
        MockArgusSplitter s = new MockArgusSplitter(msg.sender, ERC20(p.quoteAsset), t);
        recs[token] = Rec(msg.sender, address(s), p.quoteAsset);
        t.transfer(0x000000000000000000000000000000000000dEaD, 1 ether);
    }

    function launches(address token)
        external
        view
        returns (address, int24, bool, address, address, address, uint16, uint16, uint256, int24, address)
    {
        Rec memory r = recs[token];
        return (r.creator, 0, true, address(0), address(0), r.splitter, 0, 0, 0, 0, r.quote);
    }

    /// @dev Test helper: coins for a trader.
    function give(address token, address to, uint256 amount) external {
        ERC20(token).transfer(to, amount);
    }
}
