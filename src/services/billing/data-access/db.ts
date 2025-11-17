import { eq, sql } from 'drizzle-orm';
import * as TE from 'fp-ts/TaskEither';
import { Pool } from 'pg';

import {
  backendBaseCosts,
  createDrizzleClient,
  creditLogs,
  organisationsCredits,
  requests,
} from '../../../database/drizzleClient';

// Drizzle transaction type - inferred from the transaction callback parameter
// This is the type that drizzle passes to the transaction callback
type DrizzleTransaction = Parameters<Parameters<ReturnType<typeof createDrizzleClient>['transaction']>[0]>[0];

export interface CreditsRepository {
  getBalance(organisationId: string): TE.TaskEither<Error, number>;
  getBaseCost(appName: string): TE.TaskEither<Error, number>;
  ensureOrganisationCreditsExists(organisationId: string, tx: DrizzleTransaction): TE.TaskEither<Error, void>;
  getBalanceWithLock(organisationId: string, tx: DrizzleTransaction): TE.TaskEither<Error, number>;
  updateBalance(organisationId: string, newBalance: number, tx: DrizzleTransaction): TE.TaskEither<Error, void>;
  insertCreditLog(
    organisationId: string,
    costCents: number,
    service: string,
    tx: DrizzleTransaction
  ): TE.TaskEither<Error, void>;
  insertRequest(
    organisationId: string,
    apiKeyId: string | null,
    prompt: string,
    systemPrompt: string | null,
    model: string | null,
    txOrDb: DrizzleTransaction
  ): TE.TaskEither<Error, string>;
  updateRequest(
    requestId: string,
    costCents: number,
    status: 'success' | 'error',
    responseTimeMs: number,
    txOrDb: DrizzleTransaction
  ): TE.TaskEither<Error, void>;
}

export function createCreditsRepository(pool: Pool): CreditsRepository {
  const db = createDrizzleClient(pool);

  return {
    getBalance(organisationId: string): TE.TaskEither<Error, number> {
      return TE.tryCatch(
        async () => {
          const [row] = await db
            .select({ balance: organisationsCredits.balance })
            .from(organisationsCredits)
            .where(eq(organisationsCredits.organisationId, organisationId))
            .limit(1);

          return row?.balance ?? 0;
        },
        error => (error instanceof Error ? error : new Error('Failed to get balance'))
      );
    },

    getBaseCost(appName: string): TE.TaskEither<Error, number> {
      return TE.tryCatch(
        async () => {
          const [baseRow] = await db
            .select({ baseCostCents: backendBaseCosts.baseCostCents })
            .from(backendBaseCosts)
            .where(eq(backendBaseCosts.appName, appName))
            .limit(1);

          return baseRow?.baseCostCents ?? 0;
        },
        error => (error instanceof Error ? error : new Error('Failed to get base cost'))
      );
    },

    ensureOrganisationCreditsExists(organisationId: string, tx: DrizzleTransaction): TE.TaskEither<Error, void> {
      return TE.tryCatch(
        async () => {
          await tx
            .insert(organisationsCredits)
            .values({
              organisationId,
              balance: 0,
            })
            .onConflictDoNothing();
        },
        error => (error instanceof Error ? error : new Error('Failed to ensure organisation credits exists'))
      );
    },

    getBalanceWithLock(organisationId: string, tx: DrizzleTransaction): TE.TaskEither<Error, number> {
      return TE.tryCatch(
        async () => {
          const result = (await tx.execute(
            sql`SELECT balance FROM organisations_credits WHERE organisation_id = ${organisationId} FOR UPDATE LIMIT 1`
          )) as { rows: Array<{ balance: number }> };

          return result.rows[0]?.balance ?? 0;
        },
        error => (error instanceof Error ? error : new Error('Failed to get balance with lock'))
      );
    },

    updateBalance(organisationId: string, newBalance: number, tx: DrizzleTransaction): TE.TaskEither<Error, void> {
      return TE.tryCatch(
        async () => {
          await tx
            .update(organisationsCredits)
            .set({
              balance: newBalance,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(organisationsCredits.organisationId, organisationId));
        },
        error => (error instanceof Error ? error : new Error('Failed to update balance'))
      );
    },

    insertCreditLog(
      organisationId: string,
      costCents: number,
      service: string,
      tx: DrizzleTransaction
    ): TE.TaskEither<Error, void> {
      return TE.tryCatch(
        async () => {
          await tx.insert(creditLogs).values({
            organisationId,
            costCents,
            service,
          });
        },
        error => (error instanceof Error ? error : new Error('Failed to insert credit log'))
      );
    },

    insertRequest(
      organisationId: string,
      apiKeyId: string | null,
      prompt: string,
      systemPrompt: string | null,
      model: string | null,
      txOrDb: DrizzleTransaction
    ): TE.TaskEither<Error, string> {
      return TE.tryCatch(
        async () => {
          const [row] = await txOrDb
            .insert(requests)
            .values({
              organisationId,
              apiKeyId,
              prompt,
              systemPrompt,
              model,
              costCents: 0,
              status: 'in_progress',
              responseTimeMs: null,
            })
            .returning({ id: requests.id });

          return row.id;
        },
        error => (error instanceof Error ? error : new Error('Failed to insert request'))
      );
    },

    updateRequest(
      requestId: string,
      costCents: number,
      status: 'success' | 'error',
      responseTimeMs: number,
      txOrDb: DrizzleTransaction
    ): TE.TaskEither<Error, void> {
      return TE.tryCatch(
        async () => {
          await txOrDb
            .update(requests)
            .set({
              costCents,
              status,
              responseTimeMs,
            })
            .where(eq(requests.id, requestId));
        },
        error => (error instanceof Error ? error : new Error('Failed to update request'))
      );
    },
  };
}
