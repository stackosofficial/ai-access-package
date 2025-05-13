import { ApiKeyConfig, ApiKeyResponse } from './types/types';
import { ServiceDetails } from './serviceManagement';
import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
export declare class ApiKeyService {
    private supabase;
    private config;
    private serviceManagement;
    constructor(config: ApiKeyConfig);
    setupTables(): Promise<void>;
    private setupApiKeyTables;
    authenticateUser(address: string, signature: string, message: string): Promise<{
        token: string;
    }>;
    /**
     * Verify if a wallet address has been authenticated
     * @param walletAddress The wallet address to check
     * @param token Optional JWT token to validate
     */
    private isAuthenticated;
    /**
     * Generate API key for a wallet address, but only if it has been authenticated
     * @param walletAddress The wallet address to generate an API key for
     * @param token Optional JWT token for verification
     */
    generateApiKey(walletAddress: string, token?: string): Promise<ApiKeyResponse>;
    getApiKey(walletAddress: string): Promise<ApiKeyResponse>;
    validateApiKey(apiKey: string, req?: any): Promise<boolean>;
    /**
     * Validate API key for service access and log the usage
     * This is a convenience method that combines validation and logging
     */
    validateApiKeyForService(apiKey: string, serviceId: string, serviceUrl: string): Promise<boolean>;
    revokeApiKey(walletAddress: string, apiKey: string): Promise<ApiKeyResponse>;
    /**
     * Log API usage in the api_usage_logs table
     * @param apiKeyId The API key ID
     * @param endpoint The endpoint or service URL being accessed
     * @param serviceId Optional service ID for tracking specific services
     */
    logApiUsage(apiKeyId: string, endpoint?: string, serviceId?: string): Promise<void>;
    private createUniqueApiKey;
    /**
     * Register a service for API usage tracking
     * This just logs service information but doesn't create a database entry
     */
    registerService(serviceDetails: ServiceDetails): Promise<ServiceDetails>;
    /**
     * Log service access - uses logApiUsage internally
     */
    logServiceAccess(apiKeyId: string, serviceId: string, serviceUrl: string): Promise<void>;
    /**
     * Set the SkyNode instance for authentication
     */
    setSkyNode(skyNode: SkyMainNodeJS): Promise<void>;
}
