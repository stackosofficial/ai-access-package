import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import { AccountNFT, APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { ethers } from "ethers";
import { NFTCosts } from "./types/types";
import ENVConfig from "./envConfig";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import { getServerCostCalculator } from "./utils";
import { getSkyNode } from "./init";
import * as admin from "firebase-admin";
import { DatabaseWriterExecution } from "./databaseWriterExecution";

const NFT_UPDATE_INTERVAL = 1 * 60 * 1000; // 1 minute
const BATCH_SIZE = 10; // Process 10 NFTs at a time
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

export default class BalanceExtractService {
  private databaseWriter: DatabaseWriterExecution<NFTCosts[]>;
  private nftCostsToWriteList: NFTCosts[];
  private envConfig: ENVConfig;
  private databaseService: ServerBalanceDatabaseService;

  constructor(
    envConfig: ENVConfig,
    databaseService: ServerBalanceDatabaseService
  ) {
    this.nftCostsToWriteList = [];
    this.databaseWriter = new DatabaseWriterExecution<NFTCosts[]>(
      "nftCostsWriter",
      this.scanNFTBalancesInternal,
      this.addNFTCostsToWrite,
      NFT_UPDATE_INTERVAL
    );
    this.envConfig = envConfig;
    this.databaseService = databaseService;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retries = MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.error(`Attempt ${i + 1} failed:`, error);
        if (i < retries - 1) {
          await this.delay(RETRY_DELAY * Math.pow(2, i)); // Exponential backoff
        }
      }
    }

    throw lastError || new Error("Operation failed after retries");
  }

  private addNFTCostsToWriteInternal = (nftCosts: NFTCosts[]) => {
    this.nftCostsToWriteList = [...this.nftCostsToWriteList, ...nftCosts];
  };

  private addNFTCostsToWrite = async (nftCosts: NFTCosts[]) => {
    // await this.databaseWriter.insert(nftCosts);
  };

  private async processBatch(
    nftCostsBatch: NFTCosts[],
    db: any
  ): Promise<void> {
    const batch = db.batch();
    const processedNFTs: NFTCosts[] = [];

    try {
      for (const nftCosts of nftCostsBatch) {
        if (nftCosts.costs === "0") continue;

        // First attempt to add cost to contract
        const resp = await this.retryOperation(() =>
          addCostToContract(nftCosts.accountNFT, nftCosts.costs, this.envConfig)
        );

        if (!resp.success) {
          console.error(
            `Failed to add cost to contract for NFT: ${JSON.stringify(
              nftCosts.accountNFT
            )}`
          );
          continue;
        }

        // Update balance in contract
        const balanceResp = await this.retryOperation(() =>
          updateBalanceInContract(nftCosts.accountNFT, this.envConfig)
        );

        if (!balanceResp.success) {
          console.error(
            `Failed to update balance in contract for NFT: ${JSON.stringify(
              nftCosts.accountNFT
            )}`
          );
          continue;
        }

        // If both contract operations succeed, queue the NFT for database update
        processedNFTs.push(nftCosts);
      }

      // Update all successful NFTs in one batch
      if (processedNFTs.length > 0) {
        for (const nftCosts of processedNFTs) {
          const docRef = db
            .collection("nft_extract_costs_" + this.envConfig.env.SUBNET_ID)
            .doc(
              `${nftCosts.accountNFT.collectionID}_${nftCosts.accountNFT.nftID}`
            );
          batch.set(
            docRef,
            {
              collection_id: nftCosts.accountNFT.collectionID,
              nft_id: nftCosts.accountNFT.nftID,
              costs: "0",
              updated_at: admin.firestore.FieldValue.serverTimestamp(),
              created_at: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
        await batch.commit();
        console.log(`Successfully processed ${processedNFTs.length} NFTs`);
      }
    } catch (error) {
      console.error("Failed to process batch:", error);
      throw error;
    }
  }

  private scanNFTBalancesInternal = async () => {
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
        } catch (error) {
          console.error(
            `Failed to process batch starting at index ${i}:`,
            error
          );
          // Continue with next batch even if this one failed
        }
      }
    } catch (error) {
      console.error("Error in scanNFTBalancesInternal:", error);
    }
  };

  setup = async () => {};

  update = async () => {
    await this.databaseWriter.execute();
  };
}

const addCostToContract = async (
  accountNFT: AccountNFT,
  price: string,
  envConfig: ENVConfig
): Promise<APICallReturn<any>> => {
  const skyNode: SkyMainNodeJS = getSkyNode();
  const subnetID = envConfig.env.SUBNET_ID || "";

  const contAddrResp = await skyNode.contractService.callContractRead<
    string,
    string
  >(
    skyNode.contractService.BalanceSettler.getSubnetPriceCalculator(subnetID),
    (res) => res
  );

  if (!contAddrResp.success) return contAddrResp;
  const contractAddress = contAddrResp.data;

  const provider = new ethers.JsonRpcProvider(envConfig.env.JSON_RPC_PROVIDER);
  const wallet = new ethers.Wallet(
    envConfig.env.WALLET_PRIVATE_KEY || "",
    provider
  );

  const serverCostCalculator = getServerCostCalculator(
    envConfig.env.SERVER_COST_CONTRACT_ADDRESS,
    wallet
  );

  console.log("Adding costs to contract:", accountNFT, price);
  const response = await skyNode.contractService.callContractWrite(
    serverCostCalculator.addNFTCosts(accountNFT, price)
  );

  console.log("Contract response:", response);
  return response;
};

const updateBalanceInContract = async (
  accountNFT: AccountNFT,
  envConfig: ENVConfig
): Promise<APICallReturn<any>> => {
  const skyNode = getSkyNode();
  const subnetID = envConfig.env.SUBNET_ID || "";

  const resp = await skyNode.contractService.callContractWrite(
    skyNode.contractService.BalanceSettler.payNormal(
      skyNode.contractService.selectedAccount,
      accountNFT,
      subnetID
    )
  );

  console.log("Balance update response:", resp);
  return resp;
};
