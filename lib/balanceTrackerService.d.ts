import { ethers } from "ethers";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import { NFTCosts } from "./types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import ENVConfig from "./envConfig";
import { DatabaseWriterExecution } from "@decloudlabs/sky-cluster-operator/lib/utils/databaseWriterExecution";
import { ServerCostCalculator } from "@decloudlabs/skynet/lib/types/contracts";
export default class BalanceSettleService {
    databaseService: ServerBalanceDatabaseService;
    shortTermDatabaseWriter: DatabaseWriterExecution<NFTCosts>;
    envConfig: ENVConfig;
    serverCostCalculator: ServerCostCalculator;
    checkBalanceCondition: (nftCosts: NFTCosts) => Promise<APICallReturn<boolean>>;
    constructor(envConfig: ENVConfig, databaseService: ServerBalanceDatabaseService, signer: ethers.Wallet, checkBalanceCondition: (nftCosts: NFTCosts) => Promise<APICallReturn<boolean>>);
    setup: () => Promise<void>;
    addShortTermTrackerInternal: (nftCosts: NFTCosts) => Promise<void>;
    scanShortTermBalances: () => Promise<void>;
    update: () => Promise<void>;
}
