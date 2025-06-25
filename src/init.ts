import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import BalanceRunMain from "./balanceRunMain";
import { ENVDefinition, NFTCosts, ResponseHandler, ApiKeyConfig } from "./types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { checkBalance } from "./middleware/checkBalance";
import { protect } from "./middleware/auth";
import { parseAuth } from "./middleware/parseAuth";
import { validateApiKey } from "./middleware/validateApiKey";
import { ApiKeyService } from "./apiKeyService";
import express, { Request, Response, NextFunction } from "express";
import multer from "multer";

let skyNode: SkyMainNodeJS;

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
  return async (req, res, balanceRunMain, responseHandler) => {
    // Legacy functions handle the response directly through res
    return legacyFn(req, res, balanceRunMain);
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
}

export const initAIAccessPoint = async (
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
  apiKeyConfig?: ApiKeyConfig
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

    // API Key Service setup
    let apiKeyService: ApiKeyService | undefined;
    if (apiKeyConfig && apiKeyConfig.enabled) {
      apiKeyService = new ApiKeyService(apiKeyConfig);
      await apiKeyService.setupTables();
      (global as any).apiKeyService = apiKeyService;

      // Register API key endpoints only if apiKeyService is defined
      if (apiKeyService) {
        app.post('/api/generate-key', async (req: Request, res: Response) => {
          try {
            const { address, signature, message, collectionID, nftID } = req.body;
            if (!address || !signature || !message) {
              return res.status(400).json({ error: 'Missing required parameters' });
            }
            const authResult = await apiKeyService!.authenticateUser(address, signature, message);
            if (authResult.token) {
              const keyResult = await apiKeyService!.generateApiKey(address, authResult.token, collectionID, nftID);
              if (keyResult.error) {
                return res.status(400).json({ error: keyResult.error });
              }
              return res.json({ success: true, apiKey: keyResult.apiKey });
            }
            return res.status(401).json({ error: 'Authentication failed' });
          } catch (error: any) {
            console.error('Error generating API key:', error);
            return res.status(500).json({ error: error.message || 'Internal server error' });
          }
        });

        app.get('/api/validate-key', async (req: Request, res: Response) => {
          try {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey || typeof apiKey !== 'string') {
              return res.status(400).json({ error: 'Missing API key' });
            }
            const isValid = await apiKeyService!.validateApiKey(apiKey);
            if (!isValid) {
              return res.status(401).json({ error: 'Invalid API key' });
            }
            return res.json({ success: true, valid: true, message: 'API key is valid' });
          } catch (error: any) {
            console.error('Error validating API key:', error);
            return res.status(500).json({ error: error.message || 'Error validating API key' });
          }
        });
      }
    }

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

    return { success: true, data: balanceRunMain };
  } catch (error: any) {
    console.error("Error in initAIAccessPoint:", error);
    return {
      success: false,
      data: new Error(`Failed to initialize AI Access Point: ${error.message}`),
    };
  }
};
