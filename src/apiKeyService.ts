import { Pool } from 'pg';
import { ApiKeyConfig, ApiKeyResponse, AuthTokenInfo, ApiKeyData } from './types/types';

import jwt from 'jsonwebtoken';
import { ServiceDetails } from './serviceManagement';
import { getSkyNode } from './init';
import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
import SkyUrsulaService from '@decloudlabs/skynet/lib/services/SkyUrsulaService';

const authenticatedWallets: Record<string, AuthTokenInfo> = {};

export class ApiKeyService {
  private pool: Pool | null = null;
  private config: ApiKeyConfig;
  private postgresUrl: string;

  constructor(config: ApiKeyConfig, postgresUrl: string) {
    this.config = config;
    this.postgresUrl = postgresUrl;
  }

  async setupDatabase(): Promise<void> {
    if (!this.config.enabled) return;

    // Use the provided POSTGRES_URL instead of environment lookup
    if (!this.postgresUrl) {
      throw new Error("PostgreSQL URL not configured");
    }

    try {
      this.pool = new Pool({
        connectionString: this.postgresUrl,
        ssl: {
          rejectUnauthorized: false // Required for some cloud providers
        }
      });

      // Test connection and create tables
      const client = await this.pool.connect();
      try {
        await this.createTables(client);
        console.log("Connected to PostgreSQL and API key tables are ready");
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error("Error initializing PostgreSQL for API keys:", error);
      throw new Error(`Failed to initialize PostgreSQL for API keys: ${error.message}`);
    }
  }

  private async createTables(client: any): Promise<void> {
    // Create API keys table
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key TEXT NOT NULL UNIQUE,
        wallet_address TEXT NOT NULL,
        nft_collection_id TEXT NOT NULL,
        nft_id TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revoked_at TIMESTAMPTZ,
        last_used_at TIMESTAMPTZ
      );
      
      CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
      CREATE INDEX IF NOT EXISTS idx_api_keys_wallet ON api_keys(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_api_keys_nft ON api_keys(wallet_address, nft_collection_id, nft_id);
    `);

    // Create usage logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_usage_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER,
        service_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_api_usage_logs_api_key ON api_usage_logs(api_key_id);
      CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_api_usage_logs_service_id ON api_usage_logs(service_id);
    `);

    // Create function to update last_used_at
    await client.query(`
      CREATE OR REPLACE FUNCTION update_api_key_last_used()
      RETURNS TRIGGER AS $$
      BEGIN
          UPDATE api_keys
          SET last_used_at = CURRENT_TIMESTAMP
          WHERE id = NEW.api_key_id;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS update_api_key_last_used_trigger ON api_usage_logs;
      CREATE TRIGGER update_api_key_last_used_trigger
      AFTER INSERT ON api_usage_logs
      FOR EACH ROW
      EXECUTE FUNCTION update_api_key_last_used();
    `);
  }

