import { AccountNFT, APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { apiCallWrapper } from "@decloudlabs/skynet/lib/utils/utils";
import ENVConfig from "../../core/envConfig";
import { NFTCosts } from "../../types/types";
import { Pool, PoolClient, QueryResult } from 'pg';
import { DatabaseMigration } from "../../database/databaseMigration";
import { getBalanceTableSchemas } from "../../database/tableSchemas";

export default class ServerBalanceDatabaseService {
  private envConfig: ENVConfig;
  private pool: Pool | null = null;
  private costsTable: string;
  private historyTable: string;

  constructor(envConfig: ENVConfig) {
    this.envConfig = envConfig;
    this.costsTable = `nft_extract_costs_${this.envConfig.env.SUBNET_ID}`;
    this.historyTable = `nft_extract_costs_history_${this.envConfig.env.SUBNET_ID}`;
  }

  setup = async () => {
    await this.setupDatabase();
  };

  private getTableSchemas() {
    return getBalanceTableSchemas(this.envConfig.env.SUBNET_ID);
  }

  setExtractBalance = async (
    accountNFT: AccountNFT,
    price: string
  ): Promise<APICallReturn<number>> => {
    try {
      if (!this.pool) throw new Error("Database not initialized");

      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        // Create a new entry in the history table
        await client.query(
          `INSERT INTO ${this.historyTable} (collection_id, nft_id, costs, applied)
           VALUES ($1, $2, $3, $4)`,
          [accountNFT.collectionID, accountNFT.nftID, price, false]
        );

        // Update the current balance in the main table
        await client.query(
          `INSERT INTO ${this.costsTable} (collection_id, nft_id, costs)
           VALUES ($1, $2, $3)
           ON CONFLICT (collection_id, nft_id) 
           DO UPDATE SET costs = $3, updated_at = CURRENT_TIMESTAMP`,
          [accountNFT.collectionID, accountNFT.nftID, price]
        );

        await client.query('COMMIT');
        return { success: true, data: 1 };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("❌ Error in setExtractBalance:", error);
      return { success: false, data: error as Error };
    }
  };

  getExtractBalance = async (
    accountNFT: AccountNFT
  ): Promise<APICallReturn<NFTCosts | null>> => {
    try {
      if (!this.pool) throw new Error("Database not initialized");

      const { rows } = await this.pool.query(
        `SELECT * FROM ${this.costsTable}
         WHERE collection_id = $1 AND nft_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [accountNFT.collectionID, accountNFT.nftID]
      );

      if (rows.length === 0) return { success: true, data: null };

      const data = rows[0];
      return {
        success: true,
        data: {
          accountNFT: {
            collectionID: data.collection_id,
            nftID: data.nft_id,
          },
          costs: data.costs,
        },
      };
    } catch (error) {
      console.error("❌ Error in getExtractBalance:", error);
      return { success: false, data: error as Error };
    }
  };

  async *getNFTExtractCursor() {
    if (!this.pool) throw new Error("Database not initialized");

    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.costsTable}
       WHERE costs > '0'`
    );

    for (const item of rows) {
      yield {
        accountNFT: {
          collectionID: item.collection_id as string,
          nftID: item.nft_id as string,
        },
        costs: item.costs as string,
      } as NFTCosts;
    }
  }

  deleteNFTExtract = async (accountNFTs: AccountNFT[]) => {
    try {
      if (!this.pool) throw new Error("Database not initialized");

      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        for (const nft of accountNFTs) {
          await client.query(
            `DELETE FROM ${this.costsTable}
             WHERE collection_id = $1 AND nft_id = $2`,
            [nft.collectionID, nft.nftID]
          );
        }

        await client.query('COMMIT');
        return { success: true, data: accountNFTs.length };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      return { success: false, data: error as Error };
    }
  };

  setupDatabase = async () => {
    const { POSTGRES_URL } = this.envConfig.env;
    if (!POSTGRES_URL) {
      throw new Error("PostgreSQL URL not configured");
    }

    try {
      this.pool = new Pool({
        connectionString: POSTGRES_URL,
        ssl: {
          rejectUnauthorized: false // Required for some cloud providers
        }
      });

      // Test connection and run migrations
      const migration = new DatabaseMigration(this.pool);
      const tableSchemas = this.getTableSchemas();
      
      await migration.migrateTables(tableSchemas);
      
      // Validate table structures after migration
      for (const schema of tableSchemas) {
        const isValid = await migration.validateTableStructure(schema.tableName, schema.requiredColumns);
        if (!isValid) {
          throw new Error(`Table ${schema.tableName} structure validation failed`);
        }
      }
      
      console.log("✅ Connected to PostgreSQL and tables are ready");
    } catch (error: any) {
      console.error("❌ Error initializing PostgreSQL:", error);
      throw new Error(`Failed to initialize PostgreSQL: ${error.message}`);
    }
  };

  getUnappliedCosts = async (): Promise<APICallReturn<NFTCosts[]>> => {
    try {
      if (!this.pool) throw new Error("Database not initialized");

      const { rows } = await this.pool.query(
        `SELECT * FROM ${this.historyTable}
         WHERE applied = false
         ORDER BY created_at DESC`
      );

      const costs: NFTCosts[] = rows.map((item: { 
        collection_id: string; 
        nft_id: string; 
        costs: string; 
        id: number; 
        created_at: Date; 
      }) => ({
        accountNFT: {
          collectionID: item.collection_id,
          nftID: item.nft_id,
        },
        costs: item.costs,
        docId: item.id.toString(),
        timestamp: item.created_at,
      }));

      return { success: true, data: costs };
    } catch (error) {
      console.error("❌ Error in getUnappliedCosts:", error);
      return { success: false, data: error as Error };
    }
  };

  markCostsAsApplied = async (
    docIds: string[]
  ): Promise<APICallReturn<number>> => {
    try {
      if (!this.pool) throw new Error("Database not initialized");
      if (docIds.length === 0) return { success: true, data: 0 };

      const { rowCount } = await this.pool.query(
        `UPDATE ${this.historyTable}
         SET applied = true, updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1)`,
        [docIds]
      );

      return { success: true, data: rowCount || 0 };
    } catch (error) {
      console.error("❌ Error in markCostsAsApplied:", error);
      return { success: false, data: error as Error };
    }
  };
}
