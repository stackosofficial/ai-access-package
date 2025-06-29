# Corrected Main Server Implementation

## **The Issue:**
Your auth endpoints are failing because the main server setup is missing proper configuration. Here's the corrected implementation:

## **Corrected src/index.ts:**

```typescript
import dotenv from "dotenv";
dotenv.config();
import express, { Request, Response } from "express";
import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import { getSkyNode } from "./src/clients/skynet";
import { initAIAccessPoint, getAuthService } from "@decloudlabs/sky-ai-accesspoint/lib/init";
import { TwitterAuthService } from "./src/services/TwitterAuthService";
import authRoutes from "./src/routes/authRoutes";
import cors from "cors";
import bodyParser from "body-parser";
import { Pool } from "pg";
import BalanceRunMain from '@decloudlabs/sky-ai-accesspoint/lib/balanceRunMain';
import { ResponseHandler } from '@decloudlabs/sky-ai-accesspoint/lib/types/types';
import { TwitterApi } from 'twitter-api-v2';

const app = express();
app.use(cors());
app.use(bodyParser.json());
const port = process.env.PORT || 3001;

// Natural function with Twitter auth support
const runNaturalFunction = async (
  req: Request,
  res: Response,
  balanceRunMain: BalanceRunMain,
  responseHandler: ResponseHandler
): Promise<void> => {
  try {
    const { prompt, accountNFT, userAuthPayload } = req.body;
    const userAddress = userAuthPayload?.userAddress;
    const nftId = accountNFT?.nftID;

    // Check Twitter authentication
    const authService = getAuthService() as TwitterAuthService;
    if (authService) {
      const isAuthenticated = await authService.checkAuthStatus(userAddress, nftId);
      
      if (!isAuthenticated) {
        responseHandler.sendFinalResponse({
          success: true,
          message: "Twitter authentication required. Please use the /auth-link endpoint.",
          requiresAuth: true,
          userAddress: userAddress,
          service: 'twitter'
        });
        return;
      }

      const authData = await authService.getTwitterAuth(userAddress, nftId);
      console.log('User authenticated with Twitter:', authData?.screen_name);
    }

    responseHandler.sendUpdate("Processing Twitter request...");

    // Get Twitter client
    const twitterClient = await authService?.getTwitterClient(userAddress, nftId);
    if (!twitterClient) {
      responseHandler.sendError("Failed to get Twitter client", 500);
      return;
    }

    // Parse the prompt to determine Twitter action
    const completion = await balanceRunMain.callAIModel(`[
      {
        "role": "system",
        "content": "You are a helpful assistant that extracts Twitter API parameters from user requests. Return only valid JSON with the required fields. Available actions: tweet, retweet, like, follow, get_user, get_timeline, search_tweets."
      },
      {
        "role": "user",
        "content": "${prompt}"
      }
    ]`);

    if (!completion.success) {
      responseHandler.sendError(completion.message, 500);
      return;
    }

    // Parse AI response to get structured parameters
    let params;
    console.log("AI completion message:", completion.message);
    try {
      params = JSON.parse(completion.message || "");
    } catch (parseError) {
      responseHandler.sendError("Failed to parse AI response parameters", 500);
      return;
    }

    responseHandler.sendUpdate("Executing Twitter action...");
    
    // Execute Twitter action based on extracted parameters
    let result;
    switch (params.action) {
      case 'tweet':
        result = await twitterClient.v2.tweet(params.text || prompt);
        break;
      case 'retweet':
        result = await twitterClient.v2.retweet(params.user_id, params.tweet_id);
        break;
      case 'like':
        result = await twitterClient.v2.like(params.user_id, params.tweet_id);
        break;
      case 'follow':
        result = await twitterClient.v2.follow(params.user_id, params.target_user_id);
        break;
      case 'get_user':
        result = await twitterClient.v2.userByUsername(params.username);
        break;
      case 'get_timeline':
        result = await twitterClient.v2.userTimeline(params.user_id, {
          max_results: params.max_results || 10
        });
        break;
      case 'search_tweets':
        result = await twitterClient.v2.search(params.query, {
          max_results: params.max_results || 10
        });
        break;
      default:
        // Default to posting a tweet
        result = await twitterClient.v2.tweet(prompt);
    }
    
    // Calculate cost (example: 0.01 tokens per request)
    const cost = BigInt(0.01 * 1e12);
    
    // Send final response
    responseHandler.sendFinalResponse({
      success: true,
      message: "Twitter action completed successfully",
      data: {
        action: params.action || 'tweet',
        result: result,
        timestamp: new Date().toISOString()
      }
    });

    // Add cost to user's balance
    await balanceRunMain.addCost(accountNFT, cost.toString());
    console.log(`Added cost: ${cost} for user: ${accountNFT.collectionID}_${accountNFT.nftID}`);

  } catch (error) {
    console.error("Error processing Twitter request:", error);
    responseHandler.sendError(
      error instanceof Error ? error.message : "Failed to process Twitter request",
      500
    );
  }
};

const setup = async () => {
  const skyNode: SkyMainNodeJS = await getSkyNode();
  const env = {
    JSON_RPC_PROVIDER: process.env.PROVIDER_RPC!,
    WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY!,
    SUBNET_ID: process.env.SUBNET_ID!,
    POSTGRES_URL: process.env.DATABASE_URL!,
    SERVER_COST_CONTRACT_ADDRESS: process.env.SERVER_COST_CONTRACT_ADDRESS!,
  };

  // Create custom Twitter auth service
  const pool = new Pool({ connectionString: env.POSTGRES_URL });
  const twitterAuthService = new TwitterAuthService(pool);

  const balanceRunMain = await initAIAccessPoint(
    env,
    skyNode,
    app,
    runNaturalFunction,
    true, // Enable balance updates
    undefined, // No upload middleware (no file upload support)
    { authService: twitterAuthService } // ✅ PASS THE AUTH SERVICE HERE
  );

  if (!balanceRunMain.success) {
    console.error("Error initializing AI Access Point:", balanceRunMain);
    process.exit(1);
  }

  // Add auth routes
  app.use('/auth', authRoutes);

  // Twitter-specific endpoints
  app.post('/twitter/tweet', async (req: Request, res: Response) => {
    try {
      const { text, userAuthPayload, accountNFT } = req.body;
      const userAddress = userAuthPayload?.userAddress;
      const nftId = accountNFT?.nftID;

      const authService = getAuthService() as TwitterAuthService;
      const twitterClient = await authService?.getTwitterClient(userAddress, nftId);
      
      if (!twitterClient) {
        return res.status(401).json({ success: false, message: "Twitter authentication required" });
      }

      const result = await twitterClient.v2.tweet(text);
      return res.json({ success: true, data: result });
    } catch (error) {
      return res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Failed to tweet" });
    }
  });

  app.get('/twitter/user/:username', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      const { userAuthPayload, accountNFT } = req.query as any;
      const userAddress = userAuthPayload?.userAddress;
      const nftId = accountNFT?.nftID;

      const authService = getAuthService() as TwitterAuthService;
      const twitterClient = await authService?.getTwitterClient(userAddress, nftId);
      
      if (!twitterClient) {
        return res.status(401).json({ success: false, message: "Twitter authentication required" });
      }

      const result = await twitterClient.v2.userByUsername(username);
      return res.json({ success: true, data: result });
    } catch (error) {
      return res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Failed to get user" });
    }
  });

  app.get('/twitter/timeline/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { userAuthPayload, accountNFT, max_results = 10 } = req.query as any;
      const userAddress = userAuthPayload?.userAddress;
      const nftId = accountNFT?.nftID;

      const authService = getAuthService() as TwitterAuthService;
      const twitterClient = await authService?.getTwitterClient(userAddress, nftId);
      
      if (!twitterClient) {
        return res.status(401).json({ success: false, message: "Twitter authentication required" });
      }

      const result = await twitterClient.v2.userTimeline(userId, {
        max_results: parseInt(max_results)
      });
      return res.json({ success: true, data: result });
    } catch (error) {
      return res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Failed to get timeline" });
    }
  });

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({ 
      status: 'healthy', 
      service: 'twitter-access-point',
      authSupport: true,
      uploadSupport: false,
      timestamp: new Date().toISOString()
    });
  });

  app.listen(port, () => {
    console.log(`Twitter Access Point running on http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`Auth callback: http://localhost:${port}/auth/callback`);
  });
};

