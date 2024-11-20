import { ENVDefinition } from "./types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import balanceExtractService from "./balanceExtractService";
import BalanceSettleService from "./balanceSettleService";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import { NFTCosts } from "./types/types";
import ENVConfig from "./envConfig";
import CostApplierService from "./CostApplierService";
import { ethers } from "ethers";
export default class BalanceRunMain {
    RUN_DURATION: number;
    nextRunTime: number;
    envConfig: ENVConfig;
    balanceSettleService: BalanceSettleService;
    balanceExtractService: balanceExtractService;
    serverBalanceDatabaseService: ServerBalanceDatabaseService;
    costApplierService: CostApplierService;
    signer: ethers.Wallet;
    jsonProvider: ethers.providers.JsonRpcProvider;
    constructor(env: ENVDefinition, checkBalanceCondition: (nftCosts: NFTCosts) => Promise<APICallReturn<boolean>>, applyCosts: (nftCosts: NFTCosts) => Promise<APICallReturn<NFTCosts>>, extractCostTime: number);
    setup: () => Promise<boolean>;
    update: () => Promise<never>;
}
