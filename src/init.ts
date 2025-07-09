import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import BalanceRunMain from "./balanceRunMain";
import { ENVDefinition, NFTCosts, ResponseHandler, ApiKeyConfig } from "./types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { checkBalance } from "./middleware/checkBalance";
import { protect } from "./middleware/auth";
import { parseAuth } from "./middleware/parseAuth";
import { validateApiKey } from "./middleware/validateApiKey";
import { ApiKeyService } from "./apiKeyService";
import { AuthService, createAuthService } from "./services/authService";
import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { Pool } from "pg";

let skyNode: SkyMainNodeJS;
let authService: AuthService | null = null;

export const setupSkyNode = async (skyNodeParam: SkyMainNodeJS) => {
  skyNode = skyNodeParam;
};

export const getSkyNode = () => {
  return skyNode;
};

// Response handler class to unify regular and streaming responses
export class ResponseHandlerImpl implements ResponseHandler {
  private req: Request;
  private res: Response;
  private isStreaming: boolean;
  private hasStarted: boolean;
  private hasEnded: boolean;

  constructor(req: Request, res: Response) {
    this.req = req;
    this.res = res;
    this.isStreaming = req.query.stream === 'true';
    this.hasStarted = false;
    this.hasEnded = false;
    
    // Setup streaming headers if needed
    if (this.isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }
  }
  // Send partial update (only in streaming mode)
  sendUpdate(data: any): void {
    if (!this.isStreaming || this.hasEnded) return;
    
    this.hasStarted = true;
    this.res.write(`data: ${JSON.stringify(data)}\n\n`);
    // Check if flush exists (some Express response objects include it via compression middleware)
    if (typeof (this.res as any).flush === 'function') {
      (this.res as any).flush();
    }
  }

  // Send final response and end
  sendFinalResponse(data: any): void {
    if (this.hasEnded) return;
    this.hasEnded = true;
    
    if (this.isStreaming) {
      // Final message for streaming
      this.res.write(`data: ${JSON.stringify({ ...data, done: true })}\n\n`);
      this.res.end();
    } else {
      // Regular JSON response
      this.res.json(data);
    }
  }

  // Send an error response
  sendError(error: string | Error, statusCode: number = 500): void {
    if (this.hasEnded) return;
    this.hasEnded = true;
    
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    if (this.isStreaming) {
      this.res.write(`data: ${JSON.stringify({ error: errorMessage, done: true })}\n\n`);
      this.res.end();
    } else {
      this.res.status(statusCode).json({ error: errorMessage });
    }
  }

  // Check if this is a streaming request
  isStreamingRequest(): boolean {
    return this.isStreaming;
  }
}

// Legacy type for backward compatibility
export type LegacyRunNaturalFunctionType = (
  req: Request,
  res: Response,
  balanceRunMain: BalanceRunMain
) => Promise<void>;

// Define the type for the runNaturalFunction parameter to make it explicit
export type RunNaturalFunctionType = (
  req: Request,
  res: Response,
  balanceRunMain: BalanceRunMain,
  responseHandler: ResponseHandler
) => Promise<void>;

// Adapter function to convert legacy function to new function signature
export function adaptLegacyFunction(legacyFn: LegacyRunNaturalFunctionType): RunNaturalFunctionType {
  return async (req: Request, res: Response, balanceRunMain: BalanceRunMain, responseHandler: ResponseHandler) => {
    await legacyFn(req, res, balanceRunMain);
  };
}

export interface AIAccessPointConfig {
  apiKeyConfig?: ApiKeyConfig;
  authService?: AuthService;
}

