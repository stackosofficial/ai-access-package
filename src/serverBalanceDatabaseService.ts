import { AccountNFT, APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { apiCallWrapper } from "@decloudlabs/skynet/lib/utils/utils";
import ENVConfig from "./envConfig";
import { NFTCosts } from "./types/types";
import { Pool, PoolClient, QueryResult } from 'pg';

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

  private getNFTId(accountNFT: AccountNFT): string {
    return `${accountNFT.collectionID}_${accountNFT.nftID}`;
  }

  private async createTables(client: PoolClient) {
    // Create costs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${this.costsTable} (
        id SERIAL PRIMARY KEY,
        collection_id TEXT NOT NULL,
        nft_id TEXT NOT NULL,
        costs TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(collection_id, nft_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_${this.costsTable}_collection_nft 
      ON ${this.costsTable}(collection_id, nft_id);
      
      CREATE INDEX IF NOT EXISTS idx_${this.costsTable}_costs 
      ON ${this.costsTable}(costs);
    `);

    // Create history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${this.historyTable} (
        id SERIAL PRIMARY KEY,
        collection_id TEXT NOT NULL,
        nft_id TEXT NOT NULL,
        costs TEXT NOT NULL,
        applied BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_${this.historyTable}_applied 
      ON ${this.historyTable}(applied);
      
      CREATE INDEX IF NOT EXISTS idx_${this.historyTable}_created_at 
      ON ${this.historyTable}(created_at DESC);
    `);
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
      console.error("Error in setExtractBalance:", error);
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
      console.error("Error in getExtractBalance:", error);
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

      // Test connection and create tables
      const client = await this.pool.connect();
      try {
        await this.createTables(client);
        console.log("Connected to PostgreSQL and tables are ready");
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error("Error initializing PostgreSQL:", error);
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
      console.error("Error in getUnappliedCosts:", error);
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
      console.error("Error in markCostsAsApplied:", error);
      return { success: false, data: error as Error };
    }
  };
}
