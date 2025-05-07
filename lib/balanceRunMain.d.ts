import { ENVDefinition } from "./types/types";
import { AccountNFT, APICallReturn, UrsulaAuth } from "@decloudlabs/skynet/lib/types/types";
import BalanceExtractService from "./balanceExtractService";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import ENVConfig from "./envConfig";
import { ethers } from "ethers";
export default class BalanceRunMain {
    RUN_DURATION: number;
    nextRunTime: number;
    envConfig: ENVConfig;
    balanceExtractService: BalanceExtractService;
    serverBalanceDatabaseService: ServerBalanceDatabaseService;
    signer: ethers.Wallet;
    jsonProvider: ethers.JsonRpcProvider;
    constructor(env: ENVDefinition, extractCostTime: number);
    setup: () => Promise<boolean>;
    update: () => Promise<never>;
    addCost: (accountNFT: AccountNFT, cost: string) => Promise<APICallReturn<boolean>>;
    callAIModel(prompt: string, userAuthPayload: UrsulaAuth, accountNFT: AccountNFT): Promise<any>;
}
