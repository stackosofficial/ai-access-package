"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const databaseWriterExecution_1 = require("@decloudlabs/sky-cluster-operator/lib/utils/databaseWriterExecution");
const utils_1 = require("./utils");
class CostApplierService {
    constructor(databaseService, envConfig, signer, applyCosts, extractCostTime) {
        this.setup = async () => { };
        this.addShortTermTrackerInternal = async (nftCosts) => { };
        this.scanShortTermBalances = async () => {
            console.log("scanning short term balances");
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
            const newCostList = [];
            for (let i = 0; i < shortTermList.length; i++) {
                const nftCosts = shortTermList[i];
                const result = await this.applyCosts(nftCosts);
                if (result.success) {
                    newCostList.push(result.data);
                }
            }
            for (let i = 0; i < newCostList.length; i++) {
                const nftCosts = newCostList[i];
                const resp = await this.databaseService.setTrackerAndExtractBalance(nftCosts.accountNFT, nftCosts.costs);
                if (!resp.success) {
                    console.error("failed to add balance: ", resp.data);
                }
            }
        };
        this.update = async () => {
            await this.shortTermDatabaseWriter.execute();
        };
        this.databaseService = databaseService;
        this.envConfig = envConfig;
        this.serverCostCalculator = (0, utils_1.getServerCostCalculator)(envConfig.env.SERVER_COST_CONTRACT_ADDRESS, signer);
        this.shortTermDatabaseWriter = new databaseWriterExecution_1.DatabaseWriterExecution("CostApplierService", this.scanShortTermBalances, this.addShortTermTrackerInternal, extractCostTime);
        this.applyCosts = applyCosts;
    }
}
exports.default = CostApplierService;
