import { Pool } from 'pg';
import { ApiKeyConfig, ApiKeyResponse, ApiKeyData } from '../types/types';
import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
import SkyUrsulaService from '@decloudlabs/skynet/lib/services/SkyUrsulaService';
import {
  validateAccountNFT,
  validateAgentCollection,
} from './ownershipVerification';

// Note: API key tables are now managed by the centralized DatabaseMigration system
// See src/database/tableSchemas.ts for table definitions

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
      console.error('❌ SkyNet signature verification error:', error);
      throw new Error(`SkyNet signature verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!verificationResult || !verificationResult.success) {
      throw new Error('SkyNet signature verification failed. Please ensure your message and signature are valid.');
    }

    console.log(`✅ Signature verified for address: ${address}`);
    return true;
  } catch (error: any) {
    console.error('❌ Signature validation error:', error);
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
    // Log error but don't throw - API usage logging is not critical
    console.error('❌ Failed to log API usage:', error);
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
        console.error(`❌ AccountNFT ownership verification failed for API key: ${apiKey}`);
        return {
          isValid: false,
          error: 'API key validation failed - accountNFT ownership verification failed'
        };
      }

      // Log API usage with service info
      await logApiUsage(rows[0].id, '/natural-request', pool, req?.serviceId);

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
      console.log(`✅ API key validation successful for wallet: ${walletAddress}`);
    } else {
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

      // Step 2.2: Validate accountNFT ownership
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
      console.log(`✅ AccountNFT validation successful for wallet: ${walletAddress}`);
    }

    // Step 3: Validate agent collection if provided
    let agentCollection: { agentCollection: string; agentID?: string } | undefined;

    if (req.body && req.body.agentCollection) {
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

      const isAgentCollectionOwner = await validateAgentCollection(
        agentCollectionAddress,
        agentID || null,
        walletAddress,
        skyNode
      );

      if (!isAgentCollectionOwner) {
        console.error(`❌ Agent collection ownership verification failed for wallet: ${walletAddress}`);
        return {
          isValid: false,
          error: `Agent collection ownership validation failed for wallet: ${walletAddress}`
        };
      }

      const isAgentCollectionValid = true;
      if (!isAgentCollectionValid) {
        return {
          isValid: false,
          error: `Agent collection ownership validation failed for wallet: ${walletAddress}`
        };
      }

      agentCollection = req.body.agentCollection;
      console.log(`✅ Agent collection validation successful for wallet: ${walletAddress}`);
    }

    return {
      isValid: true,
      walletAddress,
      accountNFT,
      agentCollection
    };
  } catch (error) {
    console.error('❌ Error during master validation:', error);
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
    // Validate required fields from request body
    const walletAddress = req.body.walletAddress;
    const accountNFT = req.body.accountNFT;

    if (!walletAddress) {
      return { error: 'walletAddress is required' };
    }

    if (!accountNFT || !accountNFT.collectionID || !accountNFT.nftID) {
      return { error: 'accountNFT with collectionID and nftID is required' };
    }

    const { collectionID, nftID } = accountNFT;

    // Check for existing key for this specific NFT (active or not)
    const { rows } = await pool.query(
      'SELECT key FROM api_keys WHERE wallet_address = $1 AND nft_collection_id = $2 AND nft_id = $3 LIMIT 1',
      [walletAddress.toLowerCase(), collectionID, nftID]
    );

    if (rows.length > 0) {
      console.log(`✅ Returning existing API key for wallet: ${walletAddress}`);
      return { apiKey: rows[0].key };
    }

    // Generate new API key
    const apiKey = createUniqueApiKey(walletAddress);

    const { rows: insertRows } = await pool.query(
      'INSERT INTO api_keys (key, wallet_address, nft_collection_id, nft_id) VALUES ($1, $2, $3, $4) RETURNING key',
      [apiKey, walletAddress.toLowerCase(), collectionID, nftID]
    );

    if (insertRows.length === 0) {
      throw new Error('Failed to insert API key');
    }

    console.log(`✅ New API key generated for wallet: ${walletAddress}`);
    return { apiKey: insertRows[0].key };
  } catch (error: any) {
    console.error('❌ Error in generateApiKey:', error);
    return { error: `Failed to generate API key: ${error.message}` };
  }
};