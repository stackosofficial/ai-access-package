# Twitter Access Point Implementation Issues

## 1. **Missing Dependencies**
Your implementation uses `twitter-api-v2` but it's not in your `package.json`. Add this dependency:

```json
{
  "dependencies": {
    "twitter-api-v2": "^1.15.0"
  }
}
```

## 2. **Missing Import Statements**
Your implementation references several imports that don't exist:

### Missing Files:
- `src/clients/skynet.ts` - Contains `getSkyNode()` function
- `src/services/TwitterAuthService.ts` - Your Twitter auth service
- `src/routes/authRoutes.ts` - Auth routes implementation

### Missing Imports in Main File:
```typescript
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { Pool } from "pg";
```

## 3. **Incorrect SkyNode Configuration**
Your SkyNode initialization is missing required properties. The correct structure should be:

```typescript
import SkyEnvConfigNodeJS from "@decloudlabs/skynet/lib/types/types";

const envConfig: SkyEnvConfigNodeJS = {
  JRPC_PROVIDER: process.env.PROVIDER_RPC!,
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY!,
  STORAGE_API: {
    LIGHTHOUSE: {
      LIGHTHOUSE_API_KEY: process.env.LIGHTHOUSE_API_KEY || "placeholder"
    },
    IPFS: {
      PROJECT_ID: process.env.IPFS_PROJECT_ID || "placeholder",
      PROJECT_SECRET: process.env.IPFS_PROJECT_SECRET || "placeholder"
    },
    CLOUD: {
      BUCKET_NAME: process.env.CLOUD_BUCKET_NAME || "placeholder",
      ACCESS_KEY_ID: process.env.CLOUD_ACCESS_KEY_ID || "placeholder",
      SECRET_ACCESS_KEY: process.env.CLOUD_SECRET_ACCESS_KEY || "placeholder",
      REGION: process.env.CLOUD_REGION || "placeholder"
    }
  }
};
```

## 4. **Database Schema Mismatch**
Your implementation creates a custom `auth_data` table, but the SDK already provides this. Remove this code:

```typescript
// ❌ REMOVE THIS - SDK handles table creation
await pool.query(`
  CREATE TABLE IF NOT EXISTS auth_data (
    user_address VARCHAR(42) NOT NULL,
    nft_id VARCHAR(255) NOT NULL,
    auth_data JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_address, nft_id)
  );
`);
```

## 5. **Incorrect AuthService Implementation**
Your `TwitterAuthService` has several issues:

### ❌ **DON'T Override These Methods:**
```typescript
// ❌ REMOVE - Use base class implementation
// async checkAuthStatus(userAddress: string, nftId: string): Promise<boolean> {
//   // Base class handles this correctly
// }

// ❌ REMOVE - Use base class implementation  
// async getAuth(userAddress: string, nftId: string): Promise<any | null> {
//   // Base class handles this correctly
// }
```

### ✅ **ONLY Override These Methods:**
```typescript
// ✅ REQUIRED - Only override this abstract method
async generateAuthLink(userAddress: string, nftId: string): Promise<string> {
  const state = crypto.randomBytes(32).toString('hex');
  const stateData = { userAddress, service: 'twitter', timestamp: Date.now(), nftId };
  
  // Store state for validation
  global.authStates = global.authStates || new Map();
  global.authStates.set(state, { ...stateData, createdAt: Date.now() });

  return `https://twitter.com/i/oauth2/authorize?client_id=${process.env.TWITTER_CLIENT_ID}&redirect_uri=${process.env.TWITTER_CALLBACK_URL}&scope=tweet.read%20tweet.write%20users.read&response_type=code&state=${state}`;
}

// ✅ OPTIONAL - Override saveAuth to include service type
async saveAuth(userAddress: string, nftId: string, authData: any): Promise<void> {
  try {
    const dataWithService = {
      ...authData,
      service: 'twitter', // Store service type in JSON
      updatedAt: new Date().toISOString()
    };
    
    await this.pool.query(
      `INSERT INTO auth_data (user_address, nft_id, auth_data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_address, nft_id)
       DO UPDATE SET auth_data = $3, updated_at = NOW()`,
      [userAddress, nftId, JSON.stringify(dataWithService)]
    );
  } catch (error) {
    console.error('Error saving auth data:', error);
    throw error;
  }
}
```

## 6. **Missing Environment Variables**
Add these to your `.env` file:

```env
# Twitter OAuth Configuration
TWITTER_API_KEY=<your-twitter-api-key>
TWITTER_API_SECRET=<your-twitter-api-secret>
TWITTER_CLIENT_ID=<your-twitter-client-id>
TWITTER_CALLBACK_URL=http://localhost:3001/auth/callback

# Frontend URL for redirects
FRONTEND_URL=http://localhost:3000

# Storage API (can be placeholder values)
LIGHTHOUSE_API_KEY=placeholder
IPFS_PROJECT_ID=placeholder
IPFS_PROJECT_SECRET=placeholder
CLOUD_BUCKET_NAME=placeholder
CLOUD_ACCESS_KEY_ID=placeholder
CLOUD_SECRET_ACCESS_KEY=placeholder
CLOUD_REGION=placeholder
```

## 7. **Incorrect OAuth Flow**
Your OAuth callback uses incorrect parameters. Twitter OAuth2 uses `code` and `state`, not `oauth_token` and `oauth_verifier`:

```typescript
// ❌ WRONG - This is OAuth1.0a format
const { oauth_token, oauth_verifier, state, denied } = req.query;

// ✅ CORRECT - This is OAuth2.0 format
const { code, state, error } = req.query;
```

## 8. **Missing Error Handling**
Your implementation lacks proper error handling for:
- Invalid OAuth responses
- Database connection failures
- Twitter API rate limits
- Token expiration

## 9. **Incorrect Test Script Structure**
Your test script is embedded in the main file. It should be separate:

```typescript
// Create separate test file: test.ts
import axios from 'axios';
import { getSkyNode } from './src/clients/skynet';
// ... rest of test implementation
```

## 10. **Missing Type Definitions**
Add proper TypeScript types:

```typescript
// Add to your types file
declare global {
  var authStates: Map<string, any> | undefined;
}

interface TwitterAuthData {
  service: 'twitter';
  access_token: string;
  access_secret: string;
  screen_name: string;
  user_id: string;
  profile: any;
  connectedAt: string;
}
```

## 11. **Incorrect File Structure**
Your implementation should be split into separate files:

```
src/
├── index.ts                    # Main server
├── clients/
│   └── skynet.ts              # SkyNode client
├── services/
│   └── TwitterAuthService.ts  # Twitter auth service
├── routes/
│   └── authRoutes.ts          # Auth routes
└── test.ts                    # Test script
```

## 12. **Missing CORS Configuration**
Add proper CORS setup:

```typescript
import cors from "cors";

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
```

## Summary
The main issues are:
1. Missing dependencies and imports
2. Incorrect SkyNode configuration
3. Overriding forbidden AuthService methods
4. Wrong OAuth flow implementation
5. Missing environment variables
6. Incorrect file structure

Fix these issues and your implementation should work correctly with the Sky AI Access Point SDK. 