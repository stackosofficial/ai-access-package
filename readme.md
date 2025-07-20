# Skynet AI Access Point

The `sky-ai-accesspoint` package provides a secure and efficient way to manage AI-related operations with integrated cost management and access control. It connects to Skynet's infrastructure and handles balance tracking for NFT-based access control.

## Table of Contents

1. [Installation](#installation)
2. [Environment Configuration](#environment-configuration)
3. [Usage Guide](#usage-guide)
4. [API Reference](#api-reference)

## Installation

```bash
npm install @decloudlabs/sky-ai-accesspoint
```

## Environment Configuration

The following environment variables are required:

```env
# Blockchain Configuration
JSON_RPC_PROVIDER=<your-json-rpc-url>
WALLET_PRIVATE_KEY=<your-wallet-private-key>
SUBNET_ID=<your-subnet-id>

# Firebase Configuration
FIREBASE_PROJECT_ID=<your-firebase-project-id>
FIREBASE_CLIENT_EMAIL=<your-firebase-client-email>
FIREBASE_PRIVATE_KEY=<your-firebase-private-key>

# OpenAI Configuration
OPENAI_API_KEY=<your-openai-api-key>
```

## Usage Guide

### Basic Setup

Here's how to initialize and use the AI Access Point:

```typescript
import express from "express";
import { initAIAccessPoint } from "@decloudlabs/sky-ai-accesspoint";
import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";

const app = express();
app.use(express.json());

// Define your natural language processing function
const runNaturalFunction = async (
  req: Request,
  res: Response,
  balanceRunMain: BalanceRunMain
) => {
  try {
    // Extract the request parameters
    const { messages } = req.body;

    // Call the AI model
    const response = await balanceRunMain.callAIModel(messages);

    // Send the response
    res.json(response);
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Failed to process request" });
  }
};

// Initialize the access point
const main = async () => {
  const skyNode = new SkyMainNodeJS(/* your config */);

  const env = {
    JSON_RPC_PROVIDER: process.env.JSON_RPC_PROVIDER!,
    WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY!,
    SUBNET_ID: process.env.SUBNET_ID!,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID!,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL!,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY!,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
    SERVER_COST_CONTRACT_ADDRESS: "", // Will be set automatically
  };

  const balanceRunMain = await initAIAccessPoint(
    env,
    skyNode,
    app,
    runNaturalFunction,
    true // Set to true to enable automatic balance updates
  );

  app.listen(3000, () => {
    console.log("Server running on port 3000");
  });
};

main().catch(console.error);
```

### Making Requests

The package exposes a `/natural-request` endpoint that handles AI requests. Here's how to use it:

```typescript
// Example request
const request = {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer <your-auth-token>",
  },
  body: JSON.stringify({
    accountNFT: {
      collectionID: "your-collection-id",
      nftID: "your-nft-id",
    },
    prompt: "process this request",
    userAuthPayload: {
      message: "1713033600000",
      signature: "0x123",
      userAddress: "0x123",
    }, // get this by calling skynet.appManager.getUrsulaAuth()
  }),
};
```

### Cost Management

The package automatically handles cost tracking for NFT-based access. Costs are stored in Firebase and can be managed using the `BalanceRunMain` class:

```typescript
// Example of adding costs to an NFT
const addCost = async (accountNFT, cost) => {
  const response = await balanceRunMain.addCost(accountNFT, cost);
  if (response.success) {
    console.log("Cost added successfully");
  } else {
    console.error("Failed to add cost:", response.data);
  }
};
```

## API Reference

### initAIAccessPoint

Initializes the AI Access Point with the necessary configuration and middleware.

```typescript
function initAIAccessPoint(
  env: ENVDefinition,
  skyNode: SkyMainNodeJS,
  app: express.Application,
  runNaturalFunction: (
    req: Request,
    res: Response,
    balanceRunMain: BalanceRunMain
  ) => Promise<void>,
  runUpdate: boolean
): Promise<BalanceRunMain>;
```

### BalanceRunMain

The main class that handles balance management and AI model interactions.

Key methods:

- `addCost(accountNFT: AccountNFT, cost: string)`: Add costs to an NFT
- `callAIModel(messages: ChatCompletionMessageParam[])`: Make AI model calls
- `setup()`: Initialize the service
- `update()`: Run periodic balance updates

### Authentication

The package supports optional third-party authentication. When no auth service is configured, authentication is completely skipped.

#### No Authentication (Default)

```typescript
const balanceRunMain = await initAIAccessPoint(
  env,
  skyNode,
  app,
  runNaturalFunction,
  true
);
```

#### With Custom Authentication

```typescript
import { AuthService } from '@decloudlabs/sky-ai-accesspoint';

class MyCustomAuthService extends AuthService {
  async generateAuthLink(userAddress: string, nftId: string): Promise<string> {
    // Implement your third-party auth link generation
    return `https://your-auth-provider.com/auth?user=${userAddress}&nft=${nftId}`;
  }
}

const balanceRunMain = await initAIAccessPoint(
  env,
  skyNode,
  app,
  runNaturalFunction,
  true,
  undefined, // upload
  {
    authServiceClass: MyCustomAuthService
  }
);
```

For more details, see [AUTH_USAGE.md](./AUTH_USAGE.md).

### Security

The package includes built-in middleware for:

- Authentication (`protect` middleware)
- Balance checking (`checkBalance` middleware)
- NFT ownership verification

All endpoints are protected and require proper authentication and authorization.

## Error Handling

The package provides detailed error handling and logging:

```typescript
try {
  const response = await balanceRunMain.addCost(accountNFT, cost);
  if (!response.success) {
    console.error("Operation failed:", response.data);
  }
} catch (error) {
  console.error("Unexpected error:", error);
}
```

For more examples and detailed documentation, visit our [GitHub repository](https://github.com/stackosofficial/skynet_accesspoint_example).
