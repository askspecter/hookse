// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IPonsFactory} from "../pons/IPons.sol";

/// @dev Credits fees to recipients; claim() pays the caller, like the Pons escrow.
contract MockPonsEscrow {
    mapping(address => uint256) public balanceOf;

    function credit(address recipient) external payable {
        balanceOf[recipient] += msg.value;
    }

    function claim() external {
        uint256 amount = balanceOf[msg.sender];
        balanceOf[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
    }
}

contract MockPonsToken is ERC20 {
    constructor(string memory n, string memory s, address to) ERC20(n, s) {
        _mint(to, 1_000_000_000 ether);
    }
}

/// @dev Fixed-price curve: 1 ETH = 1e6 tokens, 1% creator fee accrued on the curve until swept.
contract MockPonsCurve {
    MockPonsEscrow public immutable escrow;
    address public immutable feeRecipient;
    MockPonsToken public token;
    uint256 public accrued;

    constructor(MockPonsEscrow escrow_, address feeRecipient_) {
        escrow = escrow_;
        feeRecipient = feeRecipient_;
    }

    function setToken(MockPonsToken t) external {
        require(address(token) == address(0));
        token = t;
    }

    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) external payable returns (uint256 out) {
        require(msg.value == quoteIn, "value");
        uint256 fee = quoteIn / 100;
        accrued += fee;
        out = (quoteIn - fee) * 1e6;
        require(out >= minTokensOut, "slippage");
        token.transfer(recipient, out);
    }

    function sweepFees(uint256) external {
        require(msg.sender == feeRecipient, "only recipient");
        uint256 a = accrued;
        accrued = 0;
        escrow.credit{value: a}(feeRecipient);
    }
}

contract MockPonsFactory {
    MockPonsEscrow public immutable escrow = new MockPonsEscrow();
    uint256 public constant launchFee = 0.0005 ether;
    address public lastRecipient;
    uint16 public lastTax;

    function feeEscrow() external view returns (address) {
        return address(escrow);
    }

    function maxCreatorTaxBps() external pure returns (uint16) {
        return 500;
    }

    function previewLaunchEconomics(uint256 launchConfigId, address pairToken) public pure returns (bytes32) {
        return keccak256(abi.encode("mock-economics", launchConfigId, pairToken));
    }

    function launchToken(IPonsFactory.TokenParams calldata params, uint256, address pairToken)
        external
        payable
        returns (address token, address curve)
    {
        require(msg.value == launchFee && pairToken == address(0), "mock launch");
        require(
            params.expectedEconomics == bytes32(0) || params.expectedEconomics == previewLaunchEconomics(0, pairToken),
            "economics changed"
        );
        lastRecipient = params.creatorFeeRecipient;
        lastTax = params.creatorTaxBps;
        MockPonsCurve c = new MockPonsCurve(escrow, params.creatorFeeRecipient);
        MockPonsToken t = new MockPonsToken(params.name, params.symbol, address(c));
        c.setToken(t);
        return (address(t), address(c));
    }
}
