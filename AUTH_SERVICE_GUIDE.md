# Third-Party Authentication Service Guide

This guide explains how to implement third-party authentication (Google, Twitter, etc.) in your service using the AI Access Point SDK. The SDK provides endpoints and interfaces for managing authentication with external providers.

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Auth Service Interface](#auth-service-interface)
4. [Implementing Your Auth Service](#implementing-your-auth-service)
5. [SDK Integration](#sdk-integration)
6. [Auth Endpoints](#auth-endpoints)
7. [Complete Example](#complete-example)
8. [Database Schema](#database-schema)
9. [Error Handling](#error-handling)

---

## Overview

The SDK provides a flexible authentication system that allows services to integrate with third-party providers (Google, Twitter, etc.). The system supports:

- **Organisation-level auth**: Authentication at the organisation level (when `userAgentId` is not provided)
- **Agent-level auth**: Authentication specific to a user agent (when `userAgentId` is provided)
- **Service-specific auth**: Each service (identified by `appName`) can have its own auth configuration

### How It Works

1. **Service Implementation**: Your service implements the `AuthService` interface with three methods
2. **SDK Endpoints**: The SDK provides four endpoints for managing auth:
   - `POST /auth/check` - Check if authentication exists
   - `POST /auth/generate` - Generate authentication link
   - `POST /auth/save` - Save authentication data after OAuth callback
   - `DELETE /auth/revoke` - Revoke/delete authentication
3. **Database Storage**: Auth data is stored in the `auth` table with proper unique constraints

---

## Installation

The auth service feature is included in the SDK. No additional packages are required:

```bash
npm install @decloudlabs/ap zod fp-ts
```

---

## Auth Service Interface

Your service must implement the `AuthService` interface:

```typescript
import type { AuthService } from '@decloudlabs/ap';

interface AuthService {
  /**
   * Check if authentication exists for the given parameters
   * @param userAgentId - Optional user agent ID (null for org-level auth)
   * @param organisationId - Organisation ID
   * @param authService - Service name (appName)
   * @returns Promise resolving to boolean indicating if auth exists
   */
  checkAuth(
    userAgentId: string | null,
    organisationId: string,
    authService: string
  ): Promise<boolean>;

  /**
   * Save authentication data after successful authentication
   * @param userAgentId - Optional user agent ID (null for org-level auth)
   * @param organisationId - Organisation ID
   * @param authService - Service name (appName)
   * @param authData - Authentication data to save (tokens, credentials, etc.)
   * @returns Promise resolving when save is complete
   */
  saveAuth(
    userAgentId: string | null,
    organisationId: string,
    authService: string,
    authData: Record<string, unknown>
  ): Promise<void>;

  /**
   * Generate authentication link/URL for the user to authenticate
   * @param userAgentId - Optional user agent ID (null for org-level auth)
   * @param organisationId - Organisation ID
   * @param authService - Service name (appName)
   * @returns Promise resolving to auth link/URL
   */
  generateAuth(
    userAgentId: string | null,
    organisationId: string,
    authService: string
  ): Promise<{ authLink: string }>;
}
```

---

## Implementing Your Auth Service

### Example: Google OAuth Implementation

```typescript
import { google } from 'googleapis';
import type { AuthService } from '@decloudlabs/ap';

class GoogleAuthService implements AuthService {
  private oauth2Client: any;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  async checkAuth(
    userAgentId: string | null,
    organisationId: string,
    authService: string
  ): Promise<boolean> {
    // Check if you have stored tokens for this combination
    // This is a simple example - you might want to check token validity
    // by making a test API call to Google
    return false; // Implement your logic
  }

  async saveAuth(
    userAgentId: string | null,
    organisationId: string,
    authService: string,
    authData: Record<string, unknown>
  ): Promise<void> {
    // Store the auth data (tokens, refresh tokens, etc.)
    // This is called after OAuth callback
    // The SDK will also save it to the database automatically
    console.log('Saving auth data:', { userAgentId, organisationId, authService, authData });
  }

  async generateAuth(
    userAgentId: string | null,
    organisationId: string,
    authService: string
  ): Promise<{ authLink: string }> {
    // Generate OAuth URL with state parameter
    const state = JSON.stringify({ userAgentId, organisationId, authService });
    
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.readonly',
      ],
      state: state,
    });

    return { authLink: authUrl };
  }
}
```

### Example: Twitter OAuth Implementation

```typescript
import type { AuthService } from '@decloudlabs/ap';

class TwitterAuthService implements AuthService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.TWITTER_CLIENT_ID!;
    this.clientSecret = process.env.TWITTER_CLIENT_SECRET!;
    this.redirectUri = process.env.TWITTER_REDIRECT_URI!;
  }

  async checkAuth(
    userAgentId: string | null,
    organisationId: string,
    authService: string
  ): Promise<boolean> {
    // Check if tokens exist and are valid
    // You might want to make a test API call to Twitter
    return false; // Implement your logic
  }

  async saveAuth(
    userAgentId: string | null,
    organisationId: string,
    authService: string,
    authData: Record<string, unknown>
  ): Promise<void> {
    // Store Twitter tokens
    console.log('Saving Twitter auth:', { userAgentId, organisationId, authService, authData });
  }

  async generateAuth(
    userAgentId: string | null,
    organisationId: string,
    authService: string
  ): Promise<{ authLink: string }> {
    // Generate Twitter OAuth 2.0 URL
    const state = JSON.stringify({ userAgentId, organisationId, authService });
    const scopes = ['tweet.read', 'users.read'];
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(' '),
      state: state,
      code_challenge: 'challenge', // Use PKCE in production
      code_challenge_method: 'plain',
    });

    const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
    return { authLink: authUrl };
  }
}
```

---

## SDK Integration

### Initialize SDK with Auth Service

```typescript
import express from 'express';
import { initAIAccessPoint, type AuthService, type InitOptions } from '@decloudlabs/ap';
import { GoogleAuthService } from './auth/GoogleAuthService';

const app = express();
app.use(express.json());

// Your auth service implementation
const authService: AuthService = new GoogleAuthService();

// Your handler function
const runNaturalFunction = async (req, res, aiService, responseHandler, creditsService) => {
  // Your implementation
};

// Initialize SDK with auth service
const env = {
  POSTGRES_URL: process.env.POSTGRES_URL!,
  minimumBalance: process.env.MINIMUM_BALANCE || '0.01',
  appName: 'my-service', // This becomes the authService identifier
};

const options: InitOptions = {
  authService: authService, // Optional - only include if you want auth endpoints
};

const initResult = await initAIAccessPoint(env, app, runNaturalFunction, undefined, options);

if (!initResult.success) {
  console.error('❌ Failed to initialize SDK:', initResult.error);
  process.exit(1);
}

console.log('✅ SDK initialized with auth service');
```

---

## Auth Endpoints

The SDK automatically registers these endpoints when `authService` is provided:

### 1. Check Auth

**Endpoint**: `POST /auth/check`

**Headers**:
- `x-api-key`: Your API key (required)
- `Content-Type`: `application/json`

**Request Body**:
```json
{
  "userAgentId": "uuid-of-agent" // Optional
}
```

**Response** (Auth exists):
```json
{
  "success": true,
  "exists": true,
  "authData": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": "..."
  }
}
```

**Response** (Auth doesn't exist):
```json
{
  "success": true,
  "exists": false
}
```

**Example cURL**:
```bash
curl -X POST http://localhost:3000/auth/check \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "userAgentId": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

### 2. Generate Auth

**Endpoint**: `POST /auth/generate`

**Headers**:
- `x-api-key`: Your API key (required)
- `Content-Type`: `application/json`

**Request Body**:
```json
{
  "userAgentId": "uuid-of-agent" // Optional
}
```

**Response**:
```json
{
  "success": true,
  "authLink": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

**Example cURL**:
```bash
curl -X POST http://localhost:3000/auth/generate \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "userAgentId": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

### 3. Save Auth

**Endpoint**: `POST /auth/save`

**Headers**:
- `x-api-key`: Your API key (required)
- `Content-Type`: `application/json`

**Request Body**:
```json
{
  "userAgentId": "uuid-of-agent", // Optional
  "authData": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": "...",
    "tokenType": "Bearer"
  }
}
```

**Response**:
```json
{
  "success": true,
  "message": "Auth saved successfully"
}
```

**Example cURL**:
```bash
curl -X POST http://localhost:3000/auth/save \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "userAgentId": "123e4567-e89b-12d3-a456-426614174000",
    "authData": {
      "accessToken": "ya29.a0AfH6SMC...",
      "refreshToken": "1//0g...",
      "expiresAt": "2024-01-01T00:00:00Z"
    }
  }'
```

### 4. Revoke Auth

**Endpoint**: `DELETE /auth/revoke`

**Headers**:
- `x-api-key`: Your API key (required)
- `Content-Type`: `application/json`

**Request Body**:
```json
{
  "userAgentId": "uuid-of-agent" // Optional
}
```

**Response**:
```json
{
  "success": true,
  "message": "Auth revoked successfully"
}
```

**Example cURL**:
```bash
curl -X DELETE http://localhost:3000/auth/revoke \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "userAgentId": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

---

## Complete Example

Here's a complete example of a service with Google OAuth:

```typescript
import express from 'express';
import { google } from 'googleapis';
import {
  initAIAccessPoint,
  type AuthService,
  type InitOptions,
  type RunNaturalFunctionType,
} from '@decloudlabs/ap';

const app = express();
app.use(express.json());

// Google Auth Service Implementation
class GoogleAuthService implements AuthService {
  private oauth2Client: any;
  private tokenStore: Map<string, any> = new Map();

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      process.env.GOOGLE_REDIRECT_URI!
    );
  }

  private getKey(userAgentId: string | null, organisationId: string, authService: string): string {
    return userAgentId
      ? `${userAgentId}:${authService}`
      : `${organisationId}:${authService}`;
  }

  async checkAuth(
    userAgentId: string | null,
    organisationId: string,
    authService: string
  ): Promise<boolean> {
    const key = this.getKey(userAgentId, organisationId, authService);
    const tokens = this.tokenStore.get(key);
    
    if (!tokens) {
      return false;
    }

    // Check if token is expired
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      return false;
    }

    return true;
  }

  async saveAuth(
    userAgentId: string | null,
    organisationId: string,
    authService: string,
    authData: Record<string, unknown>
  ): Promise<void> {
    const key = this.getKey(userAgentId, organisationId, authService);
    this.tokenStore.set(key, authData);
    console.log(`Auth saved for key: ${key}`);
  }

  async generateAuth(
    userAgentId: string | null,
    organisationId: string,
    authService: string
  ): Promise<{ authLink: string }> {
    const state = JSON.stringify({ userAgentId, organisationId, authService });
    
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.readonly',
      ],
      state: state,
    });

    return { authLink: authUrl };
  }
}

// Your handler function
const runNaturalFunction: RunNaturalFunctionType = async (
  req,
  res,
  aiService,
  responseHandler,
  creditsService
) => {
  // Your implementation
  responseHandler.sendFinalResponse({
    success: true,
    content: 'Hello from service',
  });
};

// Initialize SDK
const env = {
  POSTGRES_URL: process.env.POSTGRES_URL!,
  minimumBalance: process.env.MINIMUM_BALANCE || '0.01',
  appName: 'google-integration-service',
};

const authService = new GoogleAuthService();

const options: InitOptions = {
  authService: authService,
};

const initResult = await initAIAccessPoint(env, app, runNaturalFunction, undefined, options);

if (!initResult.success) {
  console.error('❌ Failed to initialize SDK:', initResult.error);
  process.exit(1);
}

console.log('✅ SDK initialized with Google auth service');

// OAuth callback handler (you need to implement this separately)
app.get('/oauth/callback', async (req, res) => {
  const { code, state } = req.query;
  
  try {
    const stateData = JSON.parse(state as string);
    const { userAgentId, organisationId, authService } = stateData;

    // Exchange code for tokens
    const { tokens } = await authService.oauth2Client.getToken(code as string);

    // Save auth data via SDK endpoint
    const response = await fetch('http://localhost:3000/auth/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': req.headers['x-api-key'] as string, // You'll need to pass this
      },
      body: JSON.stringify({
        userAgentId: userAgentId || undefined,
        authData: tokens,
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      res.send('Authentication successful! You can close this window.');
    } else {
      res.status(500).send('Failed to save authentication');
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Authentication failed');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Service running on port ${PORT}`);
});
```

---

## Database Schema

The SDK uses the following table structure:

```sql
CREATE TABLE auth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_agent_id UUID REFERENCES user_agents(id) ON DELETE CASCADE,
  auth_service TEXT NOT NULL,
  auth_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

### Unique Constraints

- **If `userAgentId` is provided**: Unique on `(user_agent_id, auth_service)`
- **If `userAgentId` is null**: Unique on `(organisation_id, auth_service)` where `user_agent_id IS NULL`

This allows:
- Organisation-level auth (when `userAgentId` is null)
- Agent-specific auth (when `userAgentId` is provided)

---

## Error Handling

### Common Errors

**401 Unauthorized**:
```json
{
  "success": false,
  "error": "Organisation ID not found"
}
```
- **Cause**: API key is invalid or missing
- **Solution**: Ensure `x-api-key` header is present and valid

**400 Bad Request**:
```json
{
  "success": false,
  "error": "Validation failed: userAgentId: userAgentId must be a valid UUID"
}
```
- **Cause**: Invalid request body format
- **Solution**: Ensure `userAgentId` is a valid UUID if provided

**500 Internal Server Error**:
```json
{
  "success": false,
  "error": "Failed to check auth"
}
```
- **Cause**: Database error or service implementation error
- **Solution**: Check your service logs and database connection

---

## Key Points to Remember

1. **Auth Service is Optional**: Only provide `authService` in `InitOptions` if you want auth endpoints
2. **appName as authService**: The `appName` from your env config is automatically used as `authService` identifier
3. **userAgentId is Optional**: Omit `userAgentId` for organisation-level auth, include it for agent-specific auth
4. **Unique Constraints**: The SDK enforces unique constraints based on whether `userAgentId` is provided
5. **OAuth Callback**: You need to implement your own OAuth callback handler to exchange codes for tokens
6. **Token Storage**: The SDK stores auth data in the database, but you may also want to store it in your service for quick access
7. **Token Refresh**: Implement token refresh logic in your `checkAuth` method if tokens expire

---

## Migration

After implementing auth service, generate and run the database migration:

```bash
# Generate migration
npm run db:generate

# Review the generated migration file
# Then push to database (development)
npm run db:push

# Or run migration (production)
npm run db:migrate
```

---

## Support

For issues or questions, refer to the SDK documentation or contact the development team.

