import { AccountNFT } from "@decloudlabs/skynet/lib/types/types";
import { Request, Response } from "express";

export interface ENVDefinition {
  JSON_RPC_PROVIDER: string;
  WALLET_PRIVATE_KEY: string;
  SUBNET_ID: string;
  POSTGRES_URL: string;
  SERVER_COST_CONTRACT_ADDRESS: string;
}

export interface NFTCosts {
  accountNFT: AccountNFT;
  costs: string;
  docId?: string;
  timestamp?: any;
}

export interface AIModelResponse {
  content: string;
}

export interface ResponseHandler {
  sendUpdate(data: any): void;
  sendFinalResponse(data: any): void;
  sendError(error: string | Error, statusCode?: number): void;
  isStreamingRequest(): boolean;

}

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseKey: string;
  jwtSecret?: string;
}

export interface ApiKeyConfig {
  enabled: boolean;
  jwtSecret?: string;
  collectionId?: string;
}

export interface ApiKeyResponse {
  apiKey?: string;
  error?: string;
}

/**
 * Information about an authenticated wallet's token
 */
export interface AuthTokenInfo {
  token: string;
  authenticatedAt: string;
  expiresAt: string;
}

// API Key Data type - matches database schema with string timestamps
export interface ApiKeyData {
  id: string;
  key: string;
  wallet_address: string;
  nft_collection_id: string;
  nft_id: string;
  is_active: boolean;
  created_at: string;        // Database returns string timestamps
  revoked_at?: string | null;
  last_used_at?: string | null;
}

export interface IApiKeyService {
  validateApiKey: (apiKey: string) => Promise<boolean>;
  getApiKeyDetails: (apiKey: string) => Promise<ApiKeyData>;
}

// Global API Key Service Interface
declare global {
  var apiKeyService: {
    validateApiKey: (apiKey: string) => Promise<boolean>;
    getApiKeyDetails: (apiKey: string) => Promise<ApiKeyData | null>;
    generateApiKeyFromAuth: (walletAddress: string, collectionID: string, nftID: string) => Promise<ApiKeyResponse>;
    getUserApiKeys: (walletAddress: string) => Promise<{ apiKeys?: ApiKeyData[], error?: string }>;
    revokeApiKey: (walletAddress: string, apiKey: string) => Promise<ApiKeyResponse>;
    generateApiKey: (walletAddress: string, collectionID: string, nftID: string, token?: string) => Promise<ApiKeyResponse>;
    getApiKey: (walletAddress: string, collectionID: string, nftID: string) => Promise<ApiKeyResponse>;
    setupTables: () => Promise<void>;
    logApiUsage: (apiKeyId: string, endpoint?: string, serviceId?: string) => Promise<void>;
  };
}