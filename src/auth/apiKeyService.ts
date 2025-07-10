import { Pool } from 'pg';
import { ApiKeyConfig, ApiKeyResponse, ApiKeyData } from '../types/types';
import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
import SkyUrsulaService from '@decloudlabs/skynet/lib/services/SkyUrsulaService';
import {
  validateAccountNFT,
  validateAgentCollection,
} from './ownershipVerification';

// Create database tables
const createTables = async (client: any): Promise<void> => {
  console.log('Creating API keys table...');
  
  // Create API keys table
  await client.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT NOT NULL UNIQUE,
      wallet_address TEXT NOT NULL,
      nft_collection_id TEXT NOT NULL,
      nft_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TIMESTAMPTZ
    );
    
    CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
    CREATE INDEX IF NOT EXISTS idx_api_keys_wallet ON api_keys(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_api_keys_nft ON api_keys(wallet_address, nft_collection_id, nft_id);
  `);
  
  console.log('API keys table created successfully');

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
};

// Initialize API key tables
export const initializeApiKeyTables = async (pool: Pool): Promise<void> => {
  try {
    console.log('Initializing API key tables...');
    const client = await pool.connect();
    try {
      await createTables(client);
      console.log('API key tables initialized successfully');
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error initializing API key tables:', error);
    throw new Error(`Failed to initialize API key tables: ${error.message}`);
  }
};

// Validate signature
export const validateSignature = async (address: string, signature: string, message: string, skyNode: SkyMainNodeJS): Promise<boolean> => {
  try {
    // Ensure we have all required parameters
    if (!address || !signature || !message) {
      throw new Error('Missing required authentication parameters: address, signature, or message');
    }
    
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
    return true;
  } catch (error: any) {
    console.error('Signature validation error:', error);
    throw new Error(`Signature validation failed: ${error.message}`);
  }
};

// Revoke API key
export const revokeApiKey = async (walletAddress: string, apiKey: string, pool: Pool): Promise<ApiKeyResponse> => {
  try {
    // Delete the API key from database
    const { rows } = await pool.query('DELETE FROM api_keys WHERE key = $1 AND wallet_address = $2 RETURNING *', [apiKey, walletAddress.toLowerCase()]);

    if (rows.length === 0) throw new Error('API key not found');
    return {};
  } catch (error: any) {
    return { error: `Failed to revoke API key: ${error.message}` };
  }
};

// Log API usage
export const logApiUsage = async (apiKeyId: string, endpoint: string = '/natural-request', pool: Pool, serviceId?: string): Promise<void> => {
  try {
    // Attempt to insert the log entry
    await pool.query('INSERT INTO api_usage_logs (api_key_id, endpoint, method, status_code, service_id) VALUES ($1, $2, $3, $4, $5)', [apiKeyId, endpoint, 'POST', 200, serviceId]);
  } catch (error: any) {
    // If error occurs, check if it's due to missing table
    if (error.code === '42P01') { // Table doesn't exist error
      console.error('api_usage_logs table does not exist. Attempting to create it...');
      try {
        await initializeApiKeyTables(pool);
        // Retry log insertion after table creation
        if (pool) {
          await pool.query('INSERT INTO api_usage_logs (api_key_id, endpoint, method, status_code, service_id) VALUES ($1, $2, $3, $4, $5)', [apiKeyId, endpoint, 'POST', 200, serviceId]);
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
};

// Master validation function
export const masterValidation = async (req: any, skyNode: SkyMainNodeJS, pool: Pool): Promise<{ isValid: boolean; error?: string; walletAddress?: string; accountNFT?: { collectionID: string; nftID: string }; agentCollection?: { agentCollection: string; agentID?: string } }> => {
  try {
    let walletAddress: string | undefined;
    let accountNFT: { collectionID: string; nftID: string } | undefined;

    // Step 1: Check if API key is provided
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (apiKey) {
      const { rows } = await pool.query('SELECT id, wallet_address, nft_collection_id, nft_id FROM api_keys WHERE key = $1', [apiKey]);
      if (rows.length === 0) {
        return {
          isValid: false,
          error: 'API key validation failed - invalid or expired API key'
        };
      }
      const apiKeyWalletAddress = rows[0].wallet_address;
      const collectionId = rows[0].nft_collection_id;
      const nftId = rows[0].nft_id;

      const isOwner = await validateAccountNFT(
        collectionId,
        nftId,
        apiKeyWalletAddress,
        skyNode
      );

      if (!isOwner) {
        console.error(`AccountNFT ownership verification failed for API key: ${apiKey}`);
        return {
          isValid: false,
          error: 'API key validation failed - accountNFT ownership verification failed'
        };
      }

      console.log(`AccountNFT ownership verification successful for API key: ${apiKey}`);

      // Log API usage with service info
      await logApiUsage(rows[0].id, '/natural-request', req?.serviceId);

      // If request object is provided, attach the API key ID for later use
      if (req) {
        req.apiKeyId = rows[0].id;
      }

      // Set wallet address and accountNFT from the validated API key
      walletAddress = apiKeyWalletAddress;
      accountNFT = {
        collectionID: rows[0].nft_collection_id,
        nftID: rows[0].nft_id
      };
      console.log(`API key validation successful for wallet: ${walletAddress}`);
    } else {
      console.log("called validating accountNFT")
      // Step 2: Check if accountNFT is provided in request body (only if no API key)
      if (!req.body || !req.body.accountNFT) {
        return {
          isValid: false,
          error: 'No API key provided and no accountNFT found in request body - authentication required'
        };
      }

      const { collectionID, nftID } = req.body.accountNFT;

      if (!collectionID || !nftID) {
        return {
          isValid: false,
          error: 'accountNFT provided but missing collectionID or nftID'
        };
      }

      // Step 2.1: Extract wallet address from userAuthPayload (skip signature validation)
      let providedWalletAddress = req.body.walletAddress || req.headers['x-wallet-address'];

      // If not found at top level, try to extract from userAuthPayload
      if (!providedWalletAddress) {
        const userAuthPayload = req.body.userAuthPayload;
        if (userAuthPayload) {
          // Handle both string and object formats
          let parsedUserAuthPayload;
          if (typeof userAuthPayload === 'string') {
            try {
              parsedUserAuthPayload = JSON.parse(userAuthPayload);
            } catch (error) {
              return {
                isValid: false,
                error: 'Invalid JSON format in userAuthPayload'
              };
            }
          } else {
            parsedUserAuthPayload = userAuthPayload;
          }

          // Extract wallet address from userAuthPayload
          providedWalletAddress = parsedUserAuthPayload.userAddress;
        }
      }

      if (!providedWalletAddress) {
        return {
          isValid: false,
          error: 'Wallet address required for accountNFT validation'
        };
      }

      walletAddress = providedWalletAddress;
      console.log(`Using wallet address: ${walletAddress}`);

      // Step 2.2: Validate accountNFT ownership
      console.log(`Validating accountNFT ownership for wallet: ${walletAddress}, collection: ${collectionID}, nft: ${nftID}`);

      if (!walletAddress) {
        return {
          isValid: false,
          error: 'Wallet address not available for accountNFT validation'
        };
      }

      const isAccountNFTOwner = await validateAccountNFT(
        collectionID,
        nftID,
        walletAddress,
        skyNode
      );

      if (!isAccountNFTOwner) {
        return {
          isValid: false,
          error: `AccountNFT ownership validation failed for wallet: ${walletAddress}`
        };
      }

      accountNFT = {
        collectionID,
        nftID
      };
      console.log(`AccountNFT validation successful for wallet: ${walletAddress}`);
    }

    // Step 3: Validate agent collection if provided
    let agentCollection: { agentCollection: string; agentID?: string } | undefined;

    if (req.body && req.body.agentCollection) {
      console.log('Agent collection provided - validating agent collection ownership');

      if (!walletAddress) {
        return {
          isValid: false,
          error: 'Wallet address not available for agent collection validation'
        };
      }

      // Validate agent collection ownership
      const { agentAddress: agentCollectionAddress, agentID } = req.body.agentCollection;

      if (!agentCollectionAddress) {
        return {
          isValid: false,
          error: 'Agent collection address not provided'
        };
      }

      console.log(`Verifying agent collection ownership for wallet: ${walletAddress}, agentCollection: ${agentCollectionAddress}, agentID: ${agentID || 'null'}`);

      const isAgentCollectionOwner = await validateAgentCollection(
        agentCollectionAddress,
        agentID || null,
        walletAddress,
        skyNode
      );

      if (!isAgentCollectionOwner) {
        console.error(`Agent collection ownership verification failed for wallet: ${walletAddress}`);
        return {
          isValid: false,
          error: `Agent collection ownership validation failed for wallet: ${walletAddress}`
        };
      }

      console.log(`Agent collection ownership verification successful for wallet: ${walletAddress}`);
      const isAgentCollectionValid = true;
      if (!isAgentCollectionValid) {
        return {
          isValid: false,
          error: `Agent collection ownership validation failed for wallet: ${walletAddress}`
        };
      }

      agentCollection = req.body.agentCollection;
      console.log(`Agent collection validation successful for wallet: ${walletAddress}`);
    } else {
      console.log('No agent collection provided - skipping agent collection validation');
    }

    return {
      isValid: true,
      walletAddress,
      accountNFT,
      agentCollection
    };
  } catch (error) {
    console.error('Error during master validation:', error);
    return {
      isValid: false,
      error: `Master validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

// Create unique API key
const createUniqueApiKey = (walletAddress: string): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  return `sk_${walletAddress.substring(2, 8)}_${timestamp}_${random}`;
};

