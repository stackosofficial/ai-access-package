import { AIModelResponse, ENVDefinition } from "./types/types";
import { AccountNFT, APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import BalanceExtractService from "./balanceExtractService";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import ENVConfig from "./envConfig";
import { ethers } from "ethers";
import { OpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
export default class BalanceRunMain {
    RUN_DURATION: number;
    nextRunTime: number;
    envConfig: ENVConfig;
    balanceExtractService: BalanceExtractService;
    serverBalanceDatabaseService: ServerBalanceDatabaseService;
    signer: ethers.Wallet;
    jsonProvider: ethers.JsonRpcProvider;
    openAI: OpenAI;
    constructor(env: ENVDefinition, extractCostTime: number);
    setup: () => Promise<boolean>;
    update: () => Promise<never>;
    addCost: (accountNFT: AccountNFT, cost: string) => Promise<APICallReturn<boolean>>;
    callAIModel(messages: ChatCompletionMessageParam[]): Promise<AIModelResponse>;
}
