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

  // Helper method to normalize agentCollection for consistent JSON serialization
  private normalizeAgentCollection(agentCollection: any): string | null {
    if (!agentCollection) return null;
    
    // Create a normalized version with sorted keys for consistent JSON stringification
    const sortedKeys = Object.keys(agentCollection).sort();
    const normalizedAgentCollection: any = {};
    sortedKeys.forEach(key => {
      normalizedAgentCollection[key] = agentCollection[key];
    });
    return JSON.stringify(normalizedAgentCollection);
  }

  // Core auth operations
  async saveAuth(req: any, authData: any): Promise<void> {
    try {
      const userAddress = req.body.walletAddress;
      const nftId = req.body.accountNFT.nftID;
      const agentCollection = req?.body?.agentCollection || null;
      const agentCollectionJson = this.normalizeAgentCollection(agentCollection);
      
      // Check if a record exists with the exact same parameters
      const existingRecord = await this.pool.query(
        'SELECT user_address FROM auth_data WHERE user_address = $1 AND nft_id = $2 AND backend_id = $3 AND (agent_collection IS NOT DISTINCT FROM $4)',
        [userAddress, nftId, this.backendId, agentCollectionJson]
      );
      
      if (existingRecord.rows.length > 0) {
        // Update existing record - all fields match
        await this.pool.query(
          'UPDATE auth_data SET auth_data = $1, updated_at = NOW() WHERE user_address = $2 AND nft_id = $3 AND backend_id = $4 AND (agent_collection IS NOT DISTINCT FROM $5)',
          [JSON.stringify(authData), userAddress, nftId, this.backendId, agentCollectionJson]
        );
        console.log('✅ Updated existing auth record');
      } else {
        // Create new record - at least one field is different
        await this.pool.query(
          'INSERT INTO auth_data (user_address, nft_id, backend_id, agent_collection, auth_data, updated_at) VALUES ($1, $2, $3, $4, $5, NOW())',
          [userAddress, nftId, this.backendId, agentCollectionJson, JSON.stringify(authData)]
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
      const userAddress = req.body.walletAddress;
      const nftId = req.body.accountNFT.nftID;
      const agentCollection = req?.body?.agentCollection || null;
      const agentCollectionJson = this.normalizeAgentCollection(agentCollection);
      
      await this.pool.query(
        'DELETE FROM auth_data WHERE user_address = $1 AND nft_id = $2 AND backend_id = $3 AND (agent_collection IS NOT DISTINCT FROM $4)',
        [userAddress, nftId, this.backendId, agentCollectionJson]
      );
    } catch (error) {
      console.error('Error deleting auth data:', error);
      throw error;
    }
  }

  async getAuth(req: any): Promise<any | null> {
    try {
      const userAddress = req.body.walletAddress;
      const nftId = req.body.accountNFT.nftID;
      const agentCollection = req?.body?.agentCollection || null;
      const agentCollectionJson = this.normalizeAgentCollection(agentCollection);
      
      console.log(`🔍 getAuth - Looking for auth with userAddress: ${userAddress}, nftId: ${nftId}, backendId: ${this.backendId}, agentCollection: ${agentCollectionJson}`);
      
      const result = await this.pool.query(
        'SELECT auth_data FROM auth_data WHERE user_address = $1 AND nft_id = $2 AND backend_id = $3 AND (agent_collection IS NOT DISTINCT FROM $4)',
        [userAddress, nftId, this.backendId, agentCollectionJson]
      );
      
      console.log(`🔍 getAuth - Found ${result.rows.length} matching records`);
      return result.rows.length > 0 ? result.rows[0].auth_data : null;
    } catch (error) {
      console.error('Error getting auth data:', error);
      return null;
    }
  }

  async checkAuthStatus(req: any): Promise<boolean> {
    try {
      const authData = await this.getAuth(req);
      if (!authData) return false;

      // Check if token is expired (if it has expires_at field)
      if (authData.expires_at && Date.now() > authData.expires_at) {
        return false;
      }

      // Check if we have valid tokens
      if (authData.access_token && authData.refresh_token) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking auth status:', error);
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