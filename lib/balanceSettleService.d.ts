import { ethers } from "ethers";
import { DatabaseWriterExecution } from "@decloudlabs/sky-cluster-operator/lib/utils/databaseWriterExecution";
import { ENVConfig } from "@decloudlabs/sky-cluster-operator/lib/config/envConfig";
import { Web3Service } from "@decloudlabs/sky-cluster-operator/lib/config/ethersConfig";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import { NFTCosts } from "./types/types";
import { APICallReturn } from "@decloudlabs/sky-cluster-operator/lib/types/types";
export default class BalanceSettleService {
    databaseService: ServerBalanceDatabaseService;
    shortTermDatabaseWriter: DatabaseWriterExecution<NFTCosts>;
    envConfig: ENVConfig;
    serverCostCalculator: ethers.Contract;
    checkBalanceCondition: (nftCosts: NFTCosts) => Promise<APICallReturn<boolean>>;
    constructor(databaseService: ServerBalanceDatabaseService, envConfig: ENVConfig, web3Service: Web3Service, checkBalanceCondition: (nftCosts: NFTCosts) => Promise<APICallReturn<boolean>>);
    setup: () => Promise<void>;
    addShortTermTrackerInternal: (nftCosts: NFTCosts) => Promise<void>;
    scanShortTermBalances: () => Promise<void>;
    update: () => Promise<void>;
}
