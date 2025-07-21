import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import BalanceRunMain from "../services/balance/balanceRunMain";
import { ENVDefinition, NFTCosts, ResponseHandler, ApiKeyConfig } from "../types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { checkBalance } from "../middleware/checkBalance";
import { protect } from "../middleware/auth";
import { parseAuth } from "../middleware/parseAuth";
import { generateApiKey, revokeApiKey } from "../auth/apiKeyService";
import { AuthService, createAuthService } from "../auth/authService";
import { DatabaseMigration } from "../database/databaseMigration";
import { getAllTableSchemas } from "../database/tableSchemas";
import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { Pool } from "pg";

let skyNode: SkyMainNodeJS;
let authService: AuthService | null = null;
let globalPostgresUrl: string | null = null;

export const setupSkyNode = async (skyNodeParam: SkyMainNodeJS) => {
  skyNode = skyNodeParam;
};

export const getSkyNode = () => {
  return skyNode;
};

// Global function to get PostgreSQL URL
export const getGlobalPostgresUrl = (): string => {
  if (!globalPostgresUrl) {
    throw new Error('PostgreSQL URL not initialized. Make sure to call initAIAccessPoint first.');
  }
  return globalPostgresUrl;
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

// Enhanced BalanceRunMain type that includes automatic system prompt handling
export interface EnhancedBalanceRunMain extends BalanceRunMain {
  callAIModel: (
    prompt: string,
    accountNFT: any,
    system_prompt?: string,
    model?: string[],
    temperature?: number,
    response_type?: string,
    response_schema?: any
  ) => Promise<any>;
}

// Define the type for the runNaturalFunction parameter to make it explicit
export type RunNaturalFunctionType = (
  req: Request,
  res: Response,
  balanceRunMain: EnhancedBalanceRunMain,
  responseHandler: ResponseHandler
) => Promise<void>;


export interface AIAccessPointConfig {
  apiKeyConfig?: ApiKeyConfig;
  authServiceClass?: new () => AuthService;  // Changed: accept class instead of instance
}

export const initAIAccessPoint = async (
  env: ENVDefinition,
  skyNodeParam: SkyMainNodeJS,
  app: express.Application,
  runNaturalFunction: RunNaturalFunctionType,
  runUpdate: boolean,
  upload?: multer.Multer,
  config?: AIAccessPointConfig
): Promise<APICallReturn<BalanceRunMain>> => {
  try {
    await setupSkyNode(skyNodeParam);
    globalPostgresUrl = env.POSTGRES_URL;

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
    balanceRunMain.envConfig.env.SERVER_COST_CONTRACT_ADDRESS = contractAddress;

    await balanceRunMain.setup();
    if (runUpdate) {
      balanceRunMain.update();
    }

    const pool = new Pool({
      connectionString: env.POSTGRES_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });

    // Test the database connection
    try {
      await pool.query('SELECT 1');
      console.log("✅ Database connection established successfully");
    } catch (error) {
      console.error("❌ Database connection failed:", error);
      throw new Error(`Database connection failed: ${error}`);
    }


    // Initialize auth service only if explicitly provided
    if (config?.authServiceClass) {
      authService = new config.authServiceClass();
      console.log("✅ Custom auth service initialized successfully");
    } else {
      // Don't create default auth service - keep it null
      authService = null;
      console.log("ℹ️ No auth service configured - authentication will be skipped");
    }

    // Initialize all database tables using centralized migration
    const migration = new DatabaseMigration(pool);
    const allTableSchemas = getAllTableSchemas(env.SUBNET_ID);
    await migration.migrateTables(allTableSchemas);

    // Handler function that wraps runNaturalFunction with ResponseHandler
    const handleRequest = async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Only check auth if auth service is explicitly provided
        if (authService && req.body.accountNFT?.nftID && req.body.walletAddress) {
          const isAuthenticated = await authService.checkAuthStatus(req.body.walletAddress, req.body.accountNFT.nftID);

          if (!isAuthenticated) {
            // Generate auth link and send it back instead of proceeding
            try {
              const authLink = await authService.generateAuthLink(req.body.walletAddress, req.body.accountNFT.nftID);
              return res.status(200).json({
                success: true,
                message: "Authentication required, please authenticate using this link: " + authLink,
                data: {
                  authLink: authLink,
                  message: "Please authenticate using the provided link",
                  isAuthenticated: false
                }
              });
            } catch (authError: any) {
              console.error("❌ Error generating auth link:", authError);
              return res.status(500).json({
                success: false,
                error: "Failed to generate authentication link"
              });
            }
          }
        }

        // Extract systemPrompt from request payload if present
        const userSystemPrompt = req.body.systemPrompt || req.body.system_prompt;
        
        // Create a wrapper for balanceRunMain.callAIModel that automatically includes user's system prompt
        const enhancedBalanceRunMain: EnhancedBalanceRunMain = {
          ...balanceRunMain,
          callAIModel: async (
            prompt: string,
            accountNFT: any,
            system_prompt?: string,
            model?: string[],
            temperature?: number,
            response_type?: string,
            response_schema?: any
          ) => {
            // Get the current user system prompt from the request (in case it changed)
            const currentUserSystemPrompt = req.body.systemPrompt || req.body.system_prompt;
            
            // Combine user's system prompt with any existing system prompt
            let combinedSystemPrompt = system_prompt || '';
            if (currentUserSystemPrompt) {
              combinedSystemPrompt = combinedSystemPrompt 
                ? `${combinedSystemPrompt}\n\n${currentUserSystemPrompt}`
                : currentUserSystemPrompt;
            }
            
            return balanceRunMain.callAIModel(
              prompt,
              accountNFT,
              combinedSystemPrompt,
              model,
              temperature,
              response_type,
              response_schema
            );
          }
        };

        const responseHandler = new ResponseHandlerImpl(req, res);
        await runNaturalFunction(req, res, enhancedBalanceRunMain, responseHandler);
      } catch (error: any) {
        console.error("❌ Error in request handler:", error);
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
        async (req: Request, res: Response, next: NextFunction) => {
          await protect(req, res, next, skyNodeParam, pool);
        },
        async (req: Request, res: Response, next: NextFunction) =>
          await checkBalance(req, res, next, contractAddress, skyNodeParam),
        handleRequest
      );
    } else {
      app.post(
        "/natural-request",
        parseAuth,
        async (req: Request, res: Response, next: NextFunction) => {
          await protect(req, res, next, skyNodeParam, pool);
        },
        async (req: Request, res: Response, next: NextFunction) =>
          await checkBalance(req, res, next, contractAddress, skyNodeParam),
        handleRequest
      );
    }

    // Add auth-link endpoint only if auth service is configured
    if (authService) {
      app.post("/auth-link", parseAuth, async (req: Request, res: Response, next: NextFunction) => {
        await protect(req, res, next, skyNodeParam, pool);
      },
        async (req: Request, res: Response, next: NextFunction) =>
          await checkBalance(req, res, next, contractAddress, skyNodeParam),
        async (req: Request, res: Response, next: NextFunction) => {
          try {
            const userAddress = req.body.walletAddress;
            const nftId = req.body.accountNFT.nftID;

            if (!userAddress || !nftId) {
              return res.status(400).json({
                success: false,
                error: "userAddress and nftId are required"
              });
            }

            const authLink = await authService!.generateAuthLink(userAddress, nftId);

            res.json({
              success: true,
              data: { link: authLink }
            });
          } catch (error: any) {
            console.error("❌ Error in auth-link handler:", error);
            res.status(500).json({
              success: false,
              error: error.message || "Internal server error"
            });
          }
        });
    }

    // Add auth-status endpoint only if auth service is configured
    if (authService) {
      app.post("/auth-status", parseAuth, async (req: Request, res: Response, next: NextFunction) => {
        await protect(req, res, next, skyNodeParam, pool);
      },
        async (req: Request, res: Response, next: NextFunction) =>
          await checkBalance(req, res, next, contractAddress, skyNodeParam),
        async (req: Request, res: Response, next: NextFunction) => {
          try {
            const userAddress = req.body.userAuthPayload?.userAddress;
            const nftId = req.body.accountNFT?.nftID;

            if (!userAddress || !nftId) {
              return res.status(400).json({
                success: false,
                error: "userAddress and nftId are required"
              });
            }

            const isAuthenticated = await authService!.checkAuthStatus(userAddress, nftId);

            res.json({
              success: true,
              data: isAuthenticated
            });
          } catch (error: any) {
            console.error("❌ Error in auth-status handler:", error);
            res.status(500).json({
              success: false,
              error: error.message || "Internal server error"
            });
          }
        });
    }

    // Add API key generation endpoint using masterValidation
    app.post("/generate-api-key",
      parseAuth,
      async (req: Request, res: Response, next: NextFunction) => {
        await protect(req, res, next, skyNodeParam, pool);
      },
      async (req: Request, res: Response, next: NextFunction) =>
        await checkBalance(req, res, next, contractAddress, skyNodeParam),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const result = await generateApiKey(req, pool);
          if (result.error) {
            return res.status(400).json({
              success: false,
              error: result.error
            });
          }

          res.json({
            success: true,
            data: {
              apiKey: result.apiKey
            }
          });
        } catch (error: any) {
          res.status(500).json({
            success: false,
            error: error.message || "Internal server error"
          });
        }
      });

    // Add API key revocation endpoint using masterValidation
    app.post("/revoke-api-key", parseAuth, async (req: Request, res: Response, next: NextFunction) => {
      await protect(req, res, next, skyNodeParam, pool);
    },
      async (req: Request, res: Response, next: NextFunction) =>
        await checkBalance(req, res, next, contractAddress, skyNodeParam),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const walletAddress = req.body.walletAddress;
          const { apiKey } = req.body;

          if (!walletAddress) {
            return res.status(400).json({
              success: false,
              error: "Wallet address not available from authentication"
            });
          }

          if (!apiKey) {
            return res.status(400).json({
              success: false,
              error: "apiKey is required"
            });
          }

          const result = await revokeApiKey(walletAddress, apiKey, pool);

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
          console.error("❌ Error in revoke-api-key handler:", error);
          res.status(500).json({
            success: false,
            error: error.message || "Internal server error"
          });
        }
      });

    // Add auth revocation endpoint only if auth service is configured
    if (authService) {
      app.post("/revoke-auth", parseAuth, async (req: Request, res: Response, next: NextFunction) => {
        await protect(req, res, next, skyNodeParam, pool);
      },
        async (req: Request, res: Response, next: NextFunction) =>
          await checkBalance(req, res, next, contractAddress, skyNodeParam),
        async (req: Request, res: Response, next: NextFunction) => {
          try {
            const userAddress = req.body.walletAddress;
            const nftId = req.body.accountNFT.nftID;

            if (!userAddress || !nftId) {
              return res.status(400).json({
                success: false,
                error: "userAddress and nftId are required"
              });
            }

            await authService!.revokeAuth(userAddress, nftId);

            res.json({
              success: true,
              message: "Auth revoked successfully"
            });
          } catch (error: any) {
            console.error("❌ Error in revoke-auth handler:", error);
            res.status(500).json({
              success: false,
              error: error.message || "Internal server error"
            });
          }
        });
    }

    // Add global error handling middleware
    app.use((error: any, req: Request, res: Response, next: NextFunction) => {
      console.error("❌ [GLOBAL ERROR HANDLER] Unhandled error:", error);
      console.error("❌ [GLOBAL ERROR HANDLER] Stack trace:", error.stack);

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: "Internal server error",
          message: error.message
        });
      }
    });

    // Add 404 handler for unmatched routes
    app.use((req: Request, res: Response) => {
      console.log("⚠️ [404 HANDLER] No route matched:", req.method, req.path);
      res.status(404).json({
        success: false,
        error: "Route not found"
      });
    });

    console.log("✅ AI Access Point initialized successfully");
    return { success: true, data: balanceRunMain };
  } catch (error: any) {
    console.error("❌ Error in initAIAccessPoint:", error);
    return {
      success: false,
      data: new Error(`Failed to initialize AI Access Point: ${error.message}`),
    };
  }
};

// Export auth service for developer use
export const getAuthService = () => authService;

// Function to set auth service after initialization
export const setAuthService = (newAuthService: AuthService) => {
  authService = newAuthService;
  console.log("✅ Auth service updated successfully");
};
