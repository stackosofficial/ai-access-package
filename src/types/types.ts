import { Request, Response } from "express";
import { responseHandlerDataSchema, type ResponseHandlerData } from "./schemas";

// Re-export types and schemas from schemas.ts
export {
  envDefinitionSchema,
  aiModelResponseSchema,
  requestPayloadSchema,
  responseHandlerDataSchema,
  fileInputSchema,
  multipartFormDataSchema,
  addCostOptionsSchema,
  creditsContextSchema,
  type ENVDefinition,
  type AIModelResponse,
  type RequestPayload,
  type ResponseHandlerData,
  type FileInput,
  type MultipartFormData,
  type AddCostOptions,
  type CreditsContext,
} from "./schemas";

/**
 * Response Handler interface with Zod validation support
 */
export interface ResponseHandler {
  sendUpdate(data: ResponseHandlerData | Buffer | string): void;
  sendFinalResponse(data: ResponseHandlerData | Buffer | string): void;
  sendError(error: string | Error, statusCode?: number): void;
  sendFile(buffer: Buffer, filename: string, mimetype: string): void;
  isStreamingRequest(): boolean;
}
