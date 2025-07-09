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
  rpcUrl?: string; // RPC URL for blockchain verification
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