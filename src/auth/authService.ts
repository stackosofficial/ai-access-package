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

  // Core auth operations
  async saveAuth(userAddress: string, nftId: string, authData: any): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO auth_data (user_address, nft_id, backend_id, auth_data, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_address, nft_id, backend_id)
         DO UPDATE SET auth_data = $4, updated_at = NOW()`,
        [userAddress, nftId, this.backendId, JSON.stringify(authData)]
      );
    } catch (error) {
      console.error('Error saving auth data:', error);
      throw error;
    }
  }

  async deleteAuth(userAddress: string, nftId: string): Promise<void> {
    try {
      await this.pool.query(
        'DELETE FROM auth_data WHERE user_address = $1 AND nft_id = $2 AND backend_id = $3',
        [userAddress, nftId, this.backendId]
      );
    } catch (error) {
      console.error('Error deleting auth data:', error);
      throw error;
    }
  }

  async getAuth(userAddress: string, nftId: string): Promise<any | null> {
    try {
      const result = await this.pool.query(
        'SELECT auth_data FROM auth_data WHERE user_address = $1 AND nft_id = $2 AND backend_id = $3',
        [userAddress, nftId, this.backendId]
      );
      return result.rows.length > 0 ? result.rows[0].auth_data : null;
    } catch (error) {
      console.error('Error getting auth data:', error);
      return null;
    }
  }

  async checkAuthStatus(userAddress: string, nftId: string): Promise<boolean> {
    try {
      const authData = await this.getAuth(userAddress, nftId);
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
      return false;
    }
  }

  // Extensible methods - developers must implement these
  abstract generateAuthLink(userAddress: string, nftId: string): Promise<string>;
  abstract revokeAuth(userAddress: string, nftId: string): Promise<void>;
}

// Factory function to create default auth service
export function createAuthService(): AuthService {
  return new (class extends AuthService {
    async generateAuthLink(userAddress: string, nftId: string): Promise<string> {
      throw new Error('generateAuthLink must be implemented by developer');
    }

    async revokeAuth(userAddress: string, nftId: string): Promise<void> {
      await this.deleteAuth(userAddress, nftId);
    }
  })();
} 