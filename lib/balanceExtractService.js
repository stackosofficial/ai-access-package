"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const init_1 = require("./init");
const databaseWriterExecution_1 = require("./databaseWriterExecution");
const NFT_UPDATE_INTERVAL = 1 * 60 * 1000; // 1 minute
const BATCH_SIZE = 10; // Process 10 NFTs at a time
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
class BalanceExtractService {
    constructor(envConfig, databaseService) {
        this.addNFTCostsToWriteInternal = (nftCosts) => {
            this.nftCostsToWriteList = [...this.nftCostsToWriteList, ...nftCosts];
        };
        this.addNFTCostsToWrite = async (nftCosts) => {
            // await this.databaseWriter.insert(nftCosts);
        };
        this.scanNFTBalancesInternal = async () => {
            try {
                // Get all NFTs with non-zero costs using the cursor
                const nftCosts = [];
                for await (const nftCost of this.databaseService.getNFTExtractCursor()) {
                    nftCosts.push(nftCost);
                }
                // Process in batches
                for (let i = 0; i < nftCosts.length; i += BATCH_SIZE) {
                    const batch = nftCosts.slice(i, i + BATCH_SIZE);
                    try {
                        await this.processBatch(batch);
                    }
                    catch (error) {
                        console.error(`Failed to process batch starting at index ${i}:`, error);
                        // Continue with next batch even if this one failed
                    }
                }
            }
            catch (error) {
                console.error("Error in scanNFTBalancesInternal:", error);
            }
        };
        this.setup = async () => {
            await this.databaseService.setup();
        };
        this.update = async () => {
            await this.databaseWriter.execute();
        };
        this.nftCostsToWriteList = [];
        this.databaseWriter = new databaseWriterExecution_1.DatabaseWriterExecution("nftCostsWriter", this.scanNFTBalancesInternal, this.addNFTCostsToWrite, NFT_UPDATE_INTERVAL);
        this.envConfig = envConfig;
        this.databaseService = databaseService;
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async retryOperation(operation, retries = MAX_RETRIES) {
        let lastError;
        for (let i = 0; i < retries; i++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                console.error(`Attempt ${i + 1} failed:`, error);
                if (i < retries - 1) {
                    await this.delay(RETRY_DELAY * Math.pow(2, i)); // Exponential backoff
                }
            }
        }
        throw lastError || new Error("Operation failed after retries");
    }
    async processBatch(nftCostsBatch) {
        const processedNFTs = [];
        const nftTimestamps = await getNFTTimestamp(nftCostsBatch, this.envConfig);
        console.log("NFT timestamps:", nftTimestamps);
        try {
            const resp = await this.retryOperation(() => addCostToContract(nftCostsBatch, this.envConfig));
            if (!resp.success) {
                console.error(`Failed to add cost to contract for NFT: ${JSON.stringify(nftCostsBatch)}`);
                return;
            }
            for (const nftCosts of nftCostsBatch) {
                if (nftCosts.costs === "0")
                    continue;
                // Update balance in contract
                const balanceResp = await this.retryOperation(() => updateBalanceInContract(nftCosts.accountNFT, this.envConfig));
                // If contract operations succeed, queue the NFT for database update
                processedNFTs.push(nftCosts);
            }
            // Update all successful NFTs in database
            if (processedNFTs.length > 0) {
                for (const nftCosts of processedNFTs) {
                    await this.databaseService.setExtractBalance(nftCosts.accountNFT, "0" // Reset costs to 0 after processing
                    );
                }
                console.log(`Successfully processed ${processedNFTs.length} NFTs`);
            }
        }
        catch (error) {
            console.error("Failed to process batch:", error);
            throw error;
        }
    }
}
exports.default = BalanceExtractService;
const getNFTTimestamp = async (nftCosts, envConfig) => {
    const skyNode = (0, init_1.getSkyNode)();
    const serverCostCalculator = (0, utils_1.getServerCostCalculator)(envConfig.env.SERVER_COST_CONTRACT_ADDRESS, skyNode.contractService.signer);
    const response = await skyNode.contractService.callContractRead(serverCostCalculator.getLastUpdateTime(nftCosts.map((nftCosts) => nftCosts.accountNFT)), (res) => res.map((r) => Number(r)));
    console.log("Contract response:", response);
    return response;
};
const addCostToContract = async (NFTCosts, envConfig) => {
    const skyNode = (0, init_1.getSkyNode)();
    const serverCostCalculator = (0, utils_1.getServerCostCalculator)(envConfig.env.SERVER_COST_CONTRACT_ADDRESS, skyNode.contractService.signer);
    const contractInput = NFTCosts.map((nftCosts) => ({
        accountNFT: nftCosts.accountNFT,
        cost: nftCosts.costs,
    }));
    console.log("Adding costs to contract:", contractInput);
    const response = await skyNode.contractService.callContractWrite(serverCostCalculator.setNFTCosts(contractInput, true));
    console.log("Contract response:", response);
    return response;
};
const updateBalanceInContract = async (accountNFT, envConfig) => {
    const skyNode = (0, init_1.getSkyNode)();
    const subnetID = envConfig.env.SUBNET_ID || "";
    const resp = await skyNode.contractService.callContractWrite(skyNode.contractService.BalanceSettler.payNormal(skyNode.contractService.selectedAccount, accountNFT, subnetID));
    return resp;
};
