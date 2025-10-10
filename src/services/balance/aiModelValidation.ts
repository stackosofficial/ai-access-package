import { z } from 'zod';

/**
 * JSON Schema validation for structured outputs
 */
const jsonSchemaPropertySchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.string().optional(),
    description: z.string().optional(),
    enum: z.array(z.string()).optional(),
    items: z.union([jsonSchemaPropertySchema as z.ZodTypeAny, z.any()]).optional(),
    properties: z.record(z.string(), jsonSchemaPropertySchema as z.ZodTypeAny).optional(),
    required: z.array(z.string()).optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    format: z.string().optional(),
    nullable: z.boolean().optional(),
    additionalProperties: z.boolean().optional(),
  }).passthrough()
);

const responseSchemaValidator = z.object({
  type: z.string(),
  properties: z.record(z.string(), jsonSchemaPropertySchema as z.ZodTypeAny).optional(),
  required: z.array(z.string()).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  additionalProperties: z.boolean().optional(),
}).passthrough();

/**
 * Image input validation
 */
const imageSchema = z.object({
  type: z.enum(['url', 'base64']),
  url: z.string().url().optional(),
  base64_data: z.string().optional(),
  mime_type: z.string().optional(),
}).refine(
  (data) => {
    if (data.type === 'url') return !!data.url;
    if (data.type === 'base64') return !!data.base64_data && !!data.mime_type;
    return false;
  },
  { message: 'Invalid image configuration' }
);

/**
 * Tool choice validation
 */
const toolChoiceSchema = z.union([
  z.enum(['auto', 'required', 'none']),
  z.object({
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
    }),
  }),
]);

/**
 * Main request payload validation schema
 */
export const requestPayloadSchema = z.object({
  // Required fields
  prompt: z.string().min(1, 'Prompt is required and cannot be empty'),
  
  // Optional - Model (will default to "qwen/qwen3-14b" if not provided)
  model: z.string().min(1, 'Model name is required').optional(),

  // Optional generation parameters
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().int().positive().optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  repetition_penalty: z.number().min(0).max(2).optional(),
  stop: z.array(z.string()).optional(),

  // System prompt
  system_prompt: z.string().optional(),

  // Response format - CRITICAL for structured outputs
  response_type: z.enum(['json_object', 'json_schema', 'text']).optional(),
  response_schema: responseSchemaValidator.optional(),

  // Tool calling
  tools: z.array(z.any()).optional(),
  tool_choice: toolChoiceSchema.optional(),

  // Vision/Image support
  images: z.array(imageSchema).optional(),

  // Advanced options
  stream: z.boolean().optional(),
  logprobs: z.number().int().min(0).max(5).optional(),
  echo: z.boolean().optional(),
  n: z.number().int().positive().optional(),
  safety_model: z.string().optional(),
}).passthrough(); // Allow additional fields

/**
 * Type inference
 */
export type ValidatedPayload = z.infer<typeof requestPayloadSchema>;

/**
 * AI Model Call Parameters (for SDK usage)
 */
export interface AIModelCallParams {
  prompt: string;
  model?: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  stop?: string[];
  response_type?: 'json_object' | 'json_schema' | 'text';
  response_schema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
    name?: string;
    description?: string;
    additionalProperties?: boolean;
  };
  tools?: any[];
  tool_choice?: 'auto' | 'required' | 'none' | {
    type: 'function';
    function: {
      name: string;
    };
  };
  images?: Array<{
    type: 'url' | 'base64';
    url?: string;
    base64_data?: string;
    mime_type?: string;
  }>;
  stream?: boolean;
  logprobs?: number;
  echo?: boolean;
  n?: number;
  safety_model?: string;
}

/**
 * Validation function
 */
export function validatePayload(data: unknown) {
  const result = requestPayloadSchema.safeParse(data);
  
  if (!result.success) {
    const errorMessages = result.error.issues
      .map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    
    return {
      success: false,
      error: errorMessages,
      details: result.error,
    };
  }
  
  return {
    success: true,
    data: result.data,
  };
}

/**
 * Structured output validation
 */
export function validateStructuredOutput(data: any) {
  if (data.response_type === 'json_schema') {
    if (!data.response_schema) {
      return {
        success: false,
        error: 'response_schema is required when response_type is "json_schema"',
      };
    }
    
    if (!data.response_schema.type) {
      return {
        success: false,
        error: 'response_schema must have a "type" field',
      };
    }
    
    if (data.response_schema.type === 'object' && !data.response_schema.properties) {
      return {
        success: false,
        error: 'response_schema with type "object" must have "properties"',
      };
    }
  }
  
  return { success: true };
}

