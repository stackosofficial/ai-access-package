# Agent-Based Service Implementation Guide

This guide will help you implement the AI Access Point SDK in a service that can optionally use `userAgentId`. **All request and response validation MUST use Zod schemas** as specified in this guide.

## Table of Contents

1. [Installation](#installation)
2. [ESLint Configuration](#eslint-configuration)
3. [Initialization](#initialization)
4. [Request Validation with Zod](#request-validation-with-zod)
5. [Calling AI Service](#calling-ai-service)
6. [Response Format with Zod](#response-format-with-zod)
7. [Adding Costs](#adding-costs)
8. [Complete Example](#complete-example)

---

## Installation

Install the SDK and required dependencies:

```bash
npm install @decloudlabs/ap zod fp-ts
```

---

## ESLint Configuration

**IMPORTANT**: You must use the same ESLint configuration as the SDK to ensure code quality and consistency.

### 1. Install ESLint Dependencies

```bash
npm install --save-dev \
  @eslint/compat \
  @eslint/eslintrc \
  @eslint/js \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint \
  eslint-config-prettier \
  eslint-import-resolver-typescript \
  eslint-plugin-import \
  eslint-plugin-prettier \
  globals \
  prettier
```

### 2. Create `eslint.config.mjs`

```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fixupConfigRules, fixupPluginRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import _import from 'eslint-plugin-import';
import prettier from 'eslint-plugin-prettier';
import globals from 'globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  {
    basePath: __dirname + '/src',
    ignores: [
      'node_modules/**',
      'dist/**',
      '.env',
      '.env.local',
      '.env.*.local',
      '.idea',
      '.vscode',
      '.gitignore',
      '.git',
    ],
    extends: fixupConfigRules(
      compat.extends(
        'eslint:recommended',
        'plugin:import/recommended',
        'plugin:import/typescript',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'prettier',
        'plugin:prettier/recommended'
      )
    ),
    plugins: {
      '@typescript-eslint': fixupPluginRules(typescriptEslint),
      import: fixupPluginRules(_import),
      prettier: fixupPluginRules(prettier),
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['./tsconfig.json'],
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
    },
  },
]);
```

---

## Initialization

Initialize the SDK in your service entry point:

```typescript
import express from 'express';
import { initAIAccessPoint, type RunNaturalFunctionType } from '@decloudlabs/ap';

const app = express();
app.use(express.json());

// Your handler function (see below)
const runNaturalFunction: RunNaturalFunctionType = async (req, res, aiService, responseHandler, creditsService) => {
  // Implementation below
};

// Initialize SDK
const env = {
  POSTGRES_URL: process.env.POSTGRES_URL!,
  minimumBalance: process.env.MINIMUM_BALANCE || '0.01',
  appName: 'agent-based-service', // Your service name
};

const initResult = await initAIAccessPoint(env, app, runNaturalFunction);

if (!initResult.success) {
  console.error('❌ Failed to initialize SDK:', initResult.error);
  process.exit(1);
}

console.log('✅ SDK initialized successfully');
```

---

## How organisationId Works

**IMPORTANT**: The SDK automatically handles `organisationId` extraction and usage. Here's how it works:

1. **API Key Middleware**: When a request comes in with an `x-api-key` header, the SDK middleware:
   - Validates the API key against the database
   - Extracts the `organisationId` associated with that API key
   - Attaches it to `req.organisationId` automatically

2. **userAgentId Validation** (Optional): If `userAgentId` is provided in the request, the SDK:
   - Validates that `userAgentId` exists in the `user_agents` table
   - Validates that the agent's `organisationId` matches `req.organisationId` (from the API key)
   - Returns `400 Bad Request` if validation fails (database error)
   - Returns `403 Forbidden` if `userAgentId` doesn't belong to the organisation
   - If `userAgentId` is not provided, validation is skipped (userAgentId is optional)

3. **Automatic Usage**: Throughout your handler:
   - `creditsService.addCost()` automatically uses `req.organisationId`
   - `creditsService.checkBalance()` automatically uses `req.organisationId`
   - Request logging automatically uses `req.organisationId` and `userAgentId`
   - You **never need to manually pass `organisationId`** - it's all automatic

**You don't need to access `req.organisationId` in your handler** - the SDK handles everything automatically.

### userAgentId Validation Details

**Database Table**: `user_agents`

**Table Structure**:

- `id` (UUID, primary key): The agent ID
- `organisationId` (UUID, foreign key): The organisation that owns the agent
- Other fields: `name`, `description`, `image`, `createdAt`, `updatedAt`, etc.

**Validation Process** (happens automatically in SDK before your handler is called):

1. **If `userAgentId` is provided**:
   - SDK queries `user_agents` table to check if `userAgentId` exists (by `id` column)
   - If agent doesn't exist → SDK returns `403 Forbidden` (agent must exist if provided)
   - If agent exists, SDK checks if `user_agents.organisationId` matches `req.organisationId` (from API key)
   - If `organisationId` matches → validation passes, request continues
   - If `organisationId` doesn't match → SDK returns `403 Forbidden` before your handler is called
   - If database error occurs → SDK returns `400 Bad Request`

2. **If `userAgentId` is NOT provided**:
   - Validation is skipped (userAgentId is optional)
   - Request proceeds normally

**Error Responses**:

- `400 Bad Request`: Database error during validation
- `403 Forbidden`: `userAgentId` doesn't exist OR `userAgentId` exists but doesn't belong to the organisation from the API key

---

## Request Validation with Zod

**STRICT RULE**: You MUST use Zod for all request validation. For agent-based services, create a custom schema that only accepts `prompt`, `systemPrompt`, and `userAgentId` (optional).

### Creating the Agent Request Schema

```typescript
import { z } from 'zod';

// Schema for agent-based service requests
// Only validates client-sent fields: prompt (required), systemPrompt (optional), userAgentId (optional)
// organisationId is NOT validated here - it's extracted from the API key by middleware
// and available on req.organisationId (already validated by API key middleware)
const agentRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required and cannot be empty'),
  systemPrompt: z.string().optional(), // Optional user-provided system prompt
  userAgentId: z.string().uuid('userAgentId must be a valid UUID').optional(), // OPTIONAL - if provided, SDK validates it belongs to organisation
});
```

### Example: Validating Request

```typescript
import { z } from 'zod';

// Create schema for agent requests
// Only accepts: prompt (required), systemPrompt (optional), userAgentId (optional)
const agentRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required and cannot be empty'),
  systemPrompt: z.string().optional(),
  userAgentId: z.string().uuid('userAgentId must be a valid UUID').optional(), // OPTIONAL
});

const runNaturalFunction: RunNaturalFunctionType = async (req, res, aiService, responseHandler, creditsService) => {
  try {
    // 1. Validate request with Zod
    // Only validates client-sent fields: prompt, systemPrompt, userAgentId
    // organisationId is NOT in the request body - it's extracted from the API key by middleware
    // and available on req.organisationId (already validated by API key middleware)
    const validation = agentRequestSchema.safeParse({
      prompt: req.body.prompt,
      systemPrompt: req.body.systemPrompt,
      userAgentId: req.body.userAgentId,
    });

    if (!validation.success) {
      const errorMessages = validation.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      responseHandler.sendError(`Validation failed: ${errorMessages}`, 400);
      return;
    }

    const { prompt, systemPrompt, userAgentId } = validation.data;

    // organisationId is available on req.organisationId (extracted from API key by middleware)
    // You don't need to validate it - it's already validated by the API key middleware
    // If userAgentId is provided, the SDK automatically validates that it belongs to req.organisationId
    // Validation uses the user_agents table:
    //   1. Checks if userAgentId exists in user_agents table
    //   2. Checks if agent's organisationId matches req.organisationId
    //   3. Returns 403 if userAgentId doesn't belong to the organisation

    // Continue with your logic...
    // You can access req.organisationId if needed, but usually you don't need to
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    responseHandler.sendError(errorMessage, 500);
  }
};
```

**Important Notes:**

- **Automatic organisationId Extraction**: The SDK middleware automatically extracts `organisationId` from the API key and attaches it to `req.organisationId` - you don't need to pass it manually
- **userAgentId is Optional**: `userAgentId` is optional - if not provided, validation is skipped
- **Automatic userAgentId Validation**: If `userAgentId` is provided, the SDK automatically validates it:
  - **Database Table**: Uses the `user_agents` table
  - **Validation Process**:
    1. Checks if `userAgentId` exists in `user_agents` table (by `id` column)
    2. If agent doesn't exist → returns `403 Forbidden`
    3. If agent exists, checks if the agent's `organisationId` matches `req.organisationId` (from the API key)
    4. If `organisationId` matches → validation passes
    5. If `organisationId` doesn't match → returns `403 Forbidden`
    6. Returns `400 Bad Request` if database error occurs during validation
- **Validation Happens Before Handler**: If `userAgentId` is provided and validation fails, the SDK returns an error before your handler is called
- **No Manual Checks Required**: You don't need to manually check organisation ownership or pass `organisationId` anywhere - the SDK handles everything automatically

---

## Calling AI Service

The SDK provides an `AIService` interface for calling AI models. If `userAgentId` is provided, it's automatically logged in the request.

### AIService Interface

```typescript
interface AIService {
  callAIModel(params: RequestPayload): Promise<AIModelResponse>;
}
```

### RequestPayload Structure

When calling `aiService.callAIModel()`, you can optionally add service-provided system prompts:

```typescript
interface RequestPayload {
  prompt: string; // Required: The user's prompt
  system_prompt?: string | string[]; // Optional: Service-provided system prompt(s) - only if your service needs to add its own
}
```

**Note**: The user-provided `systemPrompt` from the request body is automatically extracted by the SDK and passed to the AI model. You don't need to pass it to `callAIModel()`.

### Example: Calling AI Service

```typescript
import type { RequestPayload, AIModelResponse } from '@decloudlabs/ap';

const runNaturalFunction: RunNaturalFunctionType = async (req, res, aiService, responseHandler, creditsService) => {
  try {
    // ... validation code from above ...

    const { prompt, systemPrompt, userAgentId } = validation.data;

    // 2. Prepare AI request payload
    // Only pass prompt - systemPrompt is automatically extracted from req.body by the SDK
    const aiRequest: RequestPayload = {
      prompt,
      // Optionally add service-provided system prompt if needed:
      // system_prompt: 'Your service system prompt here',
    };

    // 3. Call AI service
    // The SDK automatically:
    // - Extracts organisationId from API key (via middleware) - you don't need to pass it
    // - Validates userAgentId belongs to that organisationId (if userAgentId is provided, returns 403 if not)
    // - Extracts user-provided systemPrompt from req.body.systemPrompt and passes it to AI
    // - Passes the API key in headers
    // - Handles retries (3 attempts with exponential backoff)
    // - Logs the request with organisationId and userAgentId (if provided) automatically
    const aiResponse: AIModelResponse = await aiService.callAIModel(aiRequest);

    if (!aiResponse.success) {
      responseHandler.sendError('AI service call failed', 500);
      return;
    }

    // 4. Process AI response
    const aiContent = aiResponse.content; // String content from AI

    // Your business logic here...
    const processedResult = processAIResponse(aiContent, userAgentId);

    // 5. Calculate cost (example)
    const costDollars = calculateCost(aiContent.length);

    // 6. Add cost (MUST be done after successful processing)
    await creditsService.addCost(costDollars);

    // 7. Send response
    responseHandler.sendFinalResponse({
      success: true,
      content: JSON.stringify({
        result: processedResult,
        userAgentId,
      }),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    responseHandler.sendError(errorMessage, 500);
  }
};
```

---

## Response Format with Zod

**STRICT RULE**: You MUST validate all responses using Zod. Import the response schema from the SDK:

```typescript
import { responseHandlerDataSchema, type ResponseHandlerData } from '@decloudlabs/ap';
import { z } from 'zod';
```

### Response Schema

The SDK provides `responseHandlerDataSchema` which validates:

```typescript
{
  success: boolean;
  content?: string;  // Required when success is true
  error?: string;    // Required when success is false
}
```

### Using ResponseHandler

The SDK provides a `ResponseHandler` interface with the following methods:

- `sendUpdate(data: ResponseHandlerData | Buffer | string)`: Send partial updates (for streaming)
- `sendFinalResponse(data: ResponseHandlerData | Buffer | string)`: Send final response
- `sendError(error: string | Error, statusCode?: number)`: Send error response
- `sendFile(buffer: Buffer, filename: string, mimetype: string)`: Send file response
- `isStreamingRequest()`: Check if request is streaming

**All responses are automatically validated with Zod** by the ResponseHandler.

### Example: Sending Response

```typescript
// Simple text response
responseHandler.sendFinalResponse({
  success: true,
  content: 'Processing complete',
});

// JSON response (content must be a string)
responseHandler.sendFinalResponse({
  success: true,
  content: JSON.stringify({
    result: processedData,
    userAgentId,
    timestamp: new Date().toISOString(),
  }),
});

// Streaming updates (if streaming is enabled)
if (responseHandler.isStreamingRequest()) {
  responseHandler.sendUpdate({
    success: true,
    content: 'Processing started...',
  });

  // ... more updates ...

  responseHandler.sendFinalResponse({
    success: true,
    content: 'Processing complete',
  });
}
```

---

## Adding Costs

**IMPORTANT**: After successfully processing a request, you MUST add the cost using the `CreditsService`.

### CreditsService Interface

```typescript
interface CreditsService {
  addCost(amountDollars: string): Promise<void>;
  checkBalance(requiredDollars: string): Promise<boolean>;
}
```

**Important**: The `CreditsService` automatically uses the `organisationId` extracted from the API key. You don't need to pass `organisationId` - it's handled automatically by the SDK.

### Example: Adding Cost After AI Processing

```typescript
// Calculate cost based on your business logic
function calculateCost(contentLength: number, userAgentId: string): string {
  const baseCost = 0.01; // Base cost per request
  const costPerCharacter = 0.0001; // Cost per character in response

  const totalCost = baseCost + contentLength * costPerCharacter;

  // SDK automatically rounds UP to 2 decimal places (ceiling)
  // You don't need to round manually
  return String(totalCost);
}

// In your handler
const aiResponse = await aiService.callAIModel(aiRequest);

// Calculate cost
const costDollars = calculateCost(aiResponse.content.length, userAgentId);

// Check balance before processing (optional but recommended)
const hasBalance = await creditsService.checkBalance(costDollars);
if (!hasBalance) {
  responseHandler.sendError('Insufficient balance', 402);
  return;
}

// Process the response...

// Add cost (MUST be done after successful processing)
await creditsService.addCost(costDollars);

// Send response
responseHandler.sendFinalResponse({
  success: true,
  content: processedResult,
});
```

**Important Notes:**

- Cost format: Pass any numeric string to `addCost()` - the SDK automatically rounds UP to 2 decimal places (ceiling) to ensure no money is lost (e.g., `"0.123"` becomes `"0.13"`, `"0.0053"` becomes `"0.01"`)
- Add cost after success: Only add cost after successful processing
- No manual rounding required: The SDK handles all cost rounding automatically

---

## Complete Example

Here's a complete example of an agent-based service:

```typescript
import express from 'express';
import { z } from 'zod';
import {
  initAIAccessPoint,
  requestPayloadSchema,
  responseHandlerDataSchema,
  type RunNaturalFunctionType,
  type RequestPayload,
  type AIModelResponse,
} from '@decloudlabs/ap';

const app = express();
app.use(express.json());

// Extend base schema to add optional userAgentId
const agentRequestSchema = requestPayloadSchema.extend({
  userAgentId: z.string().uuid('userAgentId must be a valid UUID').optional(), // OPTIONAL
});

// Calculate cost based on response length
function calculateCost(contentLength: number): string {
  const baseCost = 0.01;
  const costPerCharacter = 0.0001;
  const totalCost = baseCost + contentLength * costPerCharacter;
  return String(totalCost);
}

// Process AI response
function processAIResponse(content: string, userAgentId: string): unknown {
  try {
    const parsed = JSON.parse(content);
    return {
      ...parsed,
      userAgentId,
      processedAt: new Date().toISOString(),
    };
  } catch {
    return {
      content,
      userAgentId,
      processedAt: new Date().toISOString(),
    };
  }
}

// Main handler function
const runNaturalFunction: RunNaturalFunctionType = async (req, res, aiService, responseHandler, creditsService) => {
  try {
    // 1. Validate request with Zod
    // Only accepts: prompt (required), systemPrompt (optional), userAgentId (optional)
    const validation = agentRequestSchema.safeParse({
      prompt: req.body.prompt,
      systemPrompt: req.body.systemPrompt,
      userAgentId: req.body.userAgentId, // Optional - if provided, SDK validates it belongs to organisation
    });

    if (!validation.success) {
      const errorMessages = validation.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      responseHandler.sendError(`Validation failed: ${errorMessages}`, 400);
      return;
    }

    const { prompt, systemPrompt, userAgentId } = validation.data;

    // 2. Check balance before processing (optional but recommended)
    const estimatedCost = calculateCost(1000); // Estimate based on expected response length
    const hasBalance = await creditsService.checkBalance(estimatedCost);
    if (!hasBalance) {
      responseHandler.sendError('Insufficient balance', 402);
      return;
    }

    // 3. Prepare AI request payload
    // Only pass prompt - systemPrompt is automatically extracted from req.body by the SDK
    const aiRequest: RequestPayload = {
      prompt,
      // Optionally add service-provided system prompt if needed:
      // system_prompt: 'Your service system prompt here',
    };

    // 4. Call AI service
    // The SDK automatically:
    // - Extracts user-provided systemPrompt from req.body.systemPrompt
    // - Validates userAgentId belongs to organisation (if userAgentId is provided)
    // - Passes API key in headers
    // - Handles retries (3 attempts with exponential backoff)
    const aiResponse: AIModelResponse = await aiService.callAIModel(aiRequest);

    if (!aiResponse.success) {
      responseHandler.sendError('AI service call failed', 500);
      return;
    }

    // 5. Process AI response
    const processedResult = processAIResponse(aiResponse.content, userAgentId);

    // 6. Calculate actual cost
    const costDollars = calculateCost(aiResponse.content.length);

    // 7. Add cost (MUST be done after successful processing)
    await creditsService.addCost(costDollars);

    // 8. Send response
    responseHandler.sendFinalResponse({
      success: true,
      content: JSON.stringify(processedResult),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in agent service:', error);
    responseHandler.sendError(errorMessage, 500);
  }
};

// Initialize SDK
const env = {
  POSTGRES_URL: process.env.POSTGRES_URL!,
  minimumBalance: process.env.MINIMUM_BALANCE || '0.01',
  appName: 'agent-based-service',
};

const initResult = await initAIAccessPoint(env, app, runNaturalFunction);

if (!initResult.success) {
  console.error('❌ Failed to initialize SDK:', initResult.error);
  process.exit(1);
}

console.log('✅ SDK initialized successfully');

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Agent-based service running on port ${PORT}`);
});
```

---

## Key Points to Remember

1. **Zod Validation is MANDATORY**: Always use Zod schemas for request/response validation
2. **Simple Request Payload**: Only accept `prompt` (required), `systemPrompt` (optional), and `userAgentId` (optional) in the request body
3. **organisationId is NOT in Request Body**: `organisationId` is automatically extracted from the `x-api-key` header by the SDK middleware and attached to `req.organisationId` - you don't validate it in your schema because it's not sent by the client
4. **userAgentId is Optional**: `userAgentId` is optional - if provided, the SDK automatically validates it belongs to the `organisationId` from the API key using the `user_agents` table
5. **userAgentId Validation Process** (if provided):
   - Checks if `userAgentId` exists in `user_agents` table (by `id` column)
   - If agent doesn't exist → returns `403 Forbidden`
   - If agent exists, checks if agent's `organisationId` matches `req.organisationId` (from API key)
   - If matches → validation passes
   - If doesn't match → returns `403 Forbidden`
   - Returns `400` if database error occurs during validation
6. **AI Service Calls**: Use `aiService.callAIModel()` to call AI models - the SDK handles retries, API keys, system prompts, and organisationId automatically
7. **System Prompt Handling**: The user-provided `systemPrompt` from the request body is automatically extracted by the SDK and passed to the AI model
8. **Cost Operations**: The `CreditsService` automatically uses `organisationId` from the API key - just call `addCost()` or `checkBalance()` without passing `organisationId`
9. **Cost Format**: Pass any numeric string to `addCost()` - the SDK automatically rounds UP to 2 decimal places (ceiling) to ensure no money is lost
10. **Add Cost After Success**: Only add cost after successful processing
11. **Response Format**: Use `responseHandler.sendFinalResponse()` with validated data
12. **Error Handling**: Always handle errors and use `responseHandler.sendError()`
13. **ESLint**: Use the exact ESLint configuration provided to maintain code quality
14. **No Manual Rounding Required**: The SDK handles all cost rounding automatically - you don't need to round costs manually

---

## Request Payload Structure

### JSON Request Body

```json
{
  "prompt": "Your prompt here",
  "userAgentId": "uuid-of-agent",
  "systemPrompt": "User system prompt"
}
```

**Field Descriptions:**

- `prompt` (required): The user's prompt/question
- `userAgentId` (optional): UUID of the agent - if provided, must belong to the organisation from the API key (validated against `user_agents` table)
- `systemPrompt` (optional): User-provided system prompt for the AI model

**Important Notes:**

- `organisationId` is **NOT** in the request body - it's automatically extracted from the `x-api-key` header by the SDK middleware
- The middleware validates the API key and attaches `organisationId` to `req.organisationId`
- You don't need to validate or pass `organisationId` - it's handled automatically by the SDK

### Example cURL Request

```bash
# With userAgentId (optional)
curl -X POST http://localhost:3000/natural-request \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "prompt": "Analyze this data",
    "userAgentId": "123e4567-e89b-12d3-a456-426614174000",
    "systemPrompt": "You are a data analyst"
  }'

# Without userAgentId (also valid)
curl -X POST http://localhost:3000/natural-request \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "prompt": "Analyze this data",
    "systemPrompt": "You are a data analyst"
  }'
```

---

## Import Reference

### From `@decloudlabs/ap`:

```typescript
// Types
import type {
  RequestPayload,
  ResponseHandlerData,
  AIModelResponse,
  AIService,
  CreditsService,
  ResponseHandler,
  RunNaturalFunctionType,
} from '@decloudlabs/ap';

// Functions
import { initAIAccessPoint } from '@decloudlabs/ap';

// Zod Schemas (MUST USE FOR VALIDATION)
import { responseHandlerDataSchema } from '@decloudlabs/ap';
```

### Zod Types (inferred from schemas):

```typescript
import { z } from 'zod';

// Type inference from schemas
type ResponseHandlerData = z.infer<typeof responseHandlerDataSchema>;

// Custom schema for agent requests
const agentRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required and cannot be empty'),
  systemPrompt: z.string().optional(),
  userAgentId: z.string().uuid('userAgentId must be a valid UUID').optional(), // OPTIONAL
});
type AgentRequest = z.infer<typeof agentRequestSchema>;
```

---

## Environment Variables

Required environment variables:

```bash
POSTGRES_URL=postgresql://user:password@localhost:5432/dbname
MINIMUM_BALANCE=0.01  # Optional, defaults to 0.01
PORT=3000             # Your service port
```

---

## Testing

Test your implementation:

1. **Request Validation**: Send invalid requests and verify Zod validation errors
2. **userAgentId Validation** (Optional):
   - Send valid userAgentId that belongs to organisation - should succeed
   - Send valid userAgentId that doesn't belong to organisation - should return 403
   - Send invalid UUID - should return 400
   - Send request without userAgentId - should succeed (userAgentId is optional)
3. **AI Service Calls**: Verify AI calls are made correctly with retries
4. **Cost Addition**: Verify costs are added correctly after successful processing
5. **Response Format**: Verify responses are returned in the correct format
6. **Error Handling**: Test error scenarios (insufficient balance, AI failures, invalid userAgentId)

---

## Support

For issues or questions, refer to the SDK documentation or contact the development team.
