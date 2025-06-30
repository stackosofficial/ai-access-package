//import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ApiKeyResponse, AuthTokenInfo } from './types/types';
import jwt from 'jsonwebtoken';
import { ServiceManagement, ServiceDetails } from './serviceManagement';
import { getSkyNode } from './init';
import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
import SkyUrsulaService from '@decloudlabs/skynet/lib/services/SkyUrsulaService';
import { Pool } from 'pg';
import crypto from 'crypto';

export const globalPool = new Pool({ 
  connectionString: process.env.POSTGRES_URL || '' 
});

// Define ApiKeyData type based on the structure of your api_keys table
export type ApiKeyData = {
  id: string;
  key: string;
  wallet_address: string;
  nft_collection_id?: string;
  nft_id?: string;
  is_active: boolean;
  created_at: string;
  revoked_at?: string | null;
  last_used_at?: string | null;
};

// Store authenticated wallet addresses
const authenticatedWallets: Record<string, AuthTokenInfo> = {};

export interface ApiKeyConfig {
  // No enabled, supabaseUrl, supabaseKey, or jwtSecret
  // Optionally, you can add other options if needed
}

export class ApiKeyService {
  // private supabase: SupabaseClient = {} as SupabaseClient;
  private config: ApiKeyConfig;
  private serviceManagement: ServiceManagement = {} as ServiceManagement;
  private pool: Pool;
  private jwtSecret!: string;

  constructor(config: ApiKeyConfig) {
    this.config = config;
    
    // Use the global POSTGRES_URL
    const postgresUrl = process.env.POSTGRES_URL!;
    this.pool = new Pool({ connectionString: postgresUrl });
    // JWT secret will be loaded/generated in setupTables
  }