  async setupTables(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      // Check if tables already exist before trying to create them
      const tablesExist = await this.checkTablesExist();
      
      if (tablesExist) {
        console.log('API key tables already exist - skipping creation');
        return;
      }
      
      console.log('API key tables do not exist - creating them...');
      // Call setupDatabase which will create the pool and tables
      await this.setupDatabase();
      console.log('API key tables created successfully');
    } catch (error: any) {
      console.error('Error setting up tables:', error);
      throw new Error(`Failed to set up tables: ${error.message}`);
    }
  }

  private async checkTablesExist(): Promise<boolean> {
    try {
      if (!this.pool) {
        // If no pool exists, tables don't exist
        return false;
      }

      // Try to query both tables to see if they exist
      const [apiKeysCheck, usageLogsCheck] = await Promise.allSettled([
        this.pool.query('SELECT 1 FROM api_keys LIMIT 1'),
        this.pool.query('SELECT 1 FROM api_usage_logs LIMIT 1')
      ]);

      const apiKeysExist = apiKeysCheck.status === 'fulfilled';
      const usageLogsExist = usageLogsCheck.status === 'fulfilled';

      // Both tables need to exist
      return apiKeysExist && usageLogsExist;
    } catch (error) {
      console.log('Error checking table existence:', error);
      return false;
    }
  }

  async getApiKeyDetails(apiKey: string): Promise<ApiKeyData | null> {
    try {
      if (!this.pool) throw new Error("Database not initialized");

      // Log the API key being checked
      console.log('Fetching details for API key:', apiKey);

      const { rows } = await this.pool.query('SELECT * FROM api_keys WHERE key = $1 AND is_active = true LIMIT 1', [apiKey]);

      if (rows.length === 0) {
        console.error('No data found for API key');
        return null;
      }

      // Log the retrieved data
      console.log('Retrieved API key details:', {
        wallet_address: rows[0].wallet_address,
        nft_collection_id: rows[0].nft_collection_id,
        nft_id: rows[0].nft_id
      });

      return rows[0] as ApiKeyData;
    } catch (error) {
      console.error('Error getting API key details:', error);
      return null;
    }
  }

  async authenticateUser(address: string, signature: string, message: string): Promise<{ token: string }> {
    if (!this.config.enabled) {
      throw new Error('API key functionality is not enabled');
    }

    try {
      // Ensure we have all required parameters
      if (!address || !signature || !message) {
        throw new Error('Missing required authentication parameters: address, signature, or message');
      }

      // Get the SkyNode instance
      let skyNode: SkyMainNodeJS | null;
      try {
        skyNode = await getSkyNode();
      } catch (error) {
        console.error('Failed to get SkyNode instance:', error);
        throw new Error('SkyNode initialization failed. Please ensure SkyNode is properly configured and available.');
      }

      if (!skyNode) {
        throw new Error('SkyNode is not initialized. Please initialize SkyNode before authentication.');
      }

      // Use type assertion to access config property
      const skyNodeAny = skyNode as any;
      if (!skyNodeAny.envConfig || !skyNodeAny.envConfig.JRPC_PROVIDER) {
        throw new Error('SkyNode is missing required configuration. Check your environment variables.');
      }

      console.log('Using SkyNode with provider:', skyNodeAny.envConfig.JRPC_PROVIDER);
      
      // Create a new instance of SkyUrsulaService with empty string and the initialized skyNode
      const ursulaService = new SkyUrsulaService("", skyNode);
      
      // Create auth payload
      const authPayload = {
        message,
        signature,
        userAddress: address
      };
      
      // Authenticate using the SkyNet UrsulaService
      let verificationResult;
      try {
        verificationResult = await ursulaService.authenticateSignature(authPayload);
      } catch (error) {
        console.error('SkyNet signature verification error:', error);
        throw new Error(`SkyNet signature verification failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      if (!verificationResult || !verificationResult.success) {
        throw new Error('SkyNet signature verification failed. Please ensure your message and signature are valid.');
      }
      
      console.log(`Signature verified by SkyNet for address: ${address}`);

      // Generate JWT token
      const token = jwt.sign(
        { address: address.toLowerCase() },
        this.config.jwtSecret || 'your-jwt-secret-key',
        { expiresIn: '24h' }
      );

      // Store authentication info in memory
      authenticatedWallets[address.toLowerCase()] = {
        token,
        authenticatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      return { token };
    } catch (error: any) {
      console.error('Authentication error:', error);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  private isAuthenticated(walletAddress: string, token?: string): boolean {
    const lowerWallet = walletAddress.toLowerCase();
    
    // If no auth info exists, not authenticated
    if (!authenticatedWallets[lowerWallet]) {
      return false;
    }

    // If token is provided, verify it matches
    if (token && authenticatedWallets[lowerWallet].token !== token) {
      return false;
    }

    // Check if authentication has expired
    const expiryDate = new Date(authenticatedWallets[lowerWallet].expiresAt);
    if (expiryDate < new Date()) {
      // Remove expired authentication
      delete authenticatedWallets[lowerWallet];
      return false;
    }

    return true;
  }

  async generateApiKey(walletAddress: string, collectionID: string, nftID: string, token?: string): Promise<ApiKeyResponse> {
    if (!this.config.enabled) {
      return { error: 'API key functionality is not enabled' };
    }

    try {
      if (!this.pool) throw new Error("Database not initialized");

      // Verify the wallet has been authenticated
      if (!this.isAuthenticated(walletAddress, token)) {
        return { error: 'Wallet address must be authenticated before generating an API key' };
      }
      
      // First check for existing active key for this specific NFT
      const { rows } = await this.pool.query(
        'SELECT key FROM api_keys WHERE wallet_address = $1 AND nft_collection_id = $2 AND nft_id = $3 AND is_active = true LIMIT 1', 
        [walletAddress.toLowerCase(), collectionID, nftID]
      );

      if (rows.length > 0) {
        return { apiKey: rows[0].key };
      }
      
      // Generate new API key
      const apiKey = this.createUniqueApiKey(walletAddress);
      const { rows: insertRows } = await this.pool.query(
        'INSERT INTO api_keys (key, wallet_address, nft_collection_id, nft_id, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING key', 
        [apiKey, walletAddress.toLowerCase(), collectionID, nftID, true]
      );

      if (insertRows.length === 0) throw new Error('Failed to insert API key');

      return { apiKey: insertRows[0].key };
    } catch (error: any) {
      return { error: `Failed to generate API key: ${error.message}` };
    }
  }

  async generateApiKeyFromAuth(walletAddress: string, collectionID: string, nftID: string): Promise<ApiKeyResponse> {
    if (!this.config.enabled) {
      return { error: 'API key functionality is not enabled' };
    }

    try {
      if (!this.pool) throw new Error("Database not initialized");

      // First check for existing active key for this specific NFT
      const { rows } = await this.pool.query(
        'SELECT key FROM api_keys WHERE wallet_address = $1 AND nft_collection_id = $2 AND nft_id = $3 AND is_active = true LIMIT 1', 
        [walletAddress.toLowerCase(), collectionID, nftID]
      );

      if (rows.length > 0) {
        return { apiKey: rows[0].key };
      }
      
      // Generate new API key
      const apiKey = this.createUniqueApiKey(walletAddress);
      const { rows: insertRows } = await this.pool.query(
        'INSERT INTO api_keys (key, wallet_address, nft_collection_id, nft_id, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING key', 
        [apiKey, walletAddress.toLowerCase(), collectionID, nftID, true]
      );

      if (insertRows.length === 0) throw new Error('Failed to insert API key');

      return { apiKey: insertRows[0].key };
    } catch (error: any) {
      return { error: `Failed to generate API key: ${error.message}` };
    }
  }

  async getUserApiKeys(walletAddress: string): Promise<{ apiKeys?: ApiKeyData[], error?: string }> {
    if (!this.config.enabled) {
      return { error: 'API key functionality is not enabled' };
    }

    try {
      if (!this.pool) throw new Error("Database not initialized");

      const { rows } = await this.pool.query(
        'SELECT * FROM api_keys WHERE wallet_address = $1 AND is_active = true ORDER BY created_at DESC', 
        [walletAddress.toLowerCase()]
      );

      return { apiKeys: rows as ApiKeyData[] };
    } catch (error: any) {
      return { error: `Failed to get API keys: ${error.message}` };
    }
  }

  async getApiKey(walletAddress: string, collectionID: string, nftID: string): Promise<ApiKeyResponse> {
    if (!this.config.enabled) {
      return { error: 'API key functionality is not enabled' };
    }

    try {
      if (!this.pool) throw new Error("Database not initialized");

      const { rows } = await this.pool.query(
        'SELECT key FROM api_keys WHERE wallet_address = $1 AND nft_collection_id = $2 AND nft_id = $3 AND is_active = true LIMIT 1', 
        [walletAddress.toLowerCase(), collectionID, nftID]
      );

      if (rows.length === 0) return { error: 'No active API key found for this NFT' };
      return { apiKey: rows[0].key };
    } catch (error: any) {
      return { error: `Failed to get API key: ${error.message}` };
    }
  }

  async validateApiKey(apiKey: string, req?: any): Promise<boolean> {
    if (!this.config.enabled) return true;

    try {
      if (!this.pool) throw new Error("Database not initialized");

      const { rows } = await this.pool.query('SELECT id, is_active FROM api_keys WHERE key = $1', [apiKey]);

      if (rows.length === 0) throw new Error('API key not found');
      
      if (rows[0].is_active) {
        // Log API usage with default endpoint
        await this.logApiUsage(rows[0].id, '/natural-request');
        
        // If request object is provided, attach the API key ID for later use
        if (req) {
          req.apiKeyId = rows[0].id;
        }
        
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async validateApiKeyForService(apiKey: string, serviceId: string, serviceUrl: string): Promise<boolean> {
    if (!this.config.enabled) return true;

    try {
      if (!this.pool) throw new Error("Database not initialized");

      const { rows } = await this.pool.query('SELECT id, is_active FROM api_keys WHERE key = $1', [apiKey]);

      if (rows.length === 0) throw new Error('API key not found');
      
      if (rows[0].is_active) {
        // Log API usage with service-specific endpoint
        await this.logApiUsage(rows[0].id, serviceUrl, serviceId);
        
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async revokeApiKey(walletAddress: string, apiKey: string): Promise<ApiKeyResponse> {
    if (!this.config.enabled) {
      return { error: 'API key functionality is not enabled' };
    }

    try {
      if (!this.pool) throw new Error("Database not initialized");

      const { rows } = await this.pool.query('UPDATE api_keys SET is_active = false, revoked_at = $1 WHERE key = $2 AND wallet_address = $3 RETURNING *', [new Date().toISOString(), apiKey, walletAddress.toLowerCase()]);

      if (rows.length === 0) throw new Error('API key not found or already revoked');
      return {};
    } catch (error: any) {
      return { error: `Failed to revoke API key: ${error.message}` };
    }
  }

  async logApiUsage(apiKeyId: string, endpoint: string = '/natural-request', serviceId?: string): Promise<void> {
    try {
      if (!this.pool) throw new Error("Database not initialized");

      // Attempt to insert the log entry
      await this.pool.query('INSERT INTO api_usage_logs (api_key_id, endpoint, method, status_code, service_id) VALUES ($1, $2, $3, $4, $5)', [apiKeyId, endpoint, 'POST', 200, serviceId]);
    } catch (error: any) {
      // If error occurs, check if it's due to missing table
      if (error.code === '42P01') { // Table doesn't exist error
        console.error('api_usage_logs table does not exist. Attempting to create it...');
        try {
          await this.setupDatabase();
          
          // Retry log insertion after table creation
          if (this.pool) {
            await this.pool.query('INSERT INTO api_usage_logs (api_key_id, endpoint, method, status_code, service_id) VALUES ($1, $2, $3, $4, $5)', [apiKeyId, endpoint, 'POST', 200, serviceId]);
          }
          
          console.log('Log inserted successfully after creating table');
        } catch (setupError) {
          console.error('Failed to create api_usage_logs table:', setupError);
        }
      } else {
        console.error('Failed to log API usage:', error);
      }
      // Don't throw error as this is not critical
    }
  }

  private createUniqueApiKey(walletAddress: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    return `sk_${walletAddress.substring(2, 8)}_${timestamp}_${random}`;
  }

  async registerService(serviceDetails: ServiceDetails): Promise<ServiceDetails> {
    if (!this.config.enabled) {
      throw new Error('API key functionality is not enabled');
    }
    // Simply return the service details - no database storage needed
    return serviceDetails;
  }

  async logServiceAccess(apiKeyId: string, serviceId: string, serviceUrl: string): Promise<void> {
    if (!this.config.enabled) return;
    
    // Use the consolidated logApiUsage method
    await this.logApiUsage(apiKeyId, serviceUrl, serviceId);
  }

  async setSkyNode(skyNode: SkyMainNodeJS): Promise<void> {
    if (!skyNode) {
      throw new Error('Invalid SkyNode instance provided');
    }
    console.log('Setting SkyNode in ApiKeyService');
    
    // Make SkyNode accessible for authentication
    (global as any).skyNode = skyNode;
    
    // Update the getSkyNode function to return this instance
    const oldGetSkyNode = (global as any).getSkyNode;
    (global as any).getSkyNode = async () => {
      return skyNode;
    };
    
    return Promise.resolve();
  }
} 