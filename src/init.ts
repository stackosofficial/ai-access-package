import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import BalanceRunMain from "./balanceRunMain";
import { ENVDefinition, NFTCosts, ResponseHandler, ApiKeyConfig } from "./types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { checkBalance } from "./middleware/checkBalance";
import { protect } from "./middleware/auth";
import { parseAuth } from "./middleware/parseAuth";
import { validateApiKey } from "./middleware/validateApiKey";
import { ApiKeyService } from "./apiKeyService";
import { createSocketIOIntegration, SocketIOConfig } from "./websocket/socketIOManager";
import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { sendAuthLink, checkAuthStatus, initAuthTable } from "./services/authService";
import { Pool } from "pg";

let skyNode: SkyMainNodeJS;
let socketIOIntegration: any = null;

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

// Add SendAuthLinkFunction type
export type SendAuthLinkFunctionType = (
  req: Request,
  res: Response,
  balanceRunMain: BalanceRunMain,
  userAddress: string,
  provider?: string
) => Promise<{
  success: boolean;
  authUrl?: string;
  error?: string;
}>;

// Adapter function to convert legacy function to new function signature
export function adaptLegacyFunction(legacyFn: LegacyRunNaturalFunctionType): RunNaturalFunctionType {
  return async (req: Request, res: Response, balanceRunMain: BalanceRunMain, responseHandler: ResponseHandler) => {
    await legacyFn(req, res, balanceRunMain);
  };
}

// Add custom type for extended Request
interface ExtendedRequest extends Request {
  user?: {
    id: string;
    wallet?: string;
  };
}

export interface AIAccessPointConfig {
  apiKeyConfig?: ApiKeyConfig;
  socketIOPath?: string;
  socketIOCors?: {
    origin: string | string[];
    methods: string[];
  };
  sendAuthLinkFunction?: SendAuthLinkFunctionType;
}

export const initAIAccessPointWithApp = async (
  env: ENVDefinition,
  skyNodeParam: SkyMainNodeJS,
  config?: AIAccessPointConfig
): Promise<{
  balanceRunMain: BalanceRunMain;
  apiKeyService?: ApiKeyService;
}> => {
  try {
    await setupSkyNode(skyNodeParam);
    const balanceRunMain = new BalanceRunMain(env, 60 * 1000, skyNodeParam);

    // Initialize API key service if config is provided
    let apiKeyService: ApiKeyService | undefined;
    if (config?.apiKeyConfig?.enabled) {
      apiKeyService = new ApiKeyService(config.apiKeyConfig);
      await apiKeyService.setupTables();
      }

    return { balanceRunMain, apiKeyService };
  } catch (error) {
    console.error('Error initializing AI Access Point:', error);
    throw error;
  }
};

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

    // Initialize auth table
    try {
      const pool = new Pool({ connectionString: env.POSTGRES_URL });
      await initAuthTable(pool);
      console.log("Auth table initialized successfully");
    } catch (authTableError) {
      console.warn("Failed to initialize auth table:", authTableError);
      // Continue without auth table - it's optional
    }

    // Initialize Socket.IO integration (enabled by default)
    try {
      const socketIOConfig: SocketIOConfig = {
        path: config?.socketIOPath || '/socket.io',
        cors: config?.socketIOCors || {
          origin: '*',
          methods: ['GET', 'POST']
        }
      };

      socketIOIntegration = createSocketIOIntegration(balanceRunMain, socketIOConfig);
      
      // Get the HTTP server from the Express app
      const server = (app as any).server || (app as any)._server;
      if (server) {
        await socketIOIntegration.initialize(server);
        console.log(`Socket.IO server initialized on path: ${socketIOConfig.path}`);
      } else {
        console.warn('Could not initialize Socket.IO: No HTTP server found. Socket.IO will be available after app.listen() is called.');
      }
    } catch (socketIOError) {
      console.warn('Socket.IO initialization failed:', socketIOError);
      // Continue without Socket.IO - it's optional
    }

    // Adapt the function if it's a legacy function (has 3 parameters)
    const adaptedFunction: RunNaturalFunctionType = 
      runNaturalFunction.length <= 3 
        ? adaptLegacyFunction(runNaturalFunction as LegacyRunNaturalFunctionType)
        : runNaturalFunction as RunNaturalFunctionType;

    // Set the natural function in Socket.IO manager for processing
    if (socketIOIntegration) {
      socketIOIntegration.setNaturalRequestFunction(adaptedFunction);
    }

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
        const { provider = 'google' } = req.body;
        const userAddress = req.body.userAuthPayload?.userAddress;
        
        if (!userAddress) {
          return res.status(400).json({ 
            success: false, 
            error: "userAddress is required" 
          });
        }

        // Check if sendAuthLinkFunction is provided
        if (!config?.sendAuthLinkFunction) {
          return res.status(500).json({ 
            success: false, 
            error: "sendAuthLinkFunction not configured" 
          });
        }

        // Call the developer's sendAuthLinkFunction
        const result = await config.sendAuthLinkFunction(req, res, balanceRunMain, userAddress, provider);
        
        if (!result.success) {
          return res.status(400).json({ 
            success: false, 
            error: result.error || "Failed to generate auth link" 
          });
        }

        res.json({ 
          success: true, 
          data: { authUrl: result.authUrl } 
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
        const { serviceName } = req.body;
        const userAddress = req.body.userAuthPayload?.userAddress;
        
        if (!serviceName || !userAddress) {
          return res.status(400).json({ 
            success: false, 
            error: "serviceName and userAddress are required" 
          });
        }

        // Get database pool
        const pool = new Pool({ connectionString: env.POSTGRES_URL });
        
        const status = await checkAuthStatus(pool, userAddress, serviceName);
        
        res.json({ 
          success: true, 
          data: status 
        });
      } catch (error: any) {
        console.error("Error in auth-status handler:", error);
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

// Export Socket.IO integration for advanced usage (optional)
export const getSocketIOIntegration = () => socketIOIntegration;