  async setupTables(): Promise<void> {

    try {
      // Set up API key tables only - service tables no longer needed
      await this.setupApiKeyTables();

      // Create sdk_config table if not exists
      await globalPool.query(`
        CREATE TABLE IF NOT EXISTS sdk_config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      // Get or create JWT secret
      this.jwtSecret = await this.getOrCreateJwtSecret();
    } catch (error: any) {
      console.error('Error setting up tables:', error);
      throw new Error(`Failed to set up tables: ${error.message}`);
    }
  }

  private async setupApiKeyTables(): Promise<void> {
    try {
      // Create api_keys table and indexes
      await globalPool.query(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          key TEXT NOT NULL UNIQUE,
          wallet_address TEXT NOT NULL,
          nft_collection_id TEXT,
          nft_id TEXT,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          revoked_at TIMESTAMPTZ,
          last_used_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS api_keys_key_idx ON api_keys(key);
        CREATE INDEX IF NOT EXISTS api_keys_wallet_idx ON api_keys(wallet_address);
        CREATE INDEX IF NOT EXISTS api_keys_active_idx ON api_keys(is_active) WHERE is_active = true;
      `);
      // Create api_usage_logs table and indexes
      await globalPool.query(`
        CREATE TABLE IF NOT EXISTS api_usage_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL,
          status_code INTEGER,
          service_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS api_usage_logs_api_key_idx ON api_usage_logs(api_key_id);
        CREATE INDEX IF NOT EXISTS api_usage_logs_created_at_idx ON api_usage_logs(created_at);
        CREATE INDEX IF NOT EXISTS api_usage_logs_service_id_idx ON api_usage_logs(service_id);
      `);
      // Create trigger and function for last_used_at update
      await globalPool.query(`
        CREATE OR REPLACE FUNCTION update_api_key_last_used()
        RETURNS TRIGGER AS $$
        BEGIN
          UPDATE api_keys
          SET last_used_at = NOW()
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
      // Note: Row level security and policies can be added here if needed
    } catch (error: any) {
      console.error('Error setting up API key tables:', error);
      throw new Error(`Failed to set up API key tables: ${error.message}`);
    }
  }

  private async getOrCreateJwtSecret(): Promise<string> {
    const result = await globalPool.query("SELECT value FROM sdk_config WHERE key = 'jwt_secret'");
    if (result.rows.length > 0) {
      return result.rows[0].value;
    }
    // Generate new secret
    const newSecret = crypto.randomBytes(64).toString('hex');
    await globalPool.query("INSERT INTO sdk_config (key, value) VALUES ('jwt_secret', $1)", [newSecret]);
    return newSecret;
  }

  async getApiKeyDetails(apiKey: string): Promise<ApiKeyData | null> {
    try {
      const result = await globalPool.query(
        'SELECT * FROM api_keys WHERE key = $1 AND is_active = true LIMIT 1',
        [apiKey]
      );
      const data = result.rows[0];
      if (!data) {
        console.error('No data found for API key');
        return null;
      }

      // Log the retrieved data
      console.log('Retrieved API key details:', {
        wallet_address: data.wallet_address,
        nft_collection_id: data.nft_collection_id,
        nft_id: data.nft_id
      });

      // Validate required fields
      if (!data.nft_collection_id || !data.nft_id) {
        console.error('API key missing NFT details:', {
          nft_collection_id: data.nft_collection_id,
          nft_id: data.nft_id
        });
        return null;
      }

      return data as ApiKeyData;
    } catch (error) {
      console.error('Error getting API key details:', error);
      return null;
    }
  }

  async authenticateUser(address: string, signature: string, message: string): Promise<{ token: string }> {
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
        this.jwtSecret,
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

  /**
   * Verify if a wallet address has been authenticated
   * @param walletAddress The wallet address to check
   * @param token Optional JWT token to validate
   */
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

  /**
   * Generate API key for a wallet address, but only if it has been authenticated
   * @param walletAddress The wallet address to generate an API key for
   * @param token Optional JWT token for verification
   */  // Update generateApiKey to include NFT data
  async generateApiKey(walletAddress: string, token?: string, collectionID?: string, nftID?: string): Promise<ApiKeyResponse> {
    try {
      // Verify the wallet has been authenticated
      if (!this.isAuthenticated(walletAddress, token)) {
        return { error: 'Wallet address must be authenticated before generating an API key' };
      }
      // Check for existing active key
      const existing = await globalPool.query(
        'SELECT key FROM api_keys WHERE wallet_address = $1 AND is_active = true LIMIT 1',
        [walletAddress.toLowerCase()]
      );
      if (existing.rows[0]?.key) {
        return { apiKey: existing.rows[0].key };
      }
      const apiKey = this.createUniqueApiKey(walletAddress);
      await globalPool.query(
        'INSERT INTO api_keys (key, wallet_address, nft_collection_id, nft_id, is_active) VALUES ($1, $2, $3, $4, true)',
        [apiKey, walletAddress.toLowerCase(), collectionID, nftID || null]
      );
      return { apiKey };
    } catch (error: any) {
      return { error: `Failed to generate API key: ${error.message}` };
    }
  }

  async getApiKey(walletAddress: string): Promise<ApiKeyResponse> {
    try {
      const result = await globalPool.query(
        'SELECT key FROM api_keys WHERE wallet_address = $1 AND is_active = true LIMIT 1',
        [walletAddress.toLowerCase()]
      );
      return { apiKey: result.rows[0]?.key };
    } catch (error: any) {
      return { error: `Failed to get API key: ${error.message}` };
    }
  }

  async validateApiKey(apiKey: string, req?: any): Promise<boolean> {
    try {
      const result = await globalPool.query(
        'SELECT id, is_active FROM api_keys WHERE key = $1 LIMIT 1',
        [apiKey]
      );
      const data = result.rows[0];
      if (data && data.is_active) {
        await this.logApiUsage(data.id, '/natural-request');
        
        // If request object is provided, attach the API key ID for later use
        if (req) {
          req.apiKeyId = data.id;
        }
        
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate API key for service access and log the usage
   * This is a convenience method that combines validation and logging
   */
  async validateApiKeyForService(apiKey: string, serviceId: string, serviceUrl: string): Promise<boolean> {
    try {
      const result = await globalPool.query(
        'SELECT id, is_active FROM api_keys WHERE key = $1 LIMIT 1',
        [apiKey]
      );
      const data = result.rows[0];
      if (data && data.is_active) {
        await this.logApiUsage(data.id, serviceUrl, serviceId);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async revokeApiKey(walletAddress: string, apiKey: string): Promise<ApiKeyResponse> {
    try {
      await globalPool.query(
        'UPDATE api_keys SET is_active = false, revoked_at = NOW() WHERE key = $1 AND wallet_address = $2',
        [apiKey, walletAddress.toLowerCase()]
      );
      return {};
    } catch (error: any) {
      return { error: `Failed to revoke API key: ${error.message}` };
    }
  }

  /**
   * Log API usage in the api_usage_logs table
   * @param apiKeyId The API key ID
   * @param endpoint The endpoint or service URL being accessed
   * @param serviceId Optional service ID for tracking specific services
   */
  async logApiUsage(apiKeyId: string, endpoint: string = '/natural-request', serviceId?: string): Promise<void> {
    try {
      await globalPool.query(
        'INSERT INTO api_usage_logs (api_key_id, endpoint, method, status_code, service_id) VALUES ($1, $2, $3, $4, $5)',
        [apiKeyId, endpoint, 'POST', 200, serviceId || null]
      );
    } catch (error) {
      console.error('Failed to log API usage:', error);
    }
  }

  private createUniqueApiKey(walletAddress: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    return `sk_${walletAddress.substring(2, 8)}_${timestamp}_${random}`;
  }

  /**
   * Register a service for API usage tracking
   * This just logs service information but doesn't create a database entry
   */
  async registerService(serviceDetails: ServiceDetails): Promise<ServiceDetails> {
    
    return this.serviceManagement.registerService(serviceDetails);
  }

  /**
   * Log service access - uses logApiUsage internally
   */
  async logServiceAccess(apiKeyId: string, serviceId: string, serviceUrl: string): Promise<void> {
    
    // Use the consolidated logApiUsage method
    await this.logApiUsage(apiKeyId, serviceUrl, serviceId);
  }

  /**
   * Set the SkyNode instance for authentication
   */
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