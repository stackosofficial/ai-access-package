import { and, eq } from 'drizzle-orm';
import { NextFunction, Request, Response } from 'express';
import { Pool } from 'pg';

import { apiKeys, createDrizzleClient } from '../database/drizzleClient';

declare module 'express-serve-static-core' {
  interface Request {
    organisationId?: string;
    apiKeyId?: string;
    user?: {
      id: string;
      clerkUserId: string;
      userEmail: string | null;
      userName: string | null;
      createdAt: Date;
    };
    organisation?: {
      id: string;
      userId: string;
      name: string;
      createdAt: Date;
    };
    apiKey?: {
      id: string;
      organisationId: string;
      apiKey: string;
      isActive: boolean;
      createdAt: Date;
      revokedAt: Date | null;
    };
  }
}

export function createApiKeyAuthMiddleware(pool: Pool) {
  const db = createDrizzleClient(pool);

  return async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
    try {
      const apiKeyHeader = req.header('x-api-key');

      if (!apiKeyHeader) {
        return res.status(401).json({
          success: false,
          error: 'Missing x-api-key header',
        });
      }

      // Look up API key, organisation, and user information using Drizzle relational queries
      const apiKeyRecord = await db.query.apiKeys.findFirst({
        where: and(eq(apiKeys.apiKey, apiKeyHeader), eq(apiKeys.isActive, true)),
        with: {
          organisation: {
            with: {
              user: true,
            },
          },
        },
      });

      if (!apiKeyRecord || apiKeyRecord.revokedAt || !apiKeyRecord.organisation) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or inactive API key',
        });
      }

      const organisation = apiKeyRecord.organisation;
      const user = organisation.user;

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found for organisation',
        });
      }

      // Attach all information to the request context
      req.organisationId = organisation.id;
      req.apiKeyId = apiKeyRecord.id;
      req.user = {
        id: user.id,
        clerkUserId: user.clerkUserId,
        userEmail: user.userEmail,
        userName: user.userName,
        createdAt: user.createdAt,
      };
      req.organisation = {
        id: organisation.id,
        userId: organisation.userId,
        name: organisation.name,
        createdAt: organisation.createdAt,
      };
      req.apiKey = {
        id: apiKeyRecord.id,
        organisationId: apiKeyRecord.organisationId,
        apiKey: apiKeyRecord.apiKey,
        isActive: apiKeyRecord.isActive,
        createdAt: apiKeyRecord.createdAt,
        revokedAt: apiKeyRecord.revokedAt,
      };

      next();
    } catch (error: unknown) {
      console.error('❌ Error in API key auth middleware:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error during API key validation',
      });
    }
  };
}
