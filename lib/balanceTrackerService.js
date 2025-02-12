"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const SkyMainNodeJS_1 = __importDefault(require("@decloudlabs/skynet/lib/services/SkyMainNodeJS"));
const databaseWriterExecution_1 = require("@decloudlabs/sky-cluster-operator/lib/utils/databaseWriterExecution");
const utils_1 = require("./utils");
let initializedAppCrypto;
const initializeSkyNodeCrypto = async (envConfig) => {
    if (!initializedAppCrypto) {
        console.log("inside initializeSkyNodeCrypto, checking env: ", envConfig.env.JSON_RPC_PROVIDER, envConfig.env.WALLET_PRIVATE_KEY, envConfig.env.STORAGE_API);
        const skymainEnvConfig = {
            JRPC_PROVIDER: envConfig.env.JSON_RPC_PROVIDER,
            WALLET_PRIVATE_KEY: envConfig.env.WALLET_PRIVATE_KEY,
            STORAGE_API: envConfig.env.STORAGE_API,
        };
        initializedAppCrypto = new SkyMainNodeJS_1.default(skymainEnvConfig);
        await initializedAppCrypto.init(true);
    }
    return initializedAppCrypto;
};
const getSkyNode = async (envConfig) => {
    return await initializeSkyNodeCrypto(envConfig);
};
class BalanceSettleService {
    constructor(envConfig, databaseService, signer, checkBalanceCondition) {
        this.setup = async () => { };
        this.addShortTermTrackerInternal = async (nftCosts) => { };
        this.scanShortTermBalances = async () => {
            console.log("scanning short term balances");
            const skyNode = await getSkyNode(this.envConfig);
            const SUBNET_ID = this.envConfig.env.SUBNET_ID;
            const serverCostContract = (0, utils_1.getServerCostCalculator)(this.envConfig.env.SERVER_COST_CONTRACT_ADDRESS, skyNode.contractService.signer);
            const batchVal = 1000;
            const cursor = this.databaseService.getNFTExtractCursor(batchVal);
            // console.log("checking cursor: ", cursor.hasNext());
            const shortTermList = [];
            while (await cursor.hasNext()) {
                const nftCosts = await cursor.next();
                if (nftCosts) {
                    shortTermList.push(nftCosts);
                }
            }
            await cursor.close();
            console.log("short term list: ", shortTermList);
            const deleteList = [];
            for (let i = 0; i < shortTermList.length; i++) {
                const nftCosts = shortTermList[i];
                const balanceResp = await skyNode.contractService.callContractRead(skyNode.contractService.BalanceStore.getAccountBalance(nftCosts.accountNFT, SUBNET_ID), (res) => res);
                if (balanceResp.success == false) {
                    console.log("error getting balance: ", balanceResp.data);
                    continue;
                }
                const balance = BigInt(balanceResp.data);
                const costResp = await skyNode.contractService.callContractRead(serverCostContract.getNFTCost(nftCosts.accountNFT), (res) => res.toString());
                if (costResp.success == false) {
                    console.log("error getting cost: ", costResp.data);
                    continue;
                }
                let finalBalance = balance - BigInt(costResp.data);
                finalBalance = finalBalance - BigInt(nftCosts.costs);
                console.log("final balance: ", finalBalance.toString());
                console.log("checking costs", costResp.data.toString(), nftCosts.costs.toString(), balance.toString());
                if (finalBalance >= 0n) {
                    deleteList.push(nftCosts.accountNFT);
                }
            }
            await this.databaseService.deleteNFTExtract(deleteList);
        };
        this.update = async () => {
            await this.shortTermDatabaseWriter.execute();
        };
        this.databaseService = databaseService;
        this.serverCostCalculator = (0, utils_1.getServerCostCalculator)(envConfig.env.SERVER_COST_CONTRACT_ADDRESS, signer);
        this.shortTermDatabaseWriter = new databaseWriterExecution_1.DatabaseWriterExecution("BalanceSettleService", this.scanShortTermBalances, this.addShortTermTrackerInternal, 1 * 60 * 1000);
        this.checkBalanceCondition = checkBalanceCondition;
        this.envConfig = envConfig;
    }
}
exports.default = BalanceSettleService;