// Generate API key
export const generateApiKey = async (req: any, pool: Pool): Promise<ApiKeyResponse> => {
  try {
    console.log('generateApiKey: Function called');
    console.log('generateApiKey: Request body:', JSON.stringify(req.body, null, 2));
    
    console.log('Starting API key generation...');

    // Validate required fields from request body
    const walletAddress = req.body.walletAddress;
    const accountNFT = req.body.accountNFT;
    
    console.log('generateApiKey: walletAddress:', walletAddress);
    console.log('generateApiKey: accountNFT:', JSON.stringify(accountNFT, null, 2));

    if (!walletAddress) {
      console.log('Missing walletAddress in request body');
      return { error: 'walletAddress is required' };
    }

    if (!accountNFT || !accountNFT.collectionID || !accountNFT.nftID) {
      console.log('Missing accountNFT or accountNFT details in request body');
      return { error: 'accountNFT with collectionID and nftID is required' };
    }

    const { collectionID, nftID } = accountNFT;

    console.log(`Checking for existing API key for wallet: ${walletAddress}, collection: ${collectionID}, nft: ${nftID}`);

    // Check for existing key for this specific NFT (active or not)
    const { rows } = await pool.query(
      'SELECT key FROM api_keys WHERE wallet_address = $1 AND nft_collection_id = $2 AND nft_id = $3 LIMIT 1',
      [walletAddress.toLowerCase(), collectionID, nftID]
    );

    if (rows.length > 0) {
      console.log('Found existing API key, returning it');
      return { apiKey: rows[0].key };
    }

    console.log('No existing API key found, generating new one...');

    // Generate new API key
    const apiKey = createUniqueApiKey(walletAddress);
    console.log(`Generated API key: ${apiKey}`);

    console.log('Inserting API key into database...');
    const { rows: insertRows } = await pool.query(
      'INSERT INTO api_keys (key, wallet_address, nft_collection_id, nft_id) VALUES ($1, $2, $3, $4) RETURNING key',
      [apiKey, walletAddress.toLowerCase(), collectionID, nftID]
    );

    if (insertRows.length === 0) {
      console.error('Failed to insert API key - no rows returned');
      throw new Error('Failed to insert API key');
    }

    console.log('API key successfully inserted into database');
    return { apiKey: insertRows[0].key };
  } catch (error: any) {
    console.error('Error in generateApiKey:', error);
    return { error: `Failed to generate API key: ${error.message}` };
  }
};