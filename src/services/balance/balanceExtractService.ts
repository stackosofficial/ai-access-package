import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import ENVConfig from "../../core/envConfig";
import { Pool } from "pg";

export default class BalanceExtractService {
  private pool: Pool;
  private baseCostCache: Map<string, string> = new Map(); // Cache base costs by backend_id

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Initialize base cost for this backend
   * Creates a default base cost of 0.1 sUSD if not exists
   * @param backendId - Backend identifier from env
   */
  async initializeBaseCost(backendId: string): Promise<void> {
    try {
      // Default base cost: 0.1 sUSD = 0.1 * 10^18 wei = 100000000000000000 wei
      const DEFAULT_BASE_COST_WEI = '100000000000000000';

      const query = `
        INSERT INTO base_costs (backend_id, base_cost_wei, created_at, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (backend_id) 
        DO NOTHING
      `;

      await this.pool.query(query, [backendId, DEFAULT_BASE_COST_WEI]);
      console.log(`✅ Initialized base cost for backend ${backendId}: ${DEFAULT_BASE_COST_WEI} wei (0.1 sUSD)`);
    } catch (error) {
      console.error('❌ Error initializing base cost:', error);
    }
  }

  /**
   * Get base cost for a specific backend/service
   * @param backendId - Backend identifier from env (e.g., "GDOCS_SERVICE_SKYNET")
   * @returns Promise<string> - Base cost in wei
   */
  async getBaseCost(backendId: string): Promise<string> {
    try {
      // Check cache first
      if (this.baseCostCache.has(backendId)) {
        return this.baseCostCache.get(backendId)!;
      }

      // Query database
      const result = await this.pool.query(
        'SELECT base_cost_wei FROM base_costs WHERE backend_id = $1',
        [backendId]
      );

      let baseCost = '100000000000000000'; // Default to 0.1 sUSD if not found
      if (result.rows.length > 0) {
        baseCost = result.rows[0].base_cost_wei;
      }

      // Cache the result
      this.baseCostCache.set(backendId, baseCost);
      return baseCost;
    } catch (error) {
      console.error('❌ Error getting base cost:', error);
      // If error, return default 0.1 sUSD
      return '100000000000000000';
    }
  }

  /**
   * Set base cost for a specific backend/service
   * @param backendId - Backend identifier from env
   * @param baseCostWei - Base cost in wei
   * @returns Promise<APICallReturn<boolean>>
   */
  async setBaseCost(backendId: string, baseCostWei: string): Promise<APICallReturn<boolean>> {
    try {
      const query = `
        INSERT INTO base_costs (backend_id, base_cost_wei, created_at, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (backend_id) 
        DO UPDATE SET 
          base_cost_wei = $2,
          updated_at = CURRENT_TIMESTAMP
      `;

      await this.pool.query(query, [backendId, baseCostWei]);
      
      // Update cache
      this.baseCostCache.set(backendId, baseCostWei);
      
      console.log(`✅ Set base cost for backend ${backendId}: ${baseCostWei} wei`);
      return { success: true, data: true };
    } catch (error) {
      console.error('❌ Error setting base cost:', error);
      return {
        success: false,
        data: error as Error
      };
    }
  }



  /**
   * Add cost to database for settlement processing
   * @param walletAddress - User's wallet address (stored as wallet_address in database)
   * @param amount - Cost amount in wei (service cost only, base cost will be added automatically)
   * @param backendId - Backend identifier to fetch base cost
   */
  addCost = async (walletAddress: string, amount: string, backendId: string): Promise<APICallReturn<boolean>> => {
    try {
      // Ensure walletAddress is a string and convert to lowercase for consistency
      const walletAddressStr = String(walletAddress).toLowerCase();
      
      // Get base cost for this backend
      const baseCostWei = await this.getBaseCost(backendId);
      
      // Calculate total cost: service cost + base cost
      const serviceCost = BigInt(amount);
      const baseCost = BigInt(baseCostWei);
      const totalCost = serviceCost + baseCost;
      const totalCostStr = totalCost.toString();
      
      console.log(`🔍 addCost - wallet="${walletAddressStr}", backend="${backendId}", serviceCost="${amount}" wei, baseCost="${baseCostWei}" wei, totalCost="${totalCostStr}" wei`);
      
      // 1. Add to payment_logs for tracking/history
      const logQuery = `
        INSERT INTO payment_logs (wallet_address, backend_id, service_cost_wei, base_cost_wei, total_cost_wei, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `;
      await this.pool.query(logQuery, [walletAddressStr, backendId, amount, baseCostWei, totalCostStr]);
      
      // 2. Update accumulated cost in fractional_payments table (per wallet address only)
      const paymentsQuery = `
        INSERT INTO fractional_payments (wallet_address, amount, created_at, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (wallet_address) 
        DO UPDATE SET 
          amount = (CAST(fractional_payments.amount AS BIGINT) + CAST($2 AS BIGINT))::TEXT,
          updated_at = CURRENT_TIMESTAMP
      `;
      await this.pool.query(paymentsQuery, [walletAddressStr, totalCostStr]);
      
      console.log(`📝 Added total cost ${totalCostStr} wei (service: ${amount} + base: ${baseCostWei}) for wallet ${walletAddressStr} (backend: ${backendId})`);
      
      return { success: true, data: true };
    } catch (error) {
      console.error("❌ Error adding cost to database:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  };


  setup = async (backendId?: string): Promise<boolean> => {
    try {
      // Initialize base cost for this backend if backendId is provided
      if (backendId) {
        await this.initializeBaseCost(backendId);
      }
      
      console.log("✅ BalanceExtractService setup completed");
      return true;
    } catch (error) {
      console.error("❌ Error setting up BalanceExtractService:", error);
      return false;
    }
  };
}

