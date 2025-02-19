"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const utils_1 = require("./utils");
const init_1 = require("./init");
const admin = __importStar(require("firebase-admin"));
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
            const db = await this.databaseService.getClient();
            try {
                // Get all NFTs with non-zero costs in one query
                const snapshot = await db
                    .collection("nft_extract_costs_" + this.envConfig.env.SUBNET_ID)
                    .where("costs", ">", "0")
                    .get();
                const nftCosts = snapshot.docs.map((doc) => ({
                    accountNFT: {
                        collectionID: doc.data().collection_id,
                        nftID: doc.data().nft_id,
                    },
                    costs: doc.data().costs,
                }));
                // Process in batches
                for (let i = 0; i < nftCosts.length; i += BATCH_SIZE) {
                    const batch = nftCosts.slice(i, i + BATCH_SIZE);
                    try {
                        await this.processBatch(batch, db);
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
        this.setup = async () => { };
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
    async processBatch(nftCostsBatch, db) {
        const batch = db.batch();
        const processedNFTs = [];
        try {
            for (const nftCosts of nftCostsBatch) {
                if (nftCosts.costs === "0")
                    continue;
                // First attempt to add cost to contract
                const resp = await this.retryOperation(() => addCostToContract(nftCosts.accountNFT, nftCosts.costs, this.envConfig));
                if (!resp.success) {
                    console.error(`Failed to add cost to contract for NFT: ${JSON.stringify(nftCosts.accountNFT)}`);
                    continue;
                }
                // Update balance in contract
                const balanceResp = await this.retryOperation(() => updateBalanceInContract(nftCosts.accountNFT, this.envConfig));
                if (!balanceResp.success) {
                    console.error(`Failed to update balance in contract for NFT: ${JSON.stringify(nftCosts.accountNFT)}`);
                    continue;
                }
                // If both contract operations succeed, queue the NFT for database update
                processedNFTs.push(nftCosts);
            }
            // Update all successful NFTs in one batch
            if (processedNFTs.length > 0) {
                for (const nftCosts of processedNFTs) {
                    const docRef = db
                        .collection("nft_extract_costs")
                        .doc(`${nftCosts.accountNFT.collectionID}_${nftCosts.accountNFT.nftID}`);
                    batch.update(docRef, {
                        costs: "0",
                        updated_at: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
                await batch.commit();
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
const addCostToContract = async (accountNFT, price, envConfig) => {
    const skyNode = (0, init_1.getSkyNode)();
    const subnetID = envConfig.env.SUBNET_ID || "";
    const contAddrResp = await skyNode.contractService.callContractRead(skyNode.contractService.BalanceSettler.getSubnetPriceCalculator(subnetID), (res) => res);
    if (!contAddrResp.success)
        return contAddrResp;
    const contractAddress = contAddrResp.data;
    const provider = new ethers_1.ethers.JsonRpcProvider(envConfig.env.JSON_RPC_PROVIDER);
    const wallet = new ethers_1.ethers.Wallet(envConfig.env.WALLET_PRIVATE_KEY || "", provider);
    const serverCostCalculator = (0, utils_1.getServerCostCalculator)(envConfig.env.SERVER_COST_CONTRACT_ADDRESS, wallet);
    console.log("Adding costs to contract:", accountNFT, price);
    const response = await skyNode.contractService.callContractWrite(serverCostCalculator.addNFTCosts(accountNFT, price));
    console.log("Contract response:", response);
    return response;
};
const updateBalanceInContract = async (accountNFT, envConfig) => {
    const skyNode = (0, init_1.getSkyNode)();
    const subnetID = envConfig.env.SUBNET_ID || "";
    const resp = await skyNode.contractService.callContractWrite(skyNode.contractService.BalanceSettler.payNormal(skyNode.contractService.selectedAccount, accountNFT, subnetID));
    console.log("Balance update response:", resp);
    return resp;
};
