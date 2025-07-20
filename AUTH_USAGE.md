# Authentication Service Usage

## Overview

The AI Access Point supports optional third-party authentication. When no auth service is configured, authentication is completely skipped and all requests proceed normally.

## Basic Usage (No Auth)

If you don't need authentication, simply initialize without an auth service:

```typescript
const balanceRunMain = await initAIAccessPoint(
  env,
  skyNode,
  app,
  runNaturalFunction,
  false
);
```

This will:
- Skip all authentication checks
- Not create any auth-related endpoints
- Allow all requests to proceed normally

## Using Custom Authentication

If you need third-party authentication, create a custom auth service:

```typescript
import { AuthService } from '@decloudlabs/sky-ai-accesspoint';

class MyCustomAuthService extends AuthService {
  async generateAuthLink(userAddress: string, nftId: string): Promise<string> {
    // Implement your third-party auth link generation
    // e.g., OAuth URL, magic link, etc.
    return `https://your-auth-provider.com/auth?user=${userAddress}&nft=${nftId}`;
  }

  async revokeAuth(userAddress: string, nftId: string): Promise<void> {
    // Optional: Implement third-party auth revocation
    await this.revokeThirdPartyTokens(userAddress, nftId);
    
    // Always call parent to delete from database
    await super.revokeAuth(userAddress, nftId);
  }

  private async revokeThirdPartyTokens(userAddress: string, nftId: string) {
    // Call your third-party API to revoke tokens
  }
}

// Initialize with custom auth service
const balanceRunMain = await initAIAccessPoint(
  env,
  skyNode,
  app,
  runNaturalFunction,
  false,
  undefined, // upload
  {
    authServiceClass: MyCustomAuthService
  }
);
```

## Available Endpoints (when auth service is configured)

- `POST /auth-link` - Generate authentication link
- `POST /auth-status` - Check authentication status
- `POST /revoke-auth` - Revoke authentication

## Authentication Flow

1. User makes request with `walletAddress` and `accountNFT.nftID`
2. System checks if user is authenticated
3. If not authenticated, returns auth link
4. User authenticates via the link
5. Future requests proceed normally

## Database Schema

The auth system uses the `auth_data` table:

```sql
CREATE TABLE auth_data (
  user_address TEXT NOT NULL,
  nft_id TEXT NOT NULL,
  backend_id TEXT NOT NULL DEFAULT 'default',
  auth_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_address, nft_id, backend_id)
);
```

The `auth_data` JSONB field can store any authentication data (tokens, user info, etc.). 