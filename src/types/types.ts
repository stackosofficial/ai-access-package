import { AccountNFT } from "@decloudlabs/skynet/lib/types/types";
import { Request, Response } from "express";

export interface ENVDefinition {
  JSON_RPC_PROVIDER: string;
  WALLET_PRIVATE_KEY: string;
  SUBNET_ID: string;
  POSTGRES_URL: string;
  SERVER_COST_CONTRACT_ADDRESS: string;
  OPENAI_API_KEY: string;
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