export const initAIAccessPoint = async (
  env: ENVDefinition,
  skyNodeParam: SkyMainNodeJS,
  app: express.Application,
  runNaturalFunction: RunNaturalFunctionType | LegacyRunNaturalFunctionType,
  runUpdate: boolean,
  upload?: multer.Multer,
  config?: AIAccessPointConfig
): Promise<APICallReturn<BalanceRunMain>> => {
  try {
    await setupSkyNode(skyNodeParam);
    const balanceRunMain = new BalanceRunMain(env, 60 * 1000, skyNodeParam);

    const contAddrResp = await skyNode.contractService.callContractRead<
      string,
      string
    >(
      skyNode.contractService.BalanceSettler.getSubnetPriceCalculator(
        balanceRunMain.envConfig.env.SUBNET_ID
      ),
      (res) => res
    );
    if (contAddrResp.success == false) return contAddrResp;
    const contractAddress = contAddrResp.data;
    console.log("contractAddress", contractAddress);
    balanceRunMain.envConfig.env.SERVER_COST_CONTRACT_ADDRESS = contractAddress;

    await balanceRunMain.setup();
    if (runUpdate) {
      balanceRunMain.update();
    }

    // Initialize auth service
    if (config?.authService) {
      authService = config.authService;
      await authService.initTable();
      console.log("Auth service initialized successfully");
    } else {
      // Create default auth service if none provided
      const pool = new Pool({ connectionString: env.POSTGRES_URL });
      authService = createAuthService(pool);
      await authService.initTable();
      console.log("Default auth service initialized successfully");
    }

    // Initialize API Key Service - try to set up by default
    let apiKeyService: ApiKeyService;
    
    if (config?.apiKeyConfig) {
      // Use provided config
      console.log("Initializing API Key Service with provided config...");
      apiKeyService = new ApiKeyService(config.apiKeyConfig, env.POSTGRES_URL);
    } else {
      // Use default config - enable if POSTGRES_URL is available
      const defaultConfig: ApiKeyConfig = {
        enabled: !!env.POSTGRES_URL,
        jwtSecret: process.env.JWT_SECRET || 'default-jwt-secret',
        collectionId: process.env.DEFAULT_COLLECTION_ID
      };
      
      if (defaultConfig.enabled) {
        console.log("Initializing API Key Service with default config using PostgreSQL...");
      } else {
        console.log("API Key Service disabled - missing POSTGRES_URL");
      }
      
      apiKeyService = new ApiKeyService(defaultConfig, env.POSTGRES_URL);
    }
    
    // Always set up tables if API key service is enabled
    if (apiKeyService && (config?.apiKeyConfig?.enabled !== false)) {
      try {
        await apiKeyService.setupTables();
        
        // Set SkyNode for authentication
        await apiKeyService.setSkyNode(skyNodeParam);
        
        console.log("API Key Service initialized successfully");
      } catch (error: any) {
        console.error("Failed to initialize API Key Service:", error);
        // Continue without API key functionality
      }
    }
    
    // Always make API key service available globally for middleware
    global.apiKeyService = apiKeyService;

    // Adapt the function if it's a legacy function (has 3 parameters)
    const adaptedFunction: RunNaturalFunctionType = 
      runNaturalFunction.length <= 3 
        ? adaptLegacyFunction(runNaturalFunction as LegacyRunNaturalFunctionType)
        : runNaturalFunction as RunNaturalFunctionType;

    // Handler function that wraps runNaturalFunction with ResponseHandler
    const handleRequest = async (req: Request, res: Response, next: NextFunction) => {
      try {
        const responseHandler = new ResponseHandlerImpl(req, res);
        await adaptedFunction(req, res, balanceRunMain, responseHandler);
      } catch (error: any) {
        console.error("Error in request handler:", error);
        if (!res.headersSent) {
          res.status(500).json({ error: error.message || "Internal server error" });
        }
        next(error);
      }
    };

    // Setup routes
    if (upload) {
      app.post(
        "/natural-request",
        upload.array("files"),
        parseAuth,
        protect,
        (req: Request, res: Response, next: NextFunction) =>
          checkBalance(req, res, next, contractAddress),
        handleRequest
      );
    } else {
      app.post(
        "/natural-request",
        protect,
        (req: Request, res: Response, next: NextFunction) =>
          checkBalance(req, res, next, contractAddress),
        handleRequest
      );
    }

    // Add auth-link endpoint
    app.post("/auth-link", parseAuth, protect, async (req: Request, res: Response) => {
      try {
        const userAddress = req.body.userAuthPayload?.userAddress;
        const nftId = req.body.accountNFT?.nftID;
        
        if (!userAddress || !nftId) {
          return res.status(400).json({ 
            success: false, 
            error: "userAddress and nftId are required" 
          });
        }

        if (!authService) {
          return res.status(500).json({ 
            success: false, 
            error: "Auth service not configured" 
          });
        }

        const authLink = await authService.generateAuthLink(userAddress, nftId);
        
        res.json({ 
          success: true, 
          data: { link: authLink } 
        });
      } catch (error: any) {
        console.error("Error in auth-link handler:", error);
        res.status(500).json({ 
          success: false, 
          error: error.message || "Internal server error" 
        });
      }
    });

    // Add auth-status endpoint
    app.post("/auth-status", parseAuth, protect, async (req: Request, res: Response) => {
      try {
        const userAddress = req.body.userAuthPayload?.userAddress;
        const nftId = req.body.accountNFT?.nftID;
        
        if (!userAddress || !nftId) {
          return res.status(400).json({ 
            success: false, 
            error: "userAddress and nftId are required" 
          });
        }

        if (!authService) {
          return res.status(500).json({ 
            success: false, 
            error: "Auth service not configured" 
          });
        }

        const isAuthenticated = await authService.checkAuthStatus(userAddress, nftId);
        
        res.json({ 
          success: true, 
          data: isAuthenticated 
        });
      } catch (error: any) {
        console.error("Error in auth-status handler:", error);
        res.status(500).json({ 
          success: false, 
          error: error.message || "Internal server error" 
        });
      }
    });

    // Add API key generation endpoint using signature-based auth
    app.post("/generate-api-key", parseAuth, protect, async (req: Request, res: Response) => {
      try {
        const userAddress = req.body.userAuthPayload?.userAddress;
        const accountNFT = req.body.accountNFT;
        
        if (!userAddress) {
          return res.status(400).json({ 
            success: false, 
            error: "userAddress is required" 
          });
        }

        if (!accountNFT?.collectionID || !accountNFT?.nftID) {
          return res.status(400).json({ 
            success: false, 
            error: "accountNFT with collectionID and nftID are required" 
          });
        }

        if (!global.apiKeyService) {
          return res.status(500).json({ 
            success: false, 
            error: "API key service not available" 
          });
        }

        // Generate API key using signature-verified user data
        const result = await global.apiKeyService.generateApiKeyFromAuth(
          userAddress,
          accountNFT.collectionID,
          accountNFT.nftID
        );
        
        if (result.error) {
          return res.status(400).json({ 
            success: false, 
            error: result.error 
          });
        }

        res.json({ 
          success: true, 
          data: { 
            apiKey: result.apiKey,
            walletAddress: userAddress,
            collectionID: accountNFT.collectionID,
            nftID: accountNFT.nftID
          } 
        });
      } catch (error: any) {
        console.error("Error in generate-api-key handler:", error);
        res.status(500).json({ 
          success: false, 
          error: error.message || "Internal server error" 
        });
      }
    });

    // Add API key retrieval endpoint using signature-based auth
    app.post("/get-api-keys", parseAuth, protect, async (req: Request, res: Response) => {
      try {
        const userAddress = req.body.userAuthPayload?.userAddress;
        
        if (!userAddress) {
          return res.status(400).json({ 
            success: false, 
            error: "userAddress is required" 
          });
        }

        if (!global.apiKeyService) {
          return res.status(500).json({ 
            success: false, 
            error: "API key service not available" 
          });
        }

        // Get all API keys for the authenticated user
        const result = await global.apiKeyService.getUserApiKeys(userAddress);
        
        if (result.error) {
          return res.status(400).json({ 
            success: false, 
            error: result.error 
          });
        }

        res.json({ 
          success: true, 
          data: result.apiKeys || [] 
        });
      } catch (error: any) {
        console.error("Error in get-api-keys handler:", error);
        res.status(500).json({ 
          success: false, 
          error: error.message || "Internal server error" 
        });
      }
    });

    // Add API key revocation endpoint using signature-based auth  
    app.post("/revoke-api-key", parseAuth, protect, async (req: Request, res: Response) => {
      try {
        const userAddress = req.body.userAuthPayload?.userAddress;
        const { apiKey } = req.body;
        
        if (!userAddress) {
          return res.status(400).json({ 
            success: false, 
            error: "userAddress is required" 
          });
        }

        if (!apiKey) {
          return res.status(400).json({ 
            success: false, 
            error: "apiKey is required" 
          });
        }

        if (!global.apiKeyService) {
          return res.status(500).json({ 
            success: false, 
            error: "API key service not available" 
          });
        }

        // Revoke API key for the authenticated user
        const result = await global.apiKeyService.revokeApiKey(userAddress, apiKey);
        
        if (result.error) {
          return res.status(400).json({ 
            success: false, 
            error: result.error 
          });
        }

        res.json({ 
          success: true, 
          message: "API key revoked successfully" 
        });
      } catch (error: any) {
        console.error("Error in revoke-api-key handler:", error);
        res.status(500).json({ 
          success: false, 
          error: error.message || "Internal server error" 
        });
      }
    });

    return { success: true, data: balanceRunMain };
  } catch (error: any) {
    console.error("Error in initAIAccessPoint:", error);
    return {
      success: false,
      data: new Error(`Failed to initialize AI Access Point: ${error.message}`),
    };
  }
};

// Export auth service for developer use
export const getAuthService = () => authService;
