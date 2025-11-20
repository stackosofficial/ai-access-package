# IPFS Service Implementation Guide

This guide will help you implement the AI Access Point SDK in your IPFS upload service. **All request and response validation MUST use Zod schemas** as specified in this guide.

## Table of Contents

1. [Installation](#installation)
2. [ESLint Configuration](#eslint-configuration)
3. [Initialization](#initialization)
4. [Request Validation with Zod](#request-validation-with-zod)
5. [Reading Uploaded Files](#reading-uploaded-files)
6. [Response Format with Zod](#response-format-with-zod)
7. [Adding Costs](#adding-costs)
8. [Complete Example](#complete-example)

---

## Installation

Install the SDK and required dependencies:

```bash
npm install @decloudlabs/ap zod fp-ts multer
npm install --save-dev @types/multer
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
      prettier: fixupPluginRules(prettier),
      import: fixupPluginRules(_import),
    },

    languageOptions: {
      globals: {
        ...globals.node,
      },

      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',

      parserOptions: {
        project: './tsconfig.json',
      },
    },

    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },

    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      'prettier/prettier': 'error',
      'import/order': ['error', { 'newlines-between': 'always', alphabetize: { order: 'asc', caseInsensitive: true } }],
      'sort-imports': [
        'error',
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
          allowSeparatedGroups: true,
        },
      ],
    },
  },
]);
```

---

## Initialization

Initialize the SDK in your service with file upload support:

```typescript
import express from 'express';
import multer from 'multer';
import {
  initAIAccessPoint,
  type RunNaturalFunctionType,
  type AIService,
  type CreditsService,
  type ResponseHandler,
} from '@decloudlabs/ap';

const app = express();
app.use(express.json());

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(), // Store files in memory
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

// Your environment configuration
const env = {
  POSTGRES_URL: process.env.POSTGRES_URL!,
  minimumBalance: process.env.MINIMUM_BALANCE || '0.01',
  appName: 'ipfs-upload-service', // Your service name
};

// Initialize the SDK with file upload support
const initResult = await initAIAccessPoint(env, app, runNaturalFunction, upload);

if (!initResult.success) {
  console.error('Failed to initialize SDK:', initResult.error);
  process.exit(1);
}

console.log('✅ SDK initialized successfully');
```

---

## Request Validation with Zod

**STRICT RULE**: You MUST use Zod for all request validation. Import the schemas from the SDK:

```typescript
import { multipartFormDataSchema, type MultipartFormData, type FileInput } from '@decloudlabs/ap';
import { z } from 'zod';
```

### Example: Validating Multipart Form Data

```typescript
import { multipartFormDataSchema, type MultipartFormData } from '@decloudlabs/ap';
import { z } from 'zod';

// Validate the multipart form data
const validation = multipartFormDataSchema.safeParse({
  prompt: req.body.prompt,
  system_prompt: req.body.system_prompt,
  files: req.files, // From multer
});

if (!validation.success) {
  return res.status(400).json({
    success: false,
    error: `Validation failed: ${validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
  });
}

const { prompt, system_prompt, files } = validation.data;
```

---

## Reading Uploaded Files

Files are available in `req.files` (when using multer). The SDK validates them using the `multipartFormDataSchema`.

### File Structure

Each file has the following structure (validated by Zod):

```typescript
interface FileInput {
  fieldname: string;      // Field name (usually 'files')
  originalname: string;   // Original filename
  encoding: string;       // File encoding
  mimetype: string;       // MIME type (e.g., 'image/png', 'application/pdf')
  buffer: Buffer;         // File content as Buffer
  size: number;           // File size in bytes
}
```

### Example: Reading Files

```typescript
import type { FileInput } from '@decloudlabs/ap';

const runNaturalFunction: RunNaturalFunctionType = async (req, res, aiService, responseHandler, creditsService) => {
  try {
    // 1. Validate request with Zod
    const validation = multipartFormDataSchema.safeParse({
      prompt: req.body.prompt,
      system_prompt: req.body.system_prompt,
      files: req.files, // Array of files from multer
    });

    if (!validation.success) {
      const errorMessages = validation.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      responseHandler.sendError(`Validation failed: ${errorMessages}`, 400);
      return;
    }

    const { files } = validation.data;

    // 2. Process each file
    if (!files || files.length === 0) {
      responseHandler.sendError('No files provided', 400);
      return;
    }

    // 3. Access file data
    for (const file of files) {
      const buffer = file.buffer; // Buffer containing file content
      const filename = file.originalname;
      const mimetype = file.mimetype;
      const size = file.size;

      // Upload to IPFS
      const ipfsUrl = await uploadToIPFS(buffer, filename);
      
      // Process the IPFS URL...
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    responseHandler.sendError(errorMessage, 500);
  }
};
```

### Example: Uploading to IPFS

```typescript
import { create } from 'ipfs-http-client';

// Initialize IPFS client
const ipfs = create({
  host: process.env.IPFS_HOST || 'ipfs.infura.io',
  port: 5001,
  protocol: 'https',
  headers: {
    authorization: `Basic ${Buffer.from(`${process.env.IPFS_PROJECT_ID}:${process.env.IPFS_PROJECT_SECRET}`).toString('base64')}`,
  },
});

async function uploadToIPFS(buffer: Buffer, filename: string): Promise<string> {
  // Add file to IPFS
  const result = await ipfs.add({
    path: filename,
    content: buffer,
  });

  // Return IPFS URL
  return `https://ipfs.io/ipfs/${result.cid.toString()}`;
}
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
- `sendFile(buffer: Buffer, filename: string, mimetype: string)`: Send file response (not needed for IPFS)
- `isStreamingRequest()`: Check if request is streaming

**All responses are automatically validated with Zod** by the ResponseHandler.

### Example: Sending IPFS URL Response

```typescript
// After uploading to IPFS
const ipfsUrl = await uploadToIPFS(file.buffer, file.originalname);

// Send response with IPFS URL
responseHandler.sendFinalResponse({
  success: true,
  content: ipfsUrl, // IPFS URL as string
});
```

---

## Adding Costs

**IMPORTANT**: After successfully uploading a file to IPFS, you MUST add the cost using the `CreditsService`.

### CreditsService Interface

```typescript
interface CreditsService {
  addCost(amountDollars: string): Promise<void>;
  checkBalance(requiredDollars: string): Promise<boolean>;
}
```

### Example: Adding Cost After IPFS Upload

```typescript
const runNaturalFunction: RunNaturalFunctionType = async (req, res, aiService, responseHandler, creditsService) => {
  try {
    // 1. Validate request with Zod
    const validation = multipartFormDataSchema.safeParse({
      prompt: req.body.prompt,
      system_prompt: req.body.system_prompt,
      files: req.files,
    });

    if (!validation.success) {
      responseHandler.sendError('Invalid request payload', 400);
      return;
    }

    const { files } = validation.data;

    if (!files || files.length === 0) {
      responseHandler.sendError('No files provided', 400);
      return;
    }

    // 2. Upload files to IPFS
    const ipfsUrls: string[] = [];
    for (const file of files) {
      const ipfsUrl = await uploadToIPFS(file.buffer, file.originalname);
      ipfsUrls.push(ipfsUrl);
    }

    // 3. Calculate cost (e.g., $0.01 per file, $0.001 per MB)
    const baseCostPerFile = 0.01;
    const costPerMB = 0.001;
    let totalCost = 0;

    for (const file of files) {
      const fileCost = baseCostPerFile + (file.size / (1024 * 1024)) * costPerMB;
      totalCost += fileCost;
    }

    const costDollars = String(totalCost); // e.g., "0.023" will be rounded UP to "0.03" by SDK

    // 4. Add cost using CreditsService
    await creditsService.addCost(costDollars);

    // 5. Send response with IPFS URLs
    responseHandler.sendFinalResponse({
      success: true,
      content: JSON.stringify({ urls: ipfsUrls }), // Return JSON string with IPFS URLs
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    responseHandler.sendError(errorMessage, 500);
  }
};
```

### Cost Format

**The SDK automatically rounds all costs UP to 2 decimal places (ceiling).** This ensures we never lose money by rounding down. You can pass any numeric string, and it will be automatically rounded up:

- `"0.123"` → automatically rounded UP to `"0.13"` (not `"0.12"`)
- `"0.0053"` → automatically rounded UP to `"0.01"`
- `"1.234"` → automatically rounded UP to `"1.24"` (not `"1.23"`)
- `"0.5"` → automatically rounded UP to `"0.50"`
- `"10"` → automatically rounded UP to `"10.00"`
- `"0.999"` → automatically rounded UP to `"1.00"`
- `"0.121"` → automatically rounded UP to `"0.13"` (not `"0.12"`)

**Valid formats:**

- Any numeric string: `"0.05"`, `"1.234"`, `"10"`, `"0.0053"`, `"0.123"`
- The SDK will automatically round UP to 2 decimal places (ceiling)

**Invalid formats:**

- Non-numeric strings: `"abc"`, `"$0.05"` (dollar sign not allowed)
- Negative values: `"-0.05"` (will throw an error)

---

## Complete Example

Here's a complete example of an IPFS upload service:

```typescript
import express from 'express';
import multer from 'multer';
import { create } from 'ipfs-http-client';
import {
  initAIAccessPoint,
  multipartFormDataSchema,
  responseHandlerDataSchema,
  type RunNaturalFunctionType,
  type AIService,
  type CreditsService,
  type ResponseHandler,
  type MultipartFormData,
  type FileInput,
} from '@decloudlabs/ap';
import { z } from 'zod';

const app = express();
app.use(express.json());

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

// Initialize IPFS client
const ipfs = create({
  host: process.env.IPFS_HOST || 'ipfs.infura.io',
  port: 5001,
  protocol: 'https',
  headers: {
    authorization: `Basic ${Buffer.from(`${process.env.IPFS_PROJECT_ID}:${process.env.IPFS_PROJECT_SECRET}`).toString('base64')}`,
  },
});

// Upload file to IPFS
async function uploadToIPFS(buffer: Buffer, filename: string): Promise<string> {
  const result = await ipfs.add({
    path: filename,
    content: buffer,
  });
  return `https://ipfs.io/ipfs/${result.cid.toString()}`;
}

// Calculate cost based on file size
function calculateCost(files: FileInput[]): string {
  const baseCostPerFile = 0.01;
  const costPerMB = 0.001;
  let totalCost = 0;

  for (const file of files) {
    const fileCost = baseCostPerFile + (file.size / (1024 * 1024)) * costPerMB;
    totalCost += fileCost;
  }

  // SDK automatically rounds UP to 2 decimal places (ceiling)
  return String(totalCost);
}

// Main handler function
const runNaturalFunction: RunNaturalFunctionType = async (req, res, aiService, responseHandler, creditsService) => {
  try {
    // 1. Validate request with Zod (STRICT REQUIREMENT)
    const validation = multipartFormDataSchema.safeParse({
      prompt: req.body.prompt,
      system_prompt: req.body.system_prompt,
      files: req.files, // From multer
    });

    if (!validation.success) {
      const errorMessages = validation.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      responseHandler.sendError(`Validation failed: ${errorMessages}`, 400);
      return;
    }

    const { files } = validation.data;

    if (!files || files.length === 0) {
      responseHandler.sendError('No files provided', 400);
      return;
    }

    // 2. Check balance before processing (optional but recommended)
    const estimatedCost = calculateCost(files);
    const hasBalance = await creditsService.checkBalance(estimatedCost);
    if (!hasBalance) {
      responseHandler.sendError('Insufficient balance', 402);
      return;
    }

    // 3. Upload files to IPFS
    const ipfsUrls: string[] = [];
    for (const file of files) {
      const ipfsUrl = await uploadToIPFS(file.buffer, file.originalname);
      ipfsUrls.push(ipfsUrl);
    }

    // 4. Calculate actual cost
    const costDollars = calculateCost(files);

    // 5. Add cost (MUST be done after successful upload)
    await creditsService.addCost(costDollars);

    // 6. Send response with IPFS URLs
    responseHandler.sendFinalResponse({
      success: true,
      content: JSON.stringify({
        urls: ipfsUrls,
        count: ipfsUrls.length,
      }),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in IPFS upload:', error);
    responseHandler.sendError(errorMessage, 500);
  }
};

// Initialize SDK
const env = {
  POSTGRES_URL: process.env.POSTGRES_URL!,
  minimumBalance: process.env.MINIMUM_BALANCE || '0.01',
  appName: 'ipfs-upload-service',
};

const initResult = await initAIAccessPoint(env, app, runNaturalFunction, upload);

if (!initResult.success) {
  console.error('Failed to initialize SDK:', initResult.error);
  process.exit(1);
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ IPFS upload service running on port ${PORT}`);
});
```

---

## Key Points to Remember

1. **Zod Validation is MANDATORY**: Always use Zod schemas from `@decloudlabs/ap` for request/response validation
2. **File Uploads**: Use `multipartFormDataSchema` to validate multipart form data with files
3. **File Access**: Files are available in `req.files` (from multer) and validated by the SDK
4. **Cost Format**: Pass any numeric string to `addCost()` - the SDK automatically rounds UP to 2 decimal places (ceiling) to ensure no money is lost (e.g., `"0.123"` becomes `"0.13"`, `"0.0053"` becomes `"0.01"`)
5. **Add Cost After Success**: Only add cost after successful IPFS upload
6. **Response Format**: Return IPFS URLs as JSON string in the `content` field
7. **Error Handling**: Always handle errors and use `responseHandler.sendError()`
8. **ESLint**: Use the exact ESLint configuration provided to maintain code quality
9. **No Manual Rounding Required**: The SDK handles all cost rounding automatically - you don't need to round costs manually
10. **Multer Configuration**: Configure multer with `memoryStorage()` to store files in memory for processing

---

## Import Reference

### From `@decloudlabs/ap`:

```typescript
// Types
import type {
  RequestPayload,
  MultipartFormData,
  FileInput,
  ResponseHandlerData,
  AIService,
  CreditsService,
  ResponseHandler,
  RunNaturalFunctionType,
} from '@decloudlabs/ap';

// Functions
import { initAIAccessPoint } from '@decloudlabs/ap';

// Zod Schemas (MUST USE FOR VALIDATION)
import {
  requestPayloadSchema,
  multipartFormDataSchema,
  responseHandlerDataSchema,
  fileInputSchema,
} from '@decloudlabs/ap';
```

### Zod Types (inferred from schemas):

```typescript
import { z } from 'zod';

// Type inference from schemas
type MultipartFormData = z.infer<typeof multipartFormDataSchema>;
type FileInput = z.infer<typeof fileInputSchema>;
type ResponseHandlerData = z.infer<typeof responseHandlerDataSchema>;
```

---

## Environment Variables

Required environment variables:

```bash
POSTGRES_URL=postgresql://user:password@localhost:5432/dbname
MINIMUM_BALANCE=0.01  # Optional, defaults to 0.01
PORT=3000             # Your service port

# IPFS Configuration
IPFS_HOST=ipfs.infura.io
IPFS_PROJECT_ID=your_project_id
IPFS_PROJECT_SECRET=your_project_secret
```

---

## Testing

Test your implementation:

1. **Request Validation**: Send invalid requests and verify Zod validation errors
2. **File Upload**: Verify files are received and validated correctly
3. **IPFS Upload**: Verify files are uploaded to IPFS and URLs are returned
4. **Cost Addition**: Verify costs are added correctly after successful upload
5. **Response Format**: Verify IPFS URLs are returned in the correct format
6. **Error Handling**: Test error scenarios (insufficient balance, upload failures, no files provided)

---

## Support

For issues or questions, refer to the SDK documentation or contact the development team.

