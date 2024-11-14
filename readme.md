
# Skynet AI Access Point (`sky-ai-accesspoint`)

The `sky-ai-accesspoint` package is designed to manage AI-related operations with integrated service control, cost management, and secure access. It connects to Skynet’s AI infrastructure, providing a streamlined interface for executing AI-driven requests, handling service states, and managing balance requirements.

## Table of Contents
1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Initialization and Setup](#initialization-and-setup)
4. [Middleware Overview](#middleware-overview)
5. [Core Functions](#core-functions)
6. [Endpoint Summary](#endpoint-summary)

---

### 1. Installation

To install `sky-ai-accesspoint` in your project:

```bash
npm install @decloudlabs/sky-ai-accesspoint
```

### 2. Configuration

# Environment Variables Documentation

## 1. `SUBNET_ID`
Represents the unique identifier for a specific subnet within a network, enabling targeted network configuration and management.

## 2. `MONGODB_URL`
The connection string required to connect to a MongoDB database, including details like the database cluster location, authentication credentials, and optional connection parameters.

## 3. `MONGODB_DBNAME`
Specifies the name of the MongoDB database to be used, allowing the application to select the appropriate database within a MongoDB instance.

## 4. `MONGODB_COLLECTION_NAME`
Defines the name of the collection within the database where data records are stored, making it clear which specific data group the application interacts with.

## 5. `JSON_RPC_URL`
The endpoint URL for accessing a JSON-RPC service, commonly used in blockchain networks to interact with decentralized applications or perform various RPC calls.

## 6. `CLUSTER_OPERATOR_PRIVATE_KEY`
A sensitive private key used for authenticating and signing actions performed by a cluster operator; it should be securely stored to prevent unauthorized access.

## 7. `CLUSTER_OPERATOR_WALLET_ADDRESS`
The public wallet address of the cluster operator, typically used in decentralized environments to receive and manage tokens or assets.

## 8. `PORT`
Specifies the port number on which the application server listens, directing incoming requests to the correct application service.

Additional MongoDB connection details may be required if storing balance and session data.

### 3. Initialization and Setup

In your main application file, import and set up the `sky-ai-accesspoint` with your project’s core services.

**Example Initialization**:

```typescript
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { initAIAccessPoint } from '@decloudlabs/sky-ai-accesspoint/lib/init';
import { checkBalance } from '@decloudlabs/sky-ai-accesspoint/lib/middleware/checkBalance';
import { protect } from '@decloudlabs/sky-ai-accesspoint/lib/middleware/auth';
import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
import { getSkyNode } from './clients/skynet';

const app = express();
const port = process.env.PORT || 3000;

const setupAccessPoint = async () => {
    const skyNode: SkyMainNodeJS = await getSkyNode();

    await initAIAccessPoint(
        skyNode,
        checkBalanceCondition,
        applyCosts,
        app,
        runNaturalFunction
    );

    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
};

setupAccessPoint();
```

The `initAIAccessPoint` function sets up the necessary routes and middleware, allowing you to securely manage AI access while enforcing balance checks and service control.

### 4. Core Functions

Here’s an overview of the main functions required for `initAIAccessPoint`:

#### `checkBalanceCondition`

This function halts any active services associated with a given NFT ID. It identifies ongoing services and attempts to stop them, helping manage resources effectively.

```typescript
import { NFTCosts } from '@decloudlabs/sky-ai-accesspoint/lib/types/types';
import { APICallReturn } from '@decloudlabs/sky-cluster-operator/lib/types/types';
import { stopService } from './clients/runpod'; // Assuming `stopService` stops a specific service

const checkBalanceCondition = async (nftCosts: NFTCosts): Promise<APICallReturn<boolean>> => {
    console.log(`Checking running services for NFT ID: ${nftCosts.nftID}`);
    
    const runningServices = await getRunningServices(nftCosts.nftID); // Implement `getRunningServices` to fetch services

    const stoppedServices = [];
    for (const service of runningServices) {
        try {
            console.log(`Stopping service: ${service.id}`);
            const result = await stopService(service.id);
            if (result.success) {
                stoppedServices.push(service.id);
            } else {
                console.error(`Failed to stop service ${service.id}:`, result.error);
            }
        } catch (err) {
            console.error(`Error stopping service ${service.id}:`, err);
        }
    }

    console.log(`Stopped services: ${stoppedServices}`);
    return { success: true, data: true };
};
```

#### `applyCosts`

Calculates and applies the usage costs based on request parameters, which helps manage the user’s balance effectively.

```typescript
import { NFTCosts } from '@decloudlabs/sky-ai-accesspoint/lib/types/types';
import { ethers } from 'ethers';

const applyCosts = async (nftCosts: NFTCosts): Promise<APICallReturn<NFTCosts>> => {
    const additionalCost = ethers.BigNumber.from("10000000000000000"); // Cost in wei
    const updatedCosts = {
        ...nftCosts,
        costs: ethers.BigNumber.from(nftCosts.costs).add(additionalCost).toString()
    };
    
    return { success: true, data: updatedCosts };
};
```

#### `runNaturalFunction`

Processes natural language requests, interprets parameters with OpenAI, and executes operations based on the extracted information.

```typescript
import { Request, Response } from 'express';
import OpenAI from 'openai';
import BalanceRunMain from '@decloudlabs/sky-ai-accesspoint/lib/balanceRunMain';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const runNaturalFunction = async (req: Request, res: Response, runMain: BalanceRunMain): Promise<void> => {
    try {
        const { prompt, nftId } = req.body;

        const completion = await openai.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "Extract necessary parameters for requested operations and return as JSON."
                },
                { role: "user", content: prompt }
            ],
            model: "gpt-3.5-turbo",
            response_format: { type: "json_object" },
        });

        const params = JSON.parse(completion.choices[0].message.content || '{}');

        if (params.question) {
            res.send({ question: params.question });
            return;
        }

        // Perform the operation based on extracted `params.action`
        const response = await /* logic to execute action, e.g., create, start, stop */;
        res.json(response);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
```

### 5. Endpoint Summary

The following endpoints are set up within `initAIAccessPoint`:

- **`POST /natural-request`**: Processes a natural language request and returns a response based on extracted parameters. This endpoint uses `runNaturalFunction` to interpret and execute various AI tasks.

--- 

This documentation provides a comprehensive overview of setting up and using `sky-ai-accesspoint`, with key functions, middleware, and examples tailored to manage secure AI requests and service operations.
