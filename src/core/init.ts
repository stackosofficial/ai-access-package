import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { Pool } from 'pg';

import { createDrizzleClient } from '../database/drizzleClient';
import { createApiKeyAuthMiddleware } from '../middleware/auth';
import { type AIModelResponse, executeAICall } from '../services/AIService/entrypoint';
import { createCreditsService } from '../services/billing/creditsService';
import { createCreditsRepository } from '../services/billing/data-access/db';
import type { RequestPayload } from '../types/schemas';
import { responseHandlerDataSchema } from '../types/schemas';
import { ResponseHandler, type ResponseHandlerData, envDefinitionSchema } from '../types/types';

let globalPostgresUrl: string | null = null;

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

  // Helper to safely flush response if available
  private flushResponse(): void {
    const resWithFlush = this.res as Response & { flush?: () => void };
    if (typeof resWithFlush.flush === 'function') {
      resWithFlush.flush();
    }
  }

  // Send partial update (only in streaming mode)
  sendUpdate(data: ResponseHandlerData | Buffer | string): void {
    if (!this.isStreaming || this.hasEnded) return;

    this.hasStarted = true;

    // Handle Buffer (file) - send as base64 in streaming
    if (Buffer.isBuffer(data)) {
      const base64 = data.toString('base64');
      this.res.write(
        `data: ${JSON.stringify({
          success: true,
          content: base64,
          isFile: true,
        })}\n\n`
      );
      this.flushResponse();
      return;
    }

    // Handle string
    if (typeof data === 'string') {
      this.res.write(`data: ${JSON.stringify({ success: true, content: data })}\n\n`);
      this.flushResponse();
      return;
    }

    // Handle ResponseHandlerData - validate with Zod
    const validation = responseHandlerDataSchema.safeParse(data);
    if (!validation.success) {
      console.error('❌ Invalid response data:', validation.error);
      this.res.write(
        `data: ${JSON.stringify({
          success: false,
          error: 'Invalid response format',
        })}\n\n`
      );
      return;
    }

    this.res.write(`data: ${JSON.stringify(validation.data)}\n\n`);
    // Check if flush exists (some Express response objects include it via compression middleware)
    this.flushResponse();
  }

  // Send final response and end
  sendFinalResponse(data: ResponseHandlerData | Buffer | string): void {
    if (this.hasEnded) return;
    this.hasEnded = true;

    // Handle Buffer (file) - send as file download
    if (Buffer.isBuffer(data)) {
      // This shouldn't happen in final response for files, use sendFile instead
      // But handle it gracefully
      this.res.status(500).json({ success: false, error: 'Use sendFile() for file responses' });
      return;
    }

    // Handle string
    if (typeof data === 'string') {
      const responseData = { success: true, content: data };
      if (this.isStreaming) {
        this.res.write(`data: ${JSON.stringify({ ...responseData, done: true })}\n\n`);
        this.res.end();
      } else {
        this.res.json(responseData);
      }
      return;
    }

    // Handle ResponseHandlerData - validate with Zod
    const validation = responseHandlerDataSchema.safeParse(data);
    if (!validation.success) {
      console.error('❌ Invalid response data:', validation.error);
      this.res.status(500).json({ success: false, error: 'Invalid response format' });
      return;
    }

    const responseData = validation.data;

    if (this.isStreaming) {
      // Final message for streaming
      this.res.write(`data: ${JSON.stringify({ ...responseData, done: true })}\n\n`);
      this.res.end();
    } else {
      // Regular JSON response
      this.res.json(responseData);
    }
  }

  // Send a file response (for image generation services, etc.)
  sendFile(buffer: Buffer, filename: string, mimetype: string): void {
    if (this.hasEnded) return;
    this.hasEnded = true;

    this.res.setHeader('Content-Type', mimetype);
    this.res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    this.res.setHeader('Content-Length', buffer.length.toString());
    this.res.send(buffer);
  }

  // Send an error response
  sendError(error: string | Error, statusCode: number = 500): void {
    if (this.hasEnded) return;
    this.hasEnded = true;

    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorResponse = { success: false, error: errorMessage };

    if (this.isStreaming) {
      this.res.write(`data: ${JSON.stringify({ ...errorResponse, done: true })}\n\n`);
      this.res.end();
    } else {
      this.res.status(statusCode).json(errorResponse);
    }
  }

  // Check if this is a streaming request
  isStreamingRequest(): boolean {
    return this.isStreaming;
  }
}

