import { eq, sql } from 'drizzle-orm';
import * as TE from 'fp-ts/TaskEither';
import { Pool } from 'pg';

import {
  backendBaseCosts,
  createDrizzleClient,
  creditLogs,
  organisationsCredits,
  requests,
  userAgents,
} from '../../../database/drizzleClient';

// Drizzle transaction type - inferred from the transaction callback parameter
// This is the type that drizzle passes to the transaction callback
type DrizzleTransaction = Parameters<Parameters<ReturnType<typeof createDrizzleClient>['transaction']>[0]>[0];

export interface CreditsRepository {
  getBalance(organisationId: string): TE.TaskEither<Error, number>;
  getBaseCost(appName: string): TE.TaskEither<Error, number>; // Returns base cost in dollars
  ensureOrganisationCreditsExists(organisationId: string, tx: DrizzleTransaction): TE.TaskEither<Error, void>;
  getBalanceWithLock(organisationId: string, tx: DrizzleTransaction): TE.TaskEither<Error, number>;
  updateBalance(organisationId: string, newBalance: number, tx: DrizzleTransaction): TE.TaskEither<Error, void>;
  insertCreditLog(
    organisationId: string,
    costDollars: number,
    service: string,
    tx: DrizzleTransaction
  ): TE.TaskEither<Error, void>;
  insertRequest(
    organisationId: string,
    apiKeyId: string | null,
    userAgentId: string | null,
    prompt: string,
    systemPrompt: string | null,
    model: string | null,
    txOrDb: DrizzleTransaction
  ): TE.TaskEither<Error, string>;
  validateUserAgentId(userAgentId: string, organisationId: string): TE.TaskEither<Error, boolean>;
  updateRequest(
    requestId: string,
    costDollars: number,
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

          // Numeric type returns string, convert to number
          const balance = row?.balance;
          return balance !== undefined && balance !== null ? Number(balance) : 0;
        },
        error => (error instanceof Error ? error : new Error('Failed to get balance'))
      );
    },

    getBaseCost(appName: string): TE.TaskEither<Error, number> {
      return TE.tryCatch(
        async () => {
          // First, try to get existing base cost
          let [baseRow] = await db
            .select({ baseCostDollars: backendBaseCosts.baseCostDollars })
            .from(backendBaseCosts)
            .where(eq(backendBaseCosts.appName, appName))
            .limit(1);

          if (baseRow) {
            // Numeric type returns string, convert to number
            const cost = baseRow.baseCostDollars;
            return cost !== undefined && cost !== null ? Number(cost) : 0;
          }

          // If not found, create a default base cost of 0 dollars
          const defaultBaseCostDollars = 0;
          try {
            const insertResult = await db
              .insert(backendBaseCosts)
              .values({
                appName,
                baseCostDollars: defaultBaseCostDollars,
              })
              .onConflictDoNothing()
              .returning({ baseCostDollars: backendBaseCosts.baseCostDollars });

            if (insertResult.length > 0) {
              return defaultBaseCostDollars;
            }
          } catch {
            // If insert fails, ignore and re-query (might have been created by another request)
          }

          // Re-query to get the actual value (in case of conflict or successful insert)
          [baseRow] = await db
            .select({ baseCostDollars: backendBaseCosts.baseCostDollars })
            .from(backendBaseCosts)
            .where(eq(backendBaseCosts.appName, appName))
            .limit(1);

          if (baseRow) {
            const cost = baseRow.baseCostDollars;
            return cost !== undefined && cost !== null ? Number(cost) : defaultBaseCostDollars;
          }

          // Fallback to default if still not found (shouldn't happen)
          return defaultBaseCostDollars;
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
              balance: 0.0,
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
          )) as { rows: Array<{ balance: string | number }> };

          const balance = result.rows[0]?.balance;
          // Numeric type returns string from raw SQL, convert to number
          return balance !== undefined && balance !== null ? Number(balance) : 0;
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
      costDollars: number,
      service: string,
      tx: DrizzleTransaction
    ): TE.TaskEither<Error, void> {
      return TE.tryCatch(
        async () => {
          await tx.insert(creditLogs).values({
            organisationId,
            costDollars,
            service,
          });
        },
        error => (error instanceof Error ? error : new Error('Failed to insert credit log'))
      );
    },

    insertRequest(
      organisationId: string,
      apiKeyId: string | null,
      userAgentId: string | null,
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
              userAgentId: userAgentId,
              prompt,
              systemPrompt,
              model,
              costDollars: 0,
              status: 'in_progress',
              responseTimeMs: null,
            })
            .returning({ id: requests.id });

          return row.id;
        },
        error => (error instanceof Error ? error : new Error('Failed to insert request'))
      );
    },

    validateUserAgentId(userAgentId: string, organisationId: string): TE.TaskEither<Error, boolean> {
      return TE.tryCatch(
        async () => {
          const [agent] = await db
            .select({ id: userAgents.id })
            .from(userAgents)
            .where(eq(userAgents.id, userAgentId))
            .limit(1);

          if (!agent) {
            return false;
          }

          const [agentWithOrg] = await db
            .select({ organisationId: userAgents.organisationId })
            .from(userAgents)
            .where(eq(userAgents.id, userAgentId))
            .limit(1);

          return agentWithOrg?.organisationId === organisationId;
        },
        error => (error instanceof Error ? error : new Error('Failed to validate user agent ID'))
      );
    },

    updateRequest(
      requestId: string,
      costDollars: number,
      status: 'success' | 'error',
      responseTimeMs: number,
      txOrDb: DrizzleTransaction
    ): TE.TaskEither<Error, void> {
      return TE.tryCatch(
        async () => {
          await txOrDb
            .update(requests)
            .set({
              costDollars,
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
