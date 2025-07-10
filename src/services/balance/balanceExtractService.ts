import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import { AccountNFT, APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { NFTCosts } from "../../types/types";
import ENVConfig from "../../core/envConfig";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import { getServerCostCalculator } from "../../utils/utils";
import { getSkyNode } from "../../core/init";
import { DatabaseWriterExecution } from "../../database/databaseWriterExecution";

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

  private async processBatch(nftCostsBatch: NFTCosts[]): Promise<void> {
    const processedNFTs: NFTCosts[] = [];

    const nftTimestamps = await getNFTTimestamp(nftCostsBatch, this.envConfig);
    console.log("NFT timestamps:", nftTimestamps);

    try {
      const resp = await this.retryOperation(() =>
        addCostToContract(nftCostsBatch, this.envConfig)
      );

      if (!resp.success) {
        console.error(
          `Failed to add cost to contract for NFT: ${JSON.stringify(
            nftCostsBatch
          )}`
        );
        return;
      }

      for (const nftCosts of nftCostsBatch) {
        if (nftCosts.costs === "0") continue;

        // Update balance in contract
        const balanceResp = await this.retryOperation(() =>
          updateBalanceInContract(nftCosts.accountNFT, this.envConfig)
        );

        // If contract operations succeed, queue the NFT for database update
        processedNFTs.push(nftCosts);
      }

      // Update all successful NFTs in database
      if (processedNFTs.length > 0) {
        for (const nftCosts of processedNFTs) {
          await this.databaseService.setExtractBalance(
            nftCosts.accountNFT,
            "0" // Reset costs to 0 after processing
          );
        }
        console.log(`Successfully processed ${processedNFTs.length} NFTs`);
      }
    } catch (error) {
      console.error("Failed to process batch:", error);
      throw error;
    }
  }

  private scanNFTBalancesInternal = async () => {
    try {
      // Get all NFTs with non-zero costs using the cursor
      const nftCosts: NFTCosts[] = [];
      for await (const nftCost of this.databaseService.getNFTExtractCursor()) {
        nftCosts.push(nftCost);
      }

      // Process in batches
      for (let i = 0; i < nftCosts.length; i += BATCH_SIZE) {
        const batch = nftCosts.slice(i, i + BATCH_SIZE);
        try {
          await this.processBatch(batch);
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

  setup = async () => {
    await this.databaseService.setup();
  };

  update = async () => {
    await this.databaseWriter.execute();
  };
}

const getNFTTimestamp = async (nftCosts: NFTCosts[], envConfig: ENVConfig) => {
  const skyNode: SkyMainNodeJS = getSkyNode();

  const serverCostCalculator = getServerCostCalculator(
    envConfig.env.SERVER_COST_CONTRACT_ADDRESS,
    skyNode.contractService.signer
  );

  const response = await skyNode.contractService.callContractRead<
    BigInt[],
    number[]
  >(
    serverCostCalculator.getLastUpdateTime(
      nftCosts.map((nftCosts) => nftCosts.accountNFT)
    ),
    (res) => res.map((r) => Number(r))
  );

  console.log("Contract response:", response);
  return response;
};

const addCostToContract = async (
  NFTCosts: NFTCosts[],
  envConfig: ENVConfig
): Promise<APICallReturn<any>> => {
  const skyNode: SkyMainNodeJS = getSkyNode();

  const serverCostCalculator = getServerCostCalculator(
    envConfig.env.SERVER_COST_CONTRACT_ADDRESS,
    skyNode.contractService.signer
  );

  const contractInput = NFTCosts.map((nftCosts) => ({
    accountNFT: nftCosts.accountNFT,
    cost: nftCosts.costs,
  }));

  console.log("Adding costs to contract:", contractInput);
  const response = await skyNode.contractService.callContractWrite(
    serverCostCalculator.setNFTCosts(contractInput, true)
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

  return resp;
};
