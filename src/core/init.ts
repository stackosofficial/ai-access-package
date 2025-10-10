import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import BalanceRunMain from "../services/balance/balanceRunMain";
import { ENVDefinition, NFTCosts, ResponseHandler, ApiKeyConfig } from "../types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { checkBalance } from "../middleware/checkBalance";
import { protect } from "../middleware/auth";
import { parseAuth } from "../middleware/parseAuth";
import { validateSession } from "../middleware/validateSession";
import { generateApiKey, revokeApiKey } from "../auth/apiKeyService";
import { AuthService, createAuthService } from "../auth/authService";
import { DatabaseMigration } from "../database/databaseMigration";
import { getFractionalTableSchemas } from "../database/fractionalTableSchemas";
import { DataStorageService } from "../services/dataStorage/dataStorageService";
import SkynetFractionalPaymentService from "../services/payment/skynetFractionalPaymentService";
import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { Pool } from "pg";

let skyNode: SkyMainNodeJS;
let authService: AuthService | null = null;
let globalPostgresUrl: string | null = null;
let dataStorageService: DataStorageService | null = null;

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

    // Include session token in response if it was generated
    const responseData = { ...data };
    if (this.req.generatedSessionToken) {
      responseData.sessionToken = this.req.generatedSessionToken;
      responseData.sessionExpiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now
      console.log('🔑 Including session token in response');
    }

    if (this.isStreaming) {
      // Final message for streaming
      this.res.write(`data: ${JSON.stringify({ ...responseData, done: true })}\n\n`);
      this.res.end();
    } else {
      // Regular JSON response
      this.res.json(responseData);
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
  // Inherits the new callAIModel signature from BalanceRunMain
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
  dataStorageValidationFunction?: (
    data: any,
    accountNFT: { collectionID: string; nftID: string },
    serviceName: string,
    referenceId: string
  ) => Promise<{ isValid: boolean; error?: string; transformedData?: any }>;
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

    const pool = new Pool({
      connectionString: env.POSTGRES_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });

    // Initialize all database tables using centralized migration BEFORE creating services
    const migration = new DatabaseMigration(pool);
    const fractionalTableSchemas = getFractionalTableSchemas();
    await migration.migrateTables(fractionalTableSchemas);

    // Now create the balance service after tables exist
    const balanceRunMain = new BalanceRunMain(env, 60 * 1000, skyNodeParam, pool);

    // No longer need to get contract address from old system
    // We use hardcoded fractional contract address in SkynetFractionalPaymentService

    await balanceRunMain.setup();
    if (runUpdate) {
      balanceRunMain.update();
    }

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

    // Initialize data storage service
    dataStorageService = new DataStorageService(pool);
    if (config?.dataStorageValidationFunction) {
      dataStorageService.setValidationFunction(config.dataStorageValidationFunction);
      console.log("✅ Data storage service initialized with custom validation function");
    } else {
      console.log("✅ Data storage service initialized without custom validation");
    }


    // Handler function that wraps runNaturalFunction with ResponseHandler
    const handleRequest = async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Only check auth if auth service is explicitly provided
        if (authService && req.body.accountNFT?.nftID && req.body.walletAddress) {
          const isAuthenticated = await authService.checkAuthStatus(req);

          if (!isAuthenticated) {
            // Generate auth link and send it back instead of proceeding
            try {
              const authLink = await authService.generateAuthLink(req);
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

        // Create a wrapper for balanceRunMain.callAIModel that automatically includes user's system prompt
        const enhancedBalanceRunMain: EnhancedBalanceRunMain = {
          ...balanceRunMain,
          callAIModel: async (params, accountNFT) => {
            // Get the current user system prompt from the request (in case it changed) - handles both JSON and form data
            const currentUserSystemPrompt = req.body.systemPrompt || req.body.system_prompt || req.body['systemPrompt'] || req.body['system_prompt'];

            // Combine user's system prompt with any existing system prompt
            let combinedSystemPrompt = params.system_prompt || '';
            if (currentUserSystemPrompt) {
              combinedSystemPrompt = combinedSystemPrompt
                ? `${combinedSystemPrompt}\n\n${currentUserSystemPrompt}`
                : currentUserSystemPrompt;
            }

            return balanceRunMain.callAIModel(
              {
                ...params,
                system_prompt: combinedSystemPrompt
              },
              accountNFT
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

    // Smart routing middleware - chooses between session and API key validation
    const smartAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
      if (req.isSessionRequest) {
        // Use session validation (fast path)
        console.log('🚀 Using session validation (fast path)');
        await validateSession(req, res, next);
      } else {
        // Use API key validation (full validation path)
        console.log('🔐 Using API key validation (full path)');
        await protect(req, res, next, skyNodeParam, pool);
      }
    };

    // Setup routes
    if (upload) {
      app.post(
        "/natural-request",
        upload.array("files"),
        parseAuth,
        smartAuthMiddleware,
        async (req: Request, res: Response, next: NextFunction) => {
          // Only run balance check for API key requests (not session requests)
          if (!req.isSessionRequest) {
            await checkBalance(req, res, next, pool);
          } else {
            next();
          }
        },
        async (req: Request, res: Response, next: NextFunction) =>
          await checkBalance(req, res, next, pool),
        handleRequest
      );
    } else {
      app.post(
        "/natural-request",
        parseAuth,
        smartAuthMiddleware,
        async (req: Request, res: Response, next: NextFunction) => {
          // Only run balance check for API key requests (not session requests)
          if (!req.isSessionRequest) {
            await checkBalance(req, res, next, pool);
          } else {
            next();
          }
        },
        async (req: Request, res: Response, next: NextFunction) =>
          await checkBalance(req, res, next, pool),
        handleRequest
      );
    }

    // Add auth-link endpoint only if auth service is configured
    if (authService) {
      app.post("/auth-link", parseAuth,
        async (req: Request, res: Response, next: NextFunction) => {
          await protect(req, res, next, skyNodeParam, pool);
        },
        async (req: Request, res: Response, next: NextFunction) =>
          await checkBalance(req, res, next, pool),
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

            const authLink = await authService!.generateAuthLink(req);

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
      app.post("/auth-status", parseAuth,
        async (req: Request, res: Response, next: NextFunction) => {
          await protect(req, res, next, skyNodeParam, pool);
        },
        async (req: Request, res: Response, next: NextFunction) =>
          await checkBalance(req, res, next, pool),
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

            const isAuthenticated = await authService!.checkAuthStatus(req);

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
        await checkBalance(req, res, next, pool),
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

    // Add session token generation endpoint
    app.post("/generate-session-token",
      parseAuth,
      async (req: Request, res: Response, next: NextFunction) => {
        await protect(req, res, next, skyNodeParam, pool);
      },
      async (req: Request, res: Response, next: NextFunction) =>
        await checkBalance(req, res, next, pool),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          // Check if session token was generated by protect middleware
          if (!req.generatedSessionToken) {
            return res.status(400).json({
              success: false,
              error: "Failed to generate session token - API key validation may have failed"
            });
          }

          res.json({
            success: true,
            data: {
              sessionToken: req.generatedSessionToken,
              sessionExpiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours from now
              walletAddress: req.body.walletAddress,
              accountNFT: req.body.accountNFT,
              agentCollection: req.body.agentCollection
            }
          });
        } catch (error: any) {
          console.error("❌ Error in generate-session-token handler:", error);
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
        await checkBalance(req, res, next, pool),
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
          await checkBalance(req, res, next, pool),
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

            await authService!.revokeAuth(req);

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

    // Add withdraw funds endpoint (backend wallet only)
    app.post("/withdraw-funds", parseAuth, async (req: Request, res: Response, next: NextFunction) => {
      await protect(req, res, next, skyNodeParam, pool);
    },
      async (req: Request, res: Response, next: NextFunction) =>
        await checkBalance(req, res, next, pool),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const { userAddress, amount } = req.body;

          if (!userAddress) {
            return res.status(400).json({
              success: false,
              error: "userAddress is required"
            });
          }

          if (!amount) {
            return res.status(400).json({
              success: false,
              error: "amount is required"
            });
          }

          // Initialize payment service
          const paymentService = new SkynetFractionalPaymentService();

          // Check if current signer is backend wallet
          const isBackendResponse = await paymentService.isCurrentSignerBackendWallet();
          if (!isBackendResponse.success || !isBackendResponse.data) {
            return res.status(403).json({
              success: false,
              error: "Access denied: Only backend wallet can withdraw funds"
            });
          }

          // Get user's contract balance
          const contractBalanceResponse = await paymentService.getUserDepositBalance(userAddress);
          if (!contractBalanceResponse.success) {
            return res.status(500).json({
              success: false,
              error: `Failed to get user contract balance: ${contractBalanceResponse.data}`
            });
          }

          // Get total pending costs from database for this user across all subnets
          const pendingCostsQuery = `
            SELECT COALESCE(SUM(CAST(amount AS BIGINT)), 0) as total_pending
            FROM fractional_payments 
            WHERE api_key = $1
          `;
          
          const pendingCostsResult = await pool.query(pendingCostsQuery, [userAddress]);
          const totalPendingCosts = BigInt(pendingCostsResult.rows[0].total_pending || "0");

          // Calculate available balance: contractBalance - databaseCosts
          const contractBalance = contractBalanceResponse.data;
          const availableBalance = contractBalance - totalPendingCosts;

          // Check minimum balance requirement
          const minimumBalance = BigInt(process.env.MINIMUM_BALANCE || "0");
          if (minimumBalance > 0 && availableBalance < minimumBalance) {
            return res.status(400).json({
              success: false,
              error: `Insufficient available balance. Available: ${availableBalance} wei, Minimum required: ${minimumBalance} wei, Pending costs: ${totalPendingCosts} wei`
            });
          }

          // Check if withdrawal amount is valid
          const withdrawalAmount = BigInt(amount);
          if (withdrawalAmount <= 0) {
            return res.status(400).json({
              success: false,
              error: "Withdrawal amount must be greater than 0"
            });
          }

          if (withdrawalAmount > availableBalance) {
            return res.status(400).json({
              success: false,
              error: `Withdrawal amount (${withdrawalAmount} wei) exceeds available balance (${availableBalance} wei)`
            });
          }

          // Execute withdrawal
          const withdrawResponse = await paymentService.withdrawUserFunds(userAddress, amount);
          if (!withdrawResponse.success) {
            return res.status(500).json({
              success: false,
              error: `Failed to withdraw funds: ${withdrawResponse.data}`
            });
          }

          console.log(`✅ Successfully withdrew ${amount} wei for user ${userAddress}. Available balance: ${availableBalance} wei`);

          res.json({
            success: true,
            message: `Successfully withdrew ${amount} wei`,
            data: {
              withdrawnAmount: amount,
              contractBalance: contractBalance.toString(),
              pendingCosts: totalPendingCosts.toString(),
              availableBalance: availableBalance.toString(),
              remainingBalance: (availableBalance - withdrawalAmount).toString()
            }
          });
        } catch (error: any) {
          console.error("❌ Error in withdraw-funds handler:", error);
          res.status(500).json({
            success: false,
            error: error.message || "Internal server error"
          });
        }
      });

    // Fetch data endpoint
    app.post("/fetch-data", parseAuth, async (req: Request, res: Response, next: NextFunction) => {
      await protect(req, res, next, skyNodeParam, pool);
    },
      async (req: Request, res: Response, next: NextFunction) =>
        await checkBalance(req, res, next, pool),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const { referenceId } = req.body;
          const collectionId = req.body.accountNFT.collectionID;
          const nftId = req.body.accountNFT.nftID;

          if (!referenceId) {
            return res.status(400).json({
              success: false,
              error: "referenceId is required in request body"
            });
          }

          const result = await dataStorageService!.fetchData(
            collectionId,
            nftId,
            referenceId
          );

          if (!result.success) {
            return res.status(404).json({
              success: false,
              error: result.error
            });
          }

          res.json({
            success: true,
            data: result.data
          });
        } catch (error: any) {
          console.error("❌ Error in fetch-data handler:", error);
          res.status(500).json({
            success: false,
            error: error.message || "Internal server error"
          });
        }
      });



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

// Export data storage service for developer use
export const getDataStorageService = () => dataStorageService;

// Function to set data storage validation function after initialization
export const setDataStorageValidationFunction = (
  validationFunction: (
    data: any,
    accountNFT: { collectionID: string; nftID: string },
    serviceName: string,
    referenceId: string
  ) => Promise<{ isValid: boolean; error?: string; transformedData?: any }>
) => {
  if (dataStorageService) {
    dataStorageService.setValidationFunction(validationFunction);
    console.log("✅ Data storage validation function updated successfully");
  } else {
    console.error("❌ Data storage service not initialized");
  }
};
