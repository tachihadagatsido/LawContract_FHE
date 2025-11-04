pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract LawContract_FHE is ZamaEthereumConfig {
    struct ContractClause {
        string clauseId;
        euint32 encryptedThreshold;
        uint256 publicParameter1;
        uint256 publicParameter2;
        string clauseDescription;
        address creator;
        uint256 creationTimestamp;
        uint32 decryptedThreshold;
        bool isBreached;
    }

    mapping(string => ContractClause) public contractClauses;
    string[] public clauseIds;

    event ClauseCreated(string indexed clauseId, address indexed creator);
    event BreachDetected(string indexed clauseId, uint32 decryptedThreshold);

    constructor() ZamaEthereumConfig() {}

    function createClause(
        string calldata clauseId,
        string calldata clauseDescription,
        externalEuint32 encryptedThreshold,
        bytes calldata inputProof,
        uint256 publicParameter1,
        uint256 publicParameter2
    ) external {
        require(bytes(contractClauses[clauseId].clauseId).length == 0, "Clause already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedThreshold, inputProof)), "Invalid encrypted threshold");

        contractClauses[clauseId] = ContractClause({
            clauseId: clauseId,
            encryptedThreshold: FHE.fromExternal(encryptedThreshold, inputProof),
            publicParameter1: publicParameter1,
            publicParameter2: publicParameter2,
            clauseDescription: clauseDescription,
            creator: msg.sender,
            creationTimestamp: block.timestamp,
            decryptedThreshold: 0,
            isBreached: false
        });

        FHE.allowThis(contractClauses[clauseId].encryptedThreshold);
        FHE.makePubliclyDecryptable(contractClauses[clauseId].encryptedThreshold);
        clauseIds.push(clauseId);

        emit ClauseCreated(clauseId, msg.sender);
    }

    function checkBreach(
        string calldata clauseId,
        bytes memory abiEncodedClearThreshold,
        bytes memory decryptionProof
    ) external {
        require(bytes(contractClauses[clauseId].clauseId).length > 0, "Clause does not exist");
        require(!contractClauses[clauseId].isBreached, "Breach already detected");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(contractClauses[clauseId].encryptedThreshold);

        FHE.checkSignatures(cts, abiEncodedClearThreshold, decryptionProof);

        uint32 decodedThreshold = abi.decode(abiEncodedClearThreshold, (uint32));

        contractClauses[clauseId].decryptedThreshold = decodedThreshold;
        contractClauses[clauseId].isBreached = true;

        emit BreachDetected(clauseId, decodedThreshold);
    }

    function getEncryptedThreshold(string calldata clauseId) external view returns (euint32) {
        require(bytes(contractClauses[clauseId].clauseId).length > 0, "Clause does not exist");
        return contractClauses[clauseId].encryptedThreshold;
    }

    function getClauseDetails(string calldata clauseId) external view returns (
        string memory clauseDescription,
        uint256 publicParameter1,
        uint256 publicParameter2,
        address creator,
        uint256 creationTimestamp,
        bool isBreached,
        uint32 decryptedThreshold
    ) {
        require(bytes(contractClauses[clauseId].clauseId).length > 0, "Clause does not exist");
        ContractClause storage clause = contractClauses[clauseId];

        return (
            clause.clauseDescription,
            clause.publicParameter1,
            clause.publicParameter2,
            clause.creator,
            clause.creationTimestamp,
            clause.isBreached,
            clause.decryptedThreshold
        );
    }

    function getAllClauseIds() external view returns (string[] memory) {
        return clauseIds;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}