// AI Service interface for compatibility
export interface AIService {
  callAIModel(params: RequestPayload): Promise<AIModelResponse>;
}

// Credits service interface for runNaturalFunction
export interface CreditsService {
  addCost(amountDollars: string): Promise<void>;
  checkBalance(requiredDollars: string): Promise<boolean>;
}

// Define the type for the runNaturalFunction parameter to make it explicit
export type RunNaturalFunctionType = (
  req: Request,
  res: Response,
  aiService: AIService,
  responseHandler: ResponseHandler,
  creditsService: CreditsService
) => Promise<void>;

// Legacy AIAccessPointConfig removed - configuration is now via environment only.

export const initAIAccessPoint = async (
  env: unknown,
  app: express.Application,
  runNaturalFunction: RunNaturalFunctionType,
  upload?: multer.Multer
): Promise<{ success: boolean; data?: AIService; error?: Error }> => {
  try {
    // Validate environment configuration with Zod
    const validatedEnv = envDefinitionSchema.parse(env);
    globalPostgresUrl = validatedEnv.POSTGRES_URL;

    const pool = new Pool({
      connectionString: validatedEnv.POSTGRES_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    // Test the database connection
    try {
      await pool.query('SELECT 1');
      console.log('✅ Database connection established successfully');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Database connection failed: ${errorMessage}`);
    }

    // Initialize drizzle client (for new credits/requests system)
    createDrizzleClient(pool);

    // Initialize API-key auth and credits service
    const apiKeyAuth = createApiKeyAuthMiddleware(pool);
    const creditsService = createCreditsService(pool);

    // Ensure base cost exists for this app during initialization
    const repository = createCreditsRepository(pool);
    const baseCostResult = await repository.getBaseCost(validatedEnv.appName)();
    if (baseCostResult._tag === 'Left') {
      console.warn(`[init] Failed to ensure base cost exists: ${baseCostResult.left.message}`);
    } else {
      console.log(`[init] Base cost ensured for app "${validatedEnv.appName}": ${baseCostResult.right} dollars`);
    }

    // Handler function that wraps runNaturalFunction with ResponseHandler
    const handleRequest = (req: Request, res: Response, next: NextFunction): void => {
      const startedAt = Date.now();
      let requestId: string | null = null;
      let costDollars = '0'; // Track cost for logging (accessible in catch block)

      // Use void to satisfy Express middleware signature, but execute async code
      void (async () => {
        try {
          // Log request start
          if (req.organisationId) {
            const body = req.body as Record<string, unknown>;
            const prompt = (typeof body.prompt === 'string' ? body.prompt : '') || '';
            const systemPrompt =
              (typeof body.systemPrompt === 'string' ? body.systemPrompt : null) ||
              (typeof body.system_prompt === 'string' ? body.system_prompt : null) ||
              undefined;

            const logStartResult = await creditsService.logRequestStart(
              {
                organisationId: req.organisationId,
                apiKeyId: req.apiKeyId ?? undefined,
                appName: validatedEnv.appName,
              },
              prompt,
              systemPrompt,
              undefined // model is not available at this point
            )();

            if (logStartResult._tag === 'Right') {
              requestId = logStartResult.right;
            }
          }

          // Create AI service wrapper that automatically includes user's system prompt
          const aiService: AIService = {
            callAIModel: async (params: RequestPayload) => {
              // Get the current user system prompt from the request (in case it changed) - handles both JSON and form data
              const body = req.body as Record<string, unknown>;
              const currentUserSystemPrompt =
                (typeof body.systemPrompt === 'string' ? body.systemPrompt : null) ||
                (typeof body.system_prompt === 'string' ? body.system_prompt : null) ||
                (typeof body['systemPrompt'] === 'string' ? body['systemPrompt'] : null) ||
                (typeof body['system_prompt'] === 'string' ? body['system_prompt'] : null);

              // Combine user's system prompt with any existing system prompt
              let combinedSystemPrompt = params.system_prompt || '';
              if (currentUserSystemPrompt) {
                combinedSystemPrompt = combinedSystemPrompt
                  ? `${combinedSystemPrompt}\n\n${currentUserSystemPrompt}`
                  : currentUserSystemPrompt;
              }

              // Use the new AIService with fp-ts
              const result = await executeAICall({
                ...params,
                system_prompt: combinedSystemPrompt,
              });

              if (!result.success) {
                throw result.error;
              }

              return result.data;
            },
          };

          const responseHandler = new ResponseHandlerImpl(req, res);

          // Create credits service wrapper with automatic context from request
          const creditsServiceWrapper: CreditsService = {
            addCost: async (amountDollars: string) => {
              if (!req.organisationId) {
                throw new Error('Organisation ID not found in request context');
              }
              costDollars = amountDollars; // Track cost for logging
              // Automatically set service to appName from env, organisationId from request
              const result = await creditsService.addCost(
                {
                  organisationId: req.organisationId,
                  apiKeyId: req.apiKeyId ?? undefined,
                  appName: validatedEnv.appName,
                },
                amountDollars
              )();

              if (result._tag === 'Left') {
                throw result.left;
              }
            },
            checkBalance: async (requiredDollars: string) => {
              if (!req.organisationId) {
                throw new Error('Organisation ID not found in request context');
              }
              const result = await creditsService.checkBalance(
                {
                  organisationId: req.organisationId,
                  apiKeyId: req.apiKeyId ?? undefined,
                  appName: validatedEnv.appName,
                },
                requiredDollars
              )();

              if (result._tag === 'Left') {
                throw result.left;
              }

              return result.right;
            },
          };

          await runNaturalFunction(req, res, aiService, responseHandler, creditsServiceWrapper);

          // Log request end (success)
          if (requestId && req.organisationId) {
            await creditsService.logRequestEnd(requestId, costDollars, 'success', startedAt)();
          }
        } catch (error: unknown) {
          // Log request end (error) - use tracked cost or default to 0
          if (requestId && req.organisationId) {
            await creditsService.logRequestEnd(requestId, costDollars || '0', 'error', startedAt)();
          }

          console.error('❌ Error in request handler:', error);
          if (!res.headersSent) {
            const errorMessage = error instanceof Error ? error.message : 'Internal server error';
            res.status(500).json({ error: errorMessage });
          }
          next(error);
        }
      })();
    };

    // Setup single natural-request route (API key only)
    // Wrap async middleware to satisfy TypeScript (Express supports async middleware)
    const wrappedApiKeyAuth = (req: Request, res: Response, next: NextFunction): void => {
      void apiKeyAuth(req, res, next);
    };

    if (upload) {
      app.post('/natural-request', upload.array('files'), wrappedApiKeyAuth, handleRequest);
    } else {
      app.post('/natural-request', wrappedApiKeyAuth, handleRequest);
    }

    // Add global error handling middleware
    app.use((error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
      console.error('❌ [GLOBAL ERROR HANDLER] Unhandled error:', error);
      if (error instanceof Error) {
        console.error('❌ [GLOBAL ERROR HANDLER] Stack trace:', error.stack);
      }

      if (!res.headersSent) {
        const errorMessage = error instanceof Error ? error.message : 'Internal server error';
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          message: errorMessage,
        });
      }
    });

    // Add 404 handler for unmatched routes
    app.use((req: Request, res: Response) => {
      console.log('⚠️ [404 HANDLER] No route matched:', req.method, req.path);
      res.status(404).json({
        success: false,
        error: 'Route not found',
      });
    });

    console.log('✅ AI Access Point initialized successfully');
    return {
      success: true,
      data: {
        callAIModel: async (params: RequestPayload) => {
          const result = await executeAICall(params);
          if (!result.success) {
            throw result.error;
          }
          return result.data;
        },
      } as AIService,
    };
  } catch (error: unknown) {
    console.error('❌ Error in initAIAccessPoint:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: new Error(`Failed to initialize AI Access Point: ${errorMessage}`),
    };
  }
};
