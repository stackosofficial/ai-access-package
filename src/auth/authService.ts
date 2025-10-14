import { Pool } from 'pg';
import { getGlobalPostgresUrl } from '../core/init';

// Abstract Auth Class - Core auth operations
export abstract class AuthService {
  protected pool: Pool;
  protected backendId: string;

  constructor() {
    const postgresUrl = getGlobalPostgresUrl();
    this.pool = new Pool({
      connectionString: postgresUrl,
      ssl: {
        rejectUnauthorized: false
      }
    });
    this.backendId = process.env.BACKEND_ID || 'default';
  }

  // Helper method to normalize agentCollection and extract agentCollectionAddress and agentCollectionId
  private normalizeAgentData(agentCollection: any): { agentCollectionAddress: string | null; agentCollectionId: number | null } {
    if (!agentCollection) return { agentCollectionAddress: null, agentCollectionId: null };
    
    // Extract agentCollectionAddress and convert to lowercase
    const agentCollectionAddress = agentCollection.agentAddress ? agentCollection.agentAddress.toLowerCase() : null;
    
    // Extract agentCollectionId and convert to number
    const agentCollectionId = agentCollection.agentID || agentCollection.agentId || null;
    const normalizedAgentCollectionId = agentCollectionId ? parseInt(String(agentCollectionId), 10) : null;
    
    return {
      agentCollectionAddress,
      agentCollectionId: normalizedAgentCollectionId
    };
  }

  // Helper method to normalize wallet address to lowercase
  private normalizeAddress(address: string): string {
    return address ? address.toLowerCase() : address;
  }

  // Core auth operations
  async saveAuth(req: any, authData: any, accountName?: string): Promise<void> {
    try {
      const userAddress = this.normalizeAddress(req.body.walletAddress);
      const nftId = req.body.accountNFT.nftID;
      const agentCollection = req?.body?.agentCollection || null;
      const { agentCollectionAddress, agentCollectionId } = this.normalizeAgentData(agentCollection);
      
      // Check if a record exists with the exact same parameters
      const existingRecord = await this.pool.query(
        'SELECT user_address FROM auth_data WHERE LOWER(user_address) = $1 AND nft_id = $2 AND backend_id = $3 AND (agent_collection_address IS NOT DISTINCT FROM $4) AND (agent_collection_id IS NOT DISTINCT FROM $5)',
        [userAddress, nftId, this.backendId, agentCollectionAddress, agentCollectionId]
      );
      
      if (existingRecord.rows.length > 0) {
        // Update existing record - all fields match
        await this.pool.query(
          'UPDATE auth_data SET auth_data = $1, account_name = $2, updated_at = NOW() WHERE LOWER(user_address) = $3 AND nft_id = $4 AND backend_id = $5 AND (agent_collection_address IS NOT DISTINCT FROM $6) AND (agent_collection_id IS NOT DISTINCT FROM $7)',
          [JSON.stringify(authData), accountName || null, userAddress, nftId, this.backendId, agentCollectionAddress, agentCollectionId]
        );
        console.log('✅ Updated existing auth record');
      } else {
        // Create new record - at least one field is different
        await this.pool.query(
          'INSERT INTO auth_data (user_address, nft_id, backend_id, agent_collection_address, agent_collection_id, account_name, auth_data, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
          [userAddress, nftId, this.backendId, agentCollectionAddress, agentCollectionId, accountName || null, JSON.stringify(authData)]
        );
        console.log('✅ Created new auth record');
      }
    } catch (error) {
      console.error('Error saving auth data:', error);
      throw error;
    }
  }

  async deleteAuth(req: any): Promise<void> {
    try {
      const userAddress = this.normalizeAddress(req.body.walletAddress);
      const nftId = req.body.accountNFT.nftID;
      const agentCollection = req?.body?.agentCollection || null;
      const { agentCollectionAddress, agentCollectionId } = this.normalizeAgentData(agentCollection);
      
      await this.pool.query(
        'DELETE FROM auth_data WHERE LOWER(user_address) = $1 AND nft_id = $2 AND backend_id = $3 AND (agent_collection_address IS NOT DISTINCT FROM $4) AND (agent_collection_id IS NOT DISTINCT FROM $5)',
        [userAddress, nftId, this.backendId, agentCollectionAddress, agentCollectionId]
      );
    } catch (error) {
      console.error('Error deleting auth data:', error);
      throw error;
    }
  }

