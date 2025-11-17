import { executeAICall } from "../services/AIService/entrypoint";
import type { RequestPayload } from "../types/schemas";
import {
  envDefinitionSchema,
  type ENVDefinition,
  ResponseHandler,
  type ResponseHandlerData,
} from "../types/types";
import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { Pool } from "pg";
import { createDrizzleClient } from "../database/drizzleClient";
import { lockEndpointsIfEnabled } from "../utils/lockEndpoints";
import { createApiKeyAuthMiddleware } from "../middleware/apiKeyAuth";
import { createCreditsService } from "../services/billing/creditsService";

let globalPostgresUrl: string | null = null;

// Global function to get PostgreSQL URL
export const getGlobalPostgresUrl = (): string => {
  if (!globalPostgresUrl) {
    throw new Error(
      "PostgreSQL URL not initialized. Make sure to call initAIAccessPoint first."
    );
  }
  return globalPostgresUrl;
};

import { responseHandlerDataSchema } from "../types/schemas";

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
    this.isStreaming = req.query.stream === "true";
    this.hasStarted = false;
    this.hasEnded = false;

    // Setup streaming headers if needed
    if (this.isStreaming) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
    }
  }

  // Send partial update (only in streaming mode)
  sendUpdate(data: ResponseHandlerData | Buffer | string): void {
    if (!this.isStreaming || this.hasEnded) return;

    this.hasStarted = true;

    // Handle Buffer (file) - send as base64 in streaming
    if (Buffer.isBuffer(data)) {
      const base64 = data.toString("base64");
      this.res.write(
        `data: ${JSON.stringify({
          success: true,
          content: base64,
          isFile: true,
        })}\n\n`
      );
      if (typeof (this.res as any).flush === "function") {
        (this.res as any).flush();
      }
      return;
    }

    // Handle string
    if (typeof data === "string") {
      this.res.write(
        `data: ${JSON.stringify({ success: true, content: data })}\n\n`
      );
      if (typeof (this.res as any).flush === "function") {
        (this.res as any).flush();
      }
      return;
    }

    // Handle ResponseHandlerData - validate with Zod
    const validation = responseHandlerDataSchema.safeParse(data);
    if (!validation.success) {
      console.error("❌ Invalid response data:", validation.error);
      this.res.write(
        `data: ${JSON.stringify({
          success: false,
          error: "Invalid response format",
        })}\n\n`
      );
      return;
    }

    this.res.write(`data: ${JSON.stringify(validation.data)}\n\n`);
    // Check if flush exists (some Express response objects include it via compression middleware)
    if (typeof (this.res as any).flush === "function") {
      (this.res as any).flush();
    }
  }

  // Send final response and end
  sendFinalResponse(data: ResponseHandlerData | Buffer | string): void {
    if (this.hasEnded) return;
    this.hasEnded = true;

    // Handle Buffer (file) - send as file download
    if (Buffer.isBuffer(data)) {
      // This shouldn't happen in final response for files, use sendFile instead
      // But handle it gracefully
      this.res
        .status(500)
        .json({ success: false, error: "Use sendFile() for file responses" });
      return;
    }

    // Handle string
    if (typeof data === "string") {
      const responseData = { success: true, content: data };
      if (this.isStreaming) {
        this.res.write(
          `data: ${JSON.stringify({ ...responseData, done: true })}\n\n`
        );
        this.res.end();
      } else {
        this.res.json(responseData);
      }
      return;
    }

    // Handle ResponseHandlerData - validate with Zod
    const validation = responseHandlerDataSchema.safeParse(data);
    if (!validation.success) {
      console.error("❌ Invalid response data:", validation.error);
      this.res
        .status(500)
        .json({ success: false, error: "Invalid response format" });
      return;
    }

    const responseData = validation.data;

    if (this.isStreaming) {
      // Final message for streaming
      this.res.write(
        `data: ${JSON.stringify({ ...responseData, done: true })}\n\n`
      );
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

    this.res.setHeader("Content-Type", mimetype);
    this.res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    this.res.setHeader("Content-Length", buffer.length.toString());
    this.res.send(buffer);
  }

  // Send an error response
  sendError(error: string | Error, statusCode: number = 500): void {
    if (this.hasEnded) return;
    this.hasEnded = true;

    const errorMessage = typeof error === "string" ? error : error.message;
    const errorResponse = { success: false, error: errorMessage };

    if (this.isStreaming) {
      this.res.write(
        `data: ${JSON.stringify({ ...errorResponse, done: true })}\n\n`
      );
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
  callAIModel(params: RequestPayload): Promise<any>;
}

// Define the type for the runNaturalFunction parameter to make it explicit
export type RunNaturalFunctionType = (
  req: Request,
  res: Response,
  aiService: AIService,
  responseHandler: ResponseHandler
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

    // Initialize drizzle client (for new credits/requests system)
    const db = createDrizzleClient(pool);

    // Test the database connection
    try {
      await pool.query("SELECT 1");
      console.log("✅ Database connection established successfully");
    } catch (error) {
      console.error("❌ Database connection failed:", error);
      throw new Error(`Database connection failed: ${error}`);
    }

    // Initialize API-key auth and credits service
    const apiKeyAuth = createApiKeyAuthMiddleware(pool);
    const creditsService = createCreditsService(pool);

    // Handler function that wraps runNaturalFunction with ResponseHandler
    const handleRequest = async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        // Create AI service wrapper that automatically includes user's system prompt
        const aiService: AIService = {
          callAIModel: async (params: RequestPayload) => {
            // Get the current user system prompt from the request (in case it changed) - handles both JSON and form data
            const currentUserSystemPrompt =
              req.body.systemPrompt ||
              req.body.system_prompt ||
              req.body["systemPrompt"] ||
              req.body["system_prompt"];

            // Combine user's system prompt with any existing system prompt
            let combinedSystemPrompt = params.system_prompt || "";
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
        await runNaturalFunction(req, res, aiService, responseHandler);
      } catch (error: any) {
        console.error("❌ Error in request handler:", error);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ error: error.message || "Internal server error" });
        }
        next(error);
      }
    };

    // Setup single natural-request route (API key only)
    const middlewares: any[] = [];
    if (upload) {
      middlewares.push(upload.array("files"));
    }
    middlewares.push(apiKeyAuth);
    middlewares.push(handleRequest);

    app.post("/natural-request", ...middlewares);

    // Add global error handling middleware
    app.use((error: any, req: Request, res: Response, next: NextFunction) => {
      console.error("❌ [GLOBAL ERROR HANDLER] Unhandled error:", error);
      console.error("❌ [GLOBAL ERROR HANDLER] Stack trace:", error.stack);

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: "Internal server error",
          message: error.message,
        });
      }
    });

    // Add 404 handler for unmatched routes
    app.use((req: Request, res: Response) => {
      console.log("⚠️ [404 HANDLER] No route matched:", req.method, req.path);
      res.status(404).json({
        success: false,
        error: "Route not found",
      });
    });

    // Security: Optionally lock dynamic endpoint creation
    lockEndpointsIfEnabled(app);

    console.log("✅ AI Access Point initialized successfully");
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
  } catch (error: any) {
    console.error("❌ Error in initAIAccessPoint:", error);
    return {
      success: false,
      error: new Error(
        `Failed to initialize AI Access Point: ${error.message}`
      ),
    };
  }
};