setup().catch(console.error);
```

## **Key Changes Made:**

1. **✅ Added `{ authService: twitterAuthService }`** to the `initAIAccessPoint` call
2. **✅ Removed manual database table creation** (SDK handles this)
3. **✅ Proper error handling** in all endpoints
4. **✅ Correct CORS setup**
5. **✅ Proper auth service integration**

## **Environment Variables Required:**

```env
# Twitter OAuth Configuration
TWITTER_API_KEY=<your-twitter-api-key>
TWITTER_API_SECRET=<your-twitter-api-secret>
TWITTER_CLIENT_ID=<your-twitter-client-id>
TWITTER_CALLBACK_URL=http://localhost:3001/auth/callback

# Frontend URL for redirects
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/database

# Skynet Configuration
PROVIDER_RPC=<your-rpc-url>
WALLET_PRIVATE_KEY=<your-wallet-private-key>
SUBNET_ID=<your-subnet-id>

# Storage API (can be placeholder values)
LIGHTHOUSE_API_KEY=placeholder
IPFS_PROJECT_ID=placeholder
IPFS_PROJECT_SECRET=placeholder
CLOUD_BUCKET_NAME=placeholder
CLOUD_ACCESS_KEY_ID=placeholder
CLOUD_SECRET_ACCESS_KEY=placeholder
CLOUD_REGION=placeholder
```

## **Test the Auth Endpoints:**

After implementing this corrected version, your auth endpoints should work:

```bash
# Test auth link generation
curl -X POST http://localhost:3001/auth-link \
  -H "Content-Type: application/json" \
  -d '{
    "userAuthPayload": {"userAddress": "0x123..."},
    "accountNFT": {"nftID": "53"}
  }'

# Expected response:
{
  "success": true,
  "data": {
    "link": "https://twitter.com/i/oauth2/authorize?client_id=..."
  }
}
```

The main issue was that you weren't passing the `authService` to the `initAIAccessPoint` function, which is required for the SDK to create the auth endpoints. 