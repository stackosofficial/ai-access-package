"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiKeyService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const serviceManagement_1 = require("./serviceManagement");
const init_1 = require("./init");
const SkyUrsulaService_1 = __importDefault(require("@decloudlabs/skynet/lib/services/SkyUrsulaService"));
// Store authenticated wallet addresses
const authenticatedWallets = {};
class ApiKeyService {
    constructor(config) {
        this.supabase = {};
        this.serviceManagement = {};
        this.config = config;
        if (config.enabled) {
            if (!config.supabaseUrl || !config.supabaseKey) {
                throw new Error('Missing required Supabase configuration');
            }
            this.supabase = (0, supabase_js_1.createClient)(config.supabaseUrl, config.supabaseKey, {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            });
            this.serviceManagement = new serviceManagement_1.ServiceManagement(this.supabase);
        }
    }
    async setupTables() {
        if (!this.config.enabled)
            return;
        try {
            // Set up API key tables only - service tables no longer needed
            await this.setupApiKeyTables();
        }
        catch (error) {
            console.error('Error setting up tables:', error);
            throw new Error(`Failed to set up tables: ${error.message}`);
        }
    }
    async setupApiKeyTables() {
        try {
            // First check if execute_sql function exists
            let useExecSql = false;
            try {
            await this.supabase.rpc('execute_sql', {
                    sql_query: 'SELECT 1 as test'
                });
                console.log('Using execute_sql RPC function for table creation');
            }
            catch (rpcError) {
                // If execute_sql doesn't exist, try exec_sql instead
                try {
                    await this.supabase.rpc('exec_sql', {
                        query: 'SELECT 1 as test'
                    });
                    useExecSql = true;
                    console.log('Using exec_sql RPC function for table creation');
                }
                catch (fallbackError) {
                    console.error('Neither execute_sql nor exec_sql RPC functions exist. Creating tables will fail.');
                    console.error('Please run this SQL in your Supabase SQL Editor:');
                    console.error(`
CREATE OR REPLACE FUNCTION execute_sql(sql_query TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  EXECUTE sql_query;
  result := '{"success": true}'::JSON;
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  result := json_build_object(
    'success', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`);
                    throw new Error('Missing required RPC function for table creation');
                }
            }
            // SQL query for creating tables
            const sqlQuery = `
          CREATE TABLE IF NOT EXISTS api_keys (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            key TEXT NOT NULL UNIQUE,
            wallet_address TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            revoked_at TIMESTAMPTZ,
            last_used_at TIMESTAMPTZ
          );
          
          CREATE INDEX IF NOT EXISTS api_keys_key_idx ON api_keys(key);
          CREATE INDEX IF NOT EXISTS api_keys_wallet_idx ON api_keys(wallet_address);
          CREATE INDEX IF NOT EXISTS api_keys_active_idx ON api_keys(is_active) WHERE is_active = true;
          
          ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
          
          DROP POLICY IF EXISTS "service_role_api_keys_policy" ON api_keys;
          CREATE POLICY "service_role_api_keys_policy" ON api_keys
            USING (true)
            WITH CHECK (true);

          -- Create usage log table with service_id column
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

          ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

          DROP POLICY IF EXISTS "service_role_usage_logs_policy" ON api_usage_logs;
          CREATE POLICY "service_role_usage_logs_policy" ON api_usage_logs
            USING (true)
            WITH CHECK (true);

          -- Create function to update last_used_at
          CREATE OR REPLACE FUNCTION update_api_key_last_used()
          RETURNS TRIGGER AS $$
          BEGIN
              UPDATE api_keys
              SET last_used_at = NOW()
              WHERE id = NEW.api_key_id;
              RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;

          -- Create trigger
          DROP TRIGGER IF EXISTS update_api_key_last_used_trigger ON api_usage_logs;
          CREATE TRIGGER update_api_key_last_used_trigger
          AFTER INSERT ON api_usage_logs
          FOR EACH ROW
          EXECUTE FUNCTION update_api_key_last_used();
        `;
            // Execute the query using either execute_sql or exec_sql
            if (useExecSql) {
                await this.supabase.rpc('exec_sql', { query: sqlQuery });
            }
            else {
                await this.supabase.rpc('execute_sql', { sql_query: sqlQuery });
            }
        }
        catch (error) {
            console.error('Error setting up API key tables:', error);
            // Try a direct approach to create tables as fallback
            try {
                // Check if api_usage_logs exists already
                const { error: checkError } = await this.supabase
                    .from('api_usage_logs')
                    .select('count')
                    .limit(1);
                if (checkError && checkError.code === '42P01') {
                    console.error('api_usage_logs table does not exist and could not be created automatically.');
                    console.error('Please run the SQL manually in your Supabase SQL Editor to create required tables.');
                }
            }
            catch (fallbackError) {
                // Ignore errors in the fallback check
            }
            throw new Error(`Failed to set up API key tables: ${error.message}`);
        }
    }
    async authenticateUser(address, signature, message) {
        if (!this.config.enabled) {
            throw new Error('API key functionality is not enabled');
        }
        try {
            let isAuthenticated = false;
            // Use only SkyNet authentication
            try {
                const skyNode = await (0, init_1.getSkyNode)();
                if (!skyNode) {
                    throw new Error('SkyNode is not initialized. Please initialize SkyNode before authentication.');
                }
                // Create a new instance of SkyUrsulaService with empty string and the initialized skyNode
                const ursulaService = new SkyUrsulaService_1.default("", skyNode);
                // Create auth payload
                const authPayload = {
                    message,
                    signature,
                    userAddress: address
                };
                // Authenticate using the SkyNet UrsulaService
                const verificationResult = await ursulaService.authenticateSignature(authPayload);
                if (verificationResult && verificationResult.success) {
                    console.log(`Signature verified by SkyNet for address: ${address}`);
                    isAuthenticated = true;
                }
                else {
                    throw new Error('SkyNet signature verification failed');
                }
            }
            catch (skynetVerifyError) {
                console.error('SkyNet authentication error:', skynetVerifyError);
                throw new Error(`SkyNet authentication failed: ${skynetVerifyError instanceof Error ? skynetVerifyError.message : String(skynetVerifyError)}`);
            }
            // Generate JWT token
            const token = jsonwebtoken_1.default.sign({ address: address.toLowerCase() }, this.config.jwtSecret || 'your-jwt-secret-key', { expiresIn: '24h' });
            // Store authentication info in memory
            authenticatedWallets[address.toLowerCase()] = {
                token,
                authenticatedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            };
            return { token };
        }
        catch (error) {
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }
    /**
     * Verify if a wallet address has been authenticated
     * @param walletAddress The wallet address to check
     * @param token Optional JWT token to validate
     */
    isAuthenticated(walletAddress, token) {
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
     */
    async generateApiKey(walletAddress, token) {
        if (!this.config.enabled) {
            return { error: 'API key functionality is not enabled' };
        }
        try {
            // Verify the wallet has been authenticated
            if (!this.isAuthenticated(walletAddress, token)) {
                return { error: 'Wallet address must be authenticated with SkyNet before generating an API key' };
            }
            // Check for existing active key
            const existingKey = await this.getApiKey(walletAddress);
            if (existingKey.apiKey) {
                return existingKey;
            }
            const apiKey = this.createUniqueApiKey(walletAddress);
            const { error } = await this.supabase
                .from('api_keys')
                .insert([{
                    key: apiKey,
                    wallet_address: walletAddress.toLowerCase(),
                    is_active: true
                }]);
            if (error)
                throw error;
            return { apiKey };
        }
        catch (error) {
            return { error: `Failed to generate API key: ${error.message}` };
        }
    }
    async getApiKey(walletAddress) {
        if (!this.config.enabled) {
            return { error: 'API key functionality is not enabled' };
        }
        try {
            const { data, error } = await this.supabase
                .from('api_keys')
                .select('key')
                .eq('wallet_address', walletAddress.toLowerCase())
                .eq('is_active', true)
                .maybeSingle();
            if (error)
                throw error;
            return { apiKey: data?.key };
        }
        catch (error) {
            return { error: `Failed to get API key: ${error.message}` };
        }
    }
    async validateApiKey(apiKey, req) {
        if (!this.config.enabled)
            return true;
        try {
            const { data, error } = await this.supabase
                .from('api_keys')
                .select('id, is_active')
                .eq('key', apiKey)
                .single();
            if (error)
                throw error;
            if (data && data.is_active) {
                // Log API usage with default endpoint
                await this.logApiUsage(data.id, '/natural-request');
                // If request object is provided, attach the API key ID for later use
                if (req) {
                    req.apiKeyId = data.id;
                }
                return true;
            }
            return false;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Validate API key for service access and log the usage
     * This is a convenience method that combines validation and logging
     */
    async validateApiKeyForService(apiKey, serviceId, serviceUrl) {
        if (!this.config.enabled)
            return true;
        try {
            const { data, error } = await this.supabase
                .from('api_keys')
                .select('id, is_active')
                .eq('key', apiKey)
                .single();
            if (error)
                throw error;
            if (data && data.is_active) {
                // Log API usage with service-specific endpoint
                await this.logApiUsage(data.id, serviceUrl, serviceId);
                return true;
            }
            return false;
        }
        catch (error) {
            return false;
        }
    }
    async revokeApiKey(walletAddress, apiKey) {
        if (!this.config.enabled) {
            return { error: 'API key functionality is not enabled' };
        }
        try {
            const { error } = await this.supabase
                .from('api_keys')
                .update({
                is_active: false,
                revoked_at: new Date().toISOString()
            })
                .eq('key', apiKey)
                .eq('wallet_address', walletAddress.toLowerCase());
            if (error)
                throw error;
            return {};
        }
        catch (error) {
            return { error: `Failed to revoke API key: ${error.message}` };
        }
    }
    /**
     * Log API usage in the api_usage_logs table
     * @param apiKeyId The API key ID
     * @param endpoint The endpoint or service URL being accessed
     * @param serviceId Optional service ID for tracking specific services
     */
    async logApiUsage(apiKeyId, endpoint = '/natural-request', serviceId) {
        try {
            // Attempt to insert the log entry
            const { error } = await this.supabase
                .from('api_usage_logs')
                .insert([{
                    api_key_id: apiKeyId,
                    endpoint: endpoint,
                    method: 'POST', // Default method
                    status_code: 200, // Default status code
                    service_id: serviceId // Optional service ID tracking
                }]);
            
            // If error occurs, check if it's due to missing table
            if (error) {
                if (error.code === '42P01') { // Table doesn't exist error
                    console.error('api_usage_logs table does not exist. Attempting to create it...');
                    // Try to set up the tables again
                    try {
                        await this.setupApiKeyTables();
                        
                        // Retry log insertion after table creation
                        await this.supabase
                            .from('api_usage_logs')
                            .insert([{
                                api_key_id: apiKeyId,
                                endpoint: endpoint,
                                method: 'POST',
                                status_code: 200,
                                service_id: serviceId
                            }]);
                        
                        console.log('Log inserted successfully after creating table');
                    } catch (setupError) {
                        console.error('Failed to create api_usage_logs table:', setupError);
                    }
                } else {
                    console.error('Failed to log API usage:', error);
                }
            }
        }
        catch (error) {
            console.error('Failed to log API usage:', error);
            // Don't throw error as this is not critical
        }
    }
    createUniqueApiKey(walletAddress) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2);
        return `sk_${walletAddress.substring(2, 8)}_${timestamp}_${random}`;
    }
    /**
     * Register a service for API usage tracking
     * This just logs service information but doesn't create a database entry
     */
    async registerService(serviceDetails) {
        if (!this.config.enabled) {
            throw new Error('API key functionality is not enabled');
        }
        return this.serviceManagement.registerService(serviceDetails);
    }
    /**
     * Log service access - uses logApiUsage internally
     */
    async logServiceAccess(apiKeyId, serviceId, serviceUrl) {
        if (!this.config.enabled)
            return;
        // Use the consolidated logApiUsage method
        await this.logApiUsage(apiKeyId, serviceUrl, serviceId);
    }
    /**
     * Set the SkyNode instance for authentication
     */
    async setSkyNode(skyNode) {
        if (!skyNode) {
            throw new Error('Invalid SkyNode instance provided');
        }
        console.log('Setting SkyNode in ApiKeyService');
        // Make SkyNode accessible for authentication
        global.skyNode = skyNode;
        // Update the getSkyNode function to return this instance
        const oldGetSkyNode = global.getSkyNode;
        global.getSkyNode = async () => {
            return skyNode;
        };
        return Promise.resolve();
    }
}
exports.ApiKeyService = ApiKeyService;
