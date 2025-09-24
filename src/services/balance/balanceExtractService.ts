import { AccountNFT, APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { NFTCosts } from "../../types/types";
import ENVConfig from "../../core/envConfig";
import { getSkyNode } from "../../core/init";
import SkynetFractionalPaymentService from "../payment/skynetFractionalPaymentService";
import { Pool } from "pg";

const NFT_UPDATE_INTERVAL = 1 * 60 * 1000; // 1 minute
const BATCH_SIZE = 10; // Process 10 NFTs at a time
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

export default class BalanceExtractService {
  private nftCostsToWriteList: NFTCosts[];
  private envConfig: ENVConfig;
  private pool: Pool;
  private paymentService: SkynetFractionalPaymentService;

  constructor(envConfig: ENVConfig, pool: Pool) {
    this.nftCostsToWriteList = [];
    this.envConfig = envConfig;
    this.pool = pool;
    this.paymentService = new SkynetFractionalPaymentService(envConfig);
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
        console.error(`❌ Attempt ${i + 1} failed:`, error);
        if (i < retries - 1) {
          await this.delay(RETRY_DELAY * Math.pow(2, i)); // Exponential backoff
        }
      }
    }

    throw lastError || new Error("Operation failed after retries");
  }


  /**
   * Add cost to database for later batch processing
   * @param userAddress - User's wallet address
   * @param subnetId - Subnet identifier
   * @param amount - Cost amount in wei
   */
  addCost = async (userAddress: string, subnetId: string, amount: string): Promise<APICallReturn<boolean>> => {
    try {
      // Insert or update cost in fractional_payments table
      const query = `
        INSERT INTO fractional_payments (api_key, subnet_id, amount, created_at, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (api_key, subnet_id) 
        DO UPDATE SET 
          amount = (CAST(fractional_payments.amount AS BIGINT) + CAST($3 AS BIGINT))::TEXT,
          updated_at = CURRENT_TIMESTAMP
      `;

      await this.pool.query(query, [userAddress, subnetId, amount]);
      console.log(`📝 Added cost ${amount} wei for user ${userAddress} (subnet: ${subnetId})`);
      
      return { success: true, data: true };
    } catch (error) {
      console.error("❌ Error adding cost to database:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  };

  private async processBatch(pendingCostsBatch: any[]): Promise<void> {
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const pendingCost of pendingCostsBatch) {
      try {
        const { api_key: userAddress, amount, subnet_id } = pendingCost;

        // Check if user has sufficient balance before charging
        const balanceCheck = await this.paymentService.hasSufficientBalance(userAddress, amount);
        if (!balanceCheck.success) {
          results.failed++;
          results.errors.push(`Failed to check balance for ${userAddress}: ${balanceCheck.data}`);
          continue;
        }

        if (!balanceCheck.data) {
          results.failed++;
          results.errors.push(`Insufficient balance for ${userAddress}. Required: ${amount} wei`);
          continue;
        }

        // Charge the user for the service
        const chargeResponse = await this.retryOperation(() =>
          this.paymentService.chargeForServices(userAddress, amount)
        );

        if (chargeResponse.success) {
          // Reset the cost to 0 in database after successful charge
          await this.pool.query(
            `UPDATE fractional_payments SET amount = '0', updated_at = CURRENT_TIMESTAMP WHERE api_key = $1 AND subnet_id = $2`,
            [userAddress, subnet_id]
          );
          results.successful++;
          console.log(`✅ Successfully charged ${amount} wei from user ${userAddress} (subnet: ${subnet_id})`);
        } else {
          results.failed++;
          results.errors.push(`Failed to charge ${userAddress}: ${chargeResponse.data}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Error processing ${pendingCost.api_key}: ${error}`);
      }
    }

    console.log(`📊 Batch processing completed: ${results.successful} successful, ${results.failed} failed`);
    if (results.errors.length > 0) {
      console.error("❌ Processing errors:", results.errors);
    }
  }

  private scanNFTBalancesInternal = async () => {
    try {
      // Get all pending costs from fractional_payments table
      const pendingCostsQuery = `
        SELECT api_key, subnet_id, amount, created_at
        FROM fractional_payments 
        WHERE CAST(amount AS BIGINT) > 0
        ORDER BY created_at ASC
      `;
      
      const pendingCostsResult = await this.pool.query(pendingCostsQuery);
      const pendingCosts = pendingCostsResult.rows;

      if (pendingCosts.length === 0) {
        console.log("ℹ️ No pending costs to process");
        return;
      }

      console.log(`🔄 Processing ${pendingCosts.length} pending cost records...`);

      // Process in batches
      for (let i = 0; i < pendingCosts.length; i += BATCH_SIZE) {
        const batch = pendingCosts.slice(i, i + BATCH_SIZE);
        try {
          await this.processBatch(batch);
        } catch (error) {
          console.error(
            `❌ Failed to process batch starting at index ${i}:`,
            error
          );
          // Continue with next batch even if this one failed
        }
      }
    } catch (error) {
      console.error("❌ Error in scanNFTBalancesInternal:", error);
    }
  };

  setup = async (): Promise<boolean> => {
    try {
      console.log("✅ BalanceExtractService setup completed");
      return true;
    } catch (error) {
      console.error("❌ Error setting up BalanceExtractService:", error);
      return false;
    }
  };

  update = async (): Promise<void> => {
    try {
      await this.scanNFTBalancesInternal();
    } catch (error) {
      console.error("❌ Error in BalanceExtractService update:", error);
    }
  };
}

