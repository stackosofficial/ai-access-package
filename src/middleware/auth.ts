import { and, eq } from 'drizzle-orm';
import { NextFunction, Request, Response } from 'express';
import * as TE from 'fp-ts/TaskEither';
import { Pool } from 'pg';

import { apiKeys, createDrizzleClient } from '../database/drizzleClient';

declare module 'express-serve-static-core' {
  interface Request {
    organisationId?: string;
    apiKeyId?: string;
    userAgentId?: string;
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
    const apiKeyHeader = req.header('x-api-key');

    if (!apiKeyHeader) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-api-key header',
      });
    }

    // Look up API key, organisation, and user information using Drizzle relational queries with fp-ts
    interface ApiKeyRecordWithRelations {
      id: string;
      organisationId: string;
      apiKey: string;
      isActive: boolean;
      createdAt: Date;
      revokedAt: Date | null;
      organisation: {
        id: string;
        userId: string;
        name: string;
        createdAt: Date;
        user: {
          id: string;
          clerkUserId: string;
          userEmail: string | null;
          userName: string | null;
          createdAt: Date;
        };
      };
    }

    const lookupApiKey = (): TE.TaskEither<Error, ApiKeyRecordWithRelations> => {
      return TE.tryCatch(
        async () => {
          const record = await db.query.apiKeys.findFirst({
            where: and(eq(apiKeys.apiKey, apiKeyHeader), eq(apiKeys.isActive, true)),
            with: {
              organisation: {
                with: {
                  user: true,
                },
              },
            },
          });

          if (!record || record.revokedAt || !record.organisation) {
            throw new Error('Invalid or inactive API key');
          }

          const user = record.organisation.user;
          if (!user) {
            throw new Error('User not found for organisation');
          }

          return record;
        },
        error => (error instanceof Error ? error : new Error('Failed to lookup API key'))
      );
    };

    const result = await lookupApiKey()();

    if (result._tag === 'Left') {
      console.error('❌ Error in API key auth middleware:', result.left);
      return res.status(401).json({
        success: false,
        error:
          result.left.message === 'Invalid or inactive API key' ||
          result.left.message === 'User not found for organisation'
            ? result.left.message
            : 'Internal server error during API key validation',
      });
    }

    const apiKeyRecord = result.right;
    const organisation = apiKeyRecord.organisation;
    const user = organisation.user; // We know user exists from validation above

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
  };
}
