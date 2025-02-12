import { ethers } from "ethers";
import { DatabaseWriterExecution } from "@decloudlabs/sky-cluster-operator/lib/utils/databaseWriterExecution";
import ENVConfig from "./envConfig";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import { NFTCosts } from "./types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { ServerCostCalculator } from "@decloudlabs/skynet/lib/types/contracts";
export default class CostApplierService {
    databaseService: ServerBalanceDatabaseService;
    shortTermDatabaseWriter: DatabaseWriterExecution<NFTCosts>;
    envConfig: ENVConfig;
    serverCostCalculator: ServerCostCalculator;
    applyCosts: (nftCosts: NFTCosts) => Promise<APICallReturn<NFTCosts>>;
    constructor(databaseService: ServerBalanceDatabaseService, envConfig: ENVConfig, signer: ethers.Wallet, applyCosts: (nftCosts: NFTCosts) => Promise<APICallReturn<NFTCosts>>, extractCostTime: number);
    setup: () => Promise<void>;
    addShortTermTrackerInternal: (nftCosts: NFTCosts) => Promise<void>;
    scanShortTermBalances: () => Promise<void>;
    update: () => Promise<void>;
}
