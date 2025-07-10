import { Pool } from 'pg';

// Database table creation SQL
const CREATE_AUTH_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS auth_data (
  user_address TEXT NOT NULL,
  nft_id TEXT NOT NULL,
  backend_id TEXT NOT NULL DEFAULT 'default',
  auth_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_address, nft_id, backend_id)
);
`;

// Abstract Auth Class
export abstract class AuthService {
  protected pool: Pool;
  protected backendId: string;

  constructor(postgresUrl: string) {
    this.pool = new Pool({ connectionString: postgresUrl });
    this.backendId = process.env.BACKEND_ID || 'default';
  }

  // Abstract method - developer must implement
  abstract generateAuthLink(userAddress: string, nftId: string): Promise<string>;

  // Check if user has auth data
  async checkAuthStatus(userAddress: string, nftId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'SELECT auth_data FROM auth_data WHERE user_address = $1 AND nft_id = $2 AND backend_id = $3',
        [userAddress, nftId, this.backendId]
      );
      return result.rows.length > 0 && result.rows[0].auth_data !== null;
    } catch (error) {
      console.error('Error checking auth status:', error);
      return false;
    }
  }

  // Get auth data
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

  // Save auth data
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

  // Initialize database table
  async initTable(): Promise<void> {
    try {
      await this.pool.query(CREATE_AUTH_TABLE_SQL);
      console.log('Auth table initialized successfully');
    } catch (error) {
      console.error('Error initializing auth table:', error);
      throw error;
    }
  }
}

// Factory function to create auth service
export function createAuthService(postgresUrl: string): AuthService {
  return new (class extends AuthService {
    async generateAuthLink(userAddress: string, nftId: string): Promise<string> {
      // Default implementation - developer should override
      throw new Error('generateAuthLink must be implemented by developer');
    }
  })(postgresUrl);
} 