import { Pool } from 'pg';

// Table creation SQL
const CREATE_AUTH_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS third_party_auth (
  user_address TEXT NOT NULL,
  service_name TEXT NOT NULL,
  auth_data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_address, service_name)
);
`;

// Ensure the table exists
export async function initAuthTable(pool: Pool): Promise<void> {
  await pool.query(CREATE_AUTH_TABLE_SQL);
}

// Send an auth link (returns the provided authLink)
export async function sendAuthLink(authLink: string): Promise<string> {
  return authLink;
}

// Save or update auth data (upsert) - for developer use only
export async function saveAuth(pool: Pool, userAddress: string, serviceName: string, authData: any): Promise<void> {
  await pool.query(
    `INSERT INTO third_party_auth (user_address, service_name, auth_data, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_address, service_name)
     DO UPDATE SET auth_data = $3, updated_at = NOW()`,
    [userAddress, serviceName, JSON.stringify(authData)]
  );
}

// Get auth data - for developer use only
export async function getAuth(pool: Pool, userAddress: string, serviceName: string): Promise<any | null> {
  const res = await pool.query(
    `SELECT auth_data FROM third_party_auth WHERE user_address = $1 AND service_name = $2`,
    [userAddress, serviceName]
  );
  if (res.rows.length === 0) return null;
  return res.rows[0].auth_data;
}

// Check auth status (connected or not connected)
export async function checkAuthStatus(pool: Pool, userAddress: string, serviceName: string): Promise<{ connected: boolean; lastUpdated?: string; serviceName: string }> {
  const res = await pool.query(
    `SELECT auth_data, updated_at FROM third_party_auth WHERE user_address = $1 AND service_name = $2`,
    [userAddress, serviceName]
  );
  
  if (res.rows.length === 0) {
    return { connected: false, serviceName };
  }

  const authData = res.rows[0].auth_data;
  const lastUpdated = res.rows[0].updated_at;
  
  // Check if auth is valid (not expired)
  const isValid = validateAuthData(authData);
  
  return { 
    connected: isValid, 
    lastUpdated: lastUpdated,
    serviceName 
  };
}

// Validate auth data (check if expired, has required fields, etc.)
function validateAuthData(authData: any): boolean {
  if (!authData) return false;

  // Check for OAuth2 tokens
  if (authData.access_token) {
    // Check if token is expired
    if (authData.expires_at) {
      const expiresAt = new Date(authData.expires_at);
      if (expiresAt <= new Date()) {
        return false; // Token expired
      }
    }
    
    // Check if expires_in is provided and calculate expiration
    if (authData.expires_in && authData.created_at) {
      const expirationTime = new Date(authData.created_at).getTime() + (authData.expires_in * 1000);
      if (Date.now() >= expirationTime) {
        return false; // Token expired
      }
    }
    
    return true; // Valid OAuth2 token
  }

  // Check for JWT tokens
  if (authData.token) {
    if (authData.expires_at) {
      const expiresAt = new Date(authData.expires_at);
      return expiresAt > new Date();
    }
    return true; // JWT token without expiration
  }

  // Check for API keys
  if (authData.key) {
    return true; // API key is always valid unless explicitly revoked
  }

  // For any other auth type, assume valid if data exists
  return Object.keys(authData).length > 0;
} 