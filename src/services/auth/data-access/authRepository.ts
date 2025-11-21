import { and, eq, isNull } from 'drizzle-orm';
import * as TE from 'fp-ts/TaskEither';
import { Pool } from 'pg';

import { auth, createDrizzleClient } from '../../../database/drizzleClient';
import type { AuthRecord } from '../types';

export interface AuthRepository {
  findAuth(
    organisationId: string,
    userAgentId: string | null,
    authService: string
  ): TE.TaskEither<Error, AuthRecord | null>;
  saveAuth(
    organisationId: string,
    userAgentId: string | null,
    authService: string,
    authData: Record<string, unknown>
  ): TE.TaskEither<Error, string>;
  deleteAuth(organisationId: string, userAgentId: string | null, authService: string): TE.TaskEither<Error, void>;
}

export function createAuthRepository(pool: Pool): AuthRepository {
  const db = createDrizzleClient(pool);

  return {
    findAuth(
      organisationId: string,
      userAgentId: string | null,
      authService: string
    ): TE.TaskEither<Error, AuthRecord | null> {
      return TE.tryCatch(
        async () => {
          // If userAgentId is provided, use (userAgentId, authService) as unique
          // If userAgentId is null, use (organisationId, authService) as unique
          const whereCondition = userAgentId
            ? and(eq(auth.userAgentId, userAgentId), eq(auth.authService, authService))
            : and(eq(auth.organisationId, organisationId), eq(auth.authService, authService), isNull(auth.userAgentId));

          const [record] = await db.select().from(auth).where(whereCondition).limit(1);

          if (!record) {
            return null;
          }

          return {
            id: record.id,
            organisationId: record.organisationId,
            userAgentId: record.userAgentId,
            authService: record.authService,
            authData: record.authData as Record<string, unknown>,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          };
        },
        error => (error instanceof Error ? error : new Error('Failed to find auth'))
      );
    },

    saveAuth(
      organisationId: string,
      userAgentId: string | null,
      authService: string,
      authData: Record<string, unknown>
    ): TE.TaskEither<Error, string> {
      return TE.tryCatch(
        async () => {
          // Check if auth already exists
          const existing = await this.findAuth(organisationId, userAgentId, authService)();

          if (existing._tag === 'Left') {
            throw existing.left;
          }

          if (existing.right) {
            // Update existing auth
            const [updated] = await db
              .update(auth)
              .set({
                authData,
                updatedAt: new Date(),
              })
              .where(eq(auth.id, existing.right.id))
              .returning({ id: auth.id });

            return updated.id;
          } else {
            // Insert new auth
            const [inserted] = await db
              .insert(auth)
              .values({
                organisationId,
                userAgentId,
                authService,
                authData,
              })
              .returning({ id: auth.id });

            return inserted.id;
          }
        },
        error => (error instanceof Error ? error : new Error('Failed to save auth'))
      );
    },

    deleteAuth(organisationId: string, userAgentId: string | null, authService: string): TE.TaskEither<Error, void> {
      return TE.tryCatch(
        async () => {
          const whereCondition = userAgentId
            ? and(eq(auth.userAgentId, userAgentId), eq(auth.authService, authService))
            : and(eq(auth.organisationId, organisationId), eq(auth.authService, authService), isNull(auth.userAgentId));

          await db.delete(auth).where(whereCondition);
        },
        error => (error instanceof Error ? error : new Error('Failed to delete auth'))
      );
    },
  };
}
