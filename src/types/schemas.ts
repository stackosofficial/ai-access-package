import { z } from 'zod';

/**
 * Environment configuration schema
 */
export const envDefinitionSchema = z.object({
  POSTGRES_URL: z.string().url('POSTGRES_URL must be a valid URL'),
  minimumBalance: z
    .string()
    .regex(
      /^\d+(\.\d{1,2})?$/,
      "minimumBalance must be a valid dollar value (whole number like '1' or decimal like '1.50')"
    )
    .optional(),
  appName: z.string().min(1, 'appName is required'),
});

/**
 * AI Model Response schema - simplified to {success: boolean, content: string}
 */
export const aiModelResponseSchema = z.object({
  success: z.boolean(),
  content: z.string(),
});

/**
 * Request Payload schema - prompt and system_prompt (from service)
 * Note: systemPrompt (from user) is extracted from req.body separately
 */
export const requestPayloadSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required and cannot be empty'),
  system_prompt: z.union([z.string(), z.array(z.string())]).optional(),
  response_format: z
    .object({
      type: z.enum(['json_object', 'json_schema']),
      schema: z.record(z.string(), z.unknown()),
    })
    .optional(),
});

/**
 * Response Handler schema for validation
 */
export const responseHandlerDataSchema = z
  .object({
    success: z.boolean(),
    content: z.string().optional(),
    error: z.string().optional(),
  })
  .refine(
    data => {
      // Either content (success) or error (failure) must be present
      if (data.success) {
        return !!data.content;
      } else {
        return !!data.error;
      }
    },
    {
      message: "Response must have 'content' when success is true, or 'error' when success is false",
    }
  );

/**
 * File input schema for multipart form data
 */
export const fileInputSchema = z.object({
  fieldname: z.string(),
  originalname: z.string(),
  encoding: z.string(),
  mimetype: z.string(),
  buffer: z.instanceof(Buffer),
  size: z.number().int().positive(),
});

/**
 * Multipart form data schema
 */
export const multipartFormDataSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required and cannot be empty'),
  system_prompt: z.string().optional(),
  files: z.array(fileInputSchema).optional(),
});

/**
 * Credits Service - Credits Context schema (updated to use appName instead of backendId)
 */
export const creditsContextSchema = z.object({
  organisationId: z.string().uuid('organisationId must be a valid UUID'),
  apiKeyId: z.string().uuid('apiKeyId must be a valid UUID').optional(),
  appName: z.string().min(1, 'appName is required'),
});

/**
 * Type exports (inferred from schemas)
 */
export type ENVDefinition = z.infer<typeof envDefinitionSchema>;
export type AIModelResponse = z.infer<typeof aiModelResponseSchema>;
export type RequestPayload = z.infer<typeof requestPayloadSchema>;
export type ResponseHandlerData = z.infer<typeof responseHandlerDataSchema>;
export type FileInput = z.infer<typeof fileInputSchema>;
export type MultipartFormData = z.infer<typeof multipartFormDataSchema>;
export type CreditsContext = z.infer<typeof creditsContextSchema>;