  async getAuth(req: any): Promise<any | null> {
    try {
      const userAddress = this.normalizeAddress(req.body.walletAddress);
      const nftId = req.body.accountNFT.nftID;
      const agentCollection = req?.body?.agentCollection || null;
      const { agentCollectionAddress, agentCollectionId } = this.normalizeAgentData(agentCollection);
      
      console.log(`🔍 getAuth - Looking for auth with userAddress: ${userAddress}, nftId: ${nftId}, backendId: ${this.backendId}, agentCollectionAddress: ${agentCollectionAddress}, agentCollectionId: ${agentCollectionId}`);
      
      // If agentCollection is provided, filter by both agentCollectionAddress and agentCollectionId
      if (agentCollectionAddress && agentCollectionId !== null) {
        console.log(`🔍 getAuth - Searching with both agentCollectionAddress and agentCollectionId`);
        const result = await this.pool.query(
          'SELECT auth_data, account_name FROM auth_data WHERE LOWER(user_address) = $1 AND nft_id = $2 AND backend_id = $3 AND agent_collection_address = $4 AND agent_collection_id = $5',
          [userAddress, nftId, this.backendId, agentCollectionAddress, agentCollectionId]
        );
        
        console.log(`🔍 getAuth - Found ${result.rows.length} matching records with agent filtering`);
        if (result.rows.length > 0) {
          const authData = result.rows[0].auth_data;
          const accountName = result.rows[0].account_name;
          return { ...authData, account_name: accountName };
        }
        return null;
      }
      
      // If no agentCollection provided, try basic auth without agent filtering
      console.log(`🔍 getAuth - No agentCollection provided, trying basic auth without agent filtering`);
      const result = await this.pool.query(
        'SELECT auth_data, account_name FROM auth_data WHERE LOWER(user_address) = $1 AND nft_id = $2 AND backend_id = $3 AND agent_collection_address IS NULL AND agent_collection_id IS NULL',
        [userAddress, nftId, this.backendId]
      );
      
      console.log(`🔍 getAuth - Found ${result.rows.length} matching records without agent filtering`);
      if (result.rows.length > 0) {
        const authData = result.rows[0].auth_data;
        const accountName = result.rows[0].account_name;
        return { ...authData, account_name: accountName };
      }
      return null;
    } catch (error) {
      console.error('Error getting auth data:', error);
      return null;
    }
  }

  async checkAuthStatus(req: any): Promise<boolean> {
    try {
      console.log('🔍 checkAuthStatus - Starting auth status check');
      const authData = await this.getAuth(req);
      
      if (!authData) {
        console.log('❌ checkAuthStatus - No auth data found, returning false');
        return false;
      }

      console.log('✅ checkAuthStatus - Auth data found:', JSON.stringify(authData, null, 2));

      // Check if we have a refresh token (long-lived, ~6 months)
      if (authData.refresh_token) {
        console.log('✅ checkAuthStatus - Refresh token exists (long-lived), auth is valid, returning true');
        return true;
      }

      console.log('ℹ️ checkAuthStatus - No refresh token found, checking access token');

      // If no refresh token, check access token with expiration
      if (authData.access_token) {
        // Check if token is expired (if it has expires_at field)
        if (authData.expires_at) {
          const now = Date.now();
          console.log(`🕐 checkAuthStatus - Checking expiration: expires_at=${authData.expires_at}, now=${now}, expired=${now > authData.expires_at}`);
          
          if (now > authData.expires_at) {
            console.log('❌ checkAuthStatus - Access token expired, returning false');
            return false;
          }
          
          console.log('✅ checkAuthStatus - Access token valid and not expired, returning true');
          return true;
        } else {
          console.log('✅ checkAuthStatus - Access token exists (no expiration check), returning true');
          return true;
        }
      }

      console.log('❌ checkAuthStatus - No valid tokens found (neither refresh_token nor access_token), returning false');
      return false;
    } catch (error) {
      console.error('❌ checkAuthStatus - Error checking auth status:', error);
      throw error;
    }
  }



  // Extensible methods - developers must implement these
  abstract generateAuthLink(req: any): Promise<string>;
  abstract revokeAuth(req: any): Promise<void>;
}

// Factory function to create a basic auth service (for testing/development only)
// Note: This should not be used in production as it throws errors for required methods
export function createAuthService(): AuthService {
  return new (class extends AuthService {
    async generateAuthLink(req: any): Promise<string> {
      throw new Error('generateAuthLink must be implemented by developer. Please provide a custom AuthService implementation.');
    }

    async revokeAuth(req: any): Promise<void> {
      await this.deleteAuth(req);
    }
  })();
} 