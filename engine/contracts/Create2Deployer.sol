// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Deploys contracts at deterministic addresses. Used to land the hook on an
/// address whose low bits encode its Uniswap v4 permissions.
contract Create2Deployer {
    event Deployed(address addr, bytes32 salt);

    function deploy(bytes32 salt, bytes calldata initCode) external returns (address addr) {
        bytes memory code = initCode;
        assembly {
            addr := create2(0, add(code, 0x20), mload(code), salt)
        }
        require(addr != address(0), "create2 failed");
        emit Deployed(addr, salt);
    }
}
