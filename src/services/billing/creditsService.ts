import { eq, sql } from 'drizzle-orm';
import * as E from 'fp-ts/Either';
import { pipe } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import { Pool } from 'pg';
import { z } from 'zod';

import {
  backendBaseCosts,
  createDrizzleClient,
  creditLogs,
  organisationsCredits,
  requests,
} from '../../database/drizzleClient';
import { type CreditsContext, creditsContextSchema } from '../../types/schemas';

export function createCreditsService(pool: Pool) {
  const db = createDrizzleClient(pool);

  function dollarsToCents(value: string): TE.TaskEither<Error, number> {
    return TE.fromEither(
      E.tryCatch(
        () => {
          const [whole, frac = ''] = value.split('.');
          const fracPadded = (frac + '00').slice(0, 2);
          const cents = Number(whole) * 100 + Number(fracPadded);
          if (!Number.isFinite(cents)) {
            throw new Error(`Invalid dollar value: ${value}`);
          }
          return cents;
        },
        error => (error instanceof Error ? error : new Error(`Invalid dollar value: ${value}`))
      )
    );
  }

  const validateCreditsContext = (ctx: CreditsContext): TE.TaskEither<Error, CreditsContext> => {
    return TE.fromEither(
      E.tryCatch(
        () => {
          creditsContextSchema.parse(ctx);
          return ctx;
        },
        error => (error instanceof Error ? error : new Error('Invalid credits context'))
      )
    );
  };

  /**
   * Round dollar amount UP to 2 decimal places (ceiling)
   * Accepts any numeric string and rounds it UP to 2 decimal places
   * This ensures we never lose money by rounding down
   */
  const roundDollarAmount = (amount: string): TE.TaskEither<Error, string> => {
    return TE.fromEither(
      E.tryCatch(
        () => {
          const numValue = Number.parseFloat(amount);
          if (!Number.isFinite(numValue)) {
            throw new Error(`Invalid dollar value: ${amount}`);
          }
          if (numValue < 0) {
            throw new Error(`Dollar amount cannot be negative: ${amount}`);
          }
          // Round UP to 2 decimal places (ceiling) to ensure we never lose money
          const rounded = Math.ceil(numValue * 100) / 100;
          return rounded.toFixed(2);
        },
        error => (error instanceof Error ? error : new Error(`Invalid dollar value: ${amount}`))
      )
    );
  };

  const validateDollarAmount = (amount: string): TE.TaskEither<Error, string> => {
    return pipe(
      roundDollarAmount(amount), // Round first, then validate
      TE.chain(roundedAmount =>
        TE.fromEither(
          E.tryCatch(
            () => {
              const dollarAmountSchema = z
                .string()
                .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid dollar value with up to 2 decimal places');
              dollarAmountSchema.parse(roundedAmount);
              return roundedAmount;
            },
            error => (error instanceof Error ? error : new Error('Invalid dollar amount format'))
          )
        )
      )
    );
  };

  return {
    checkBalance(ctx: CreditsContext, requiredDollars: string): TE.TaskEither<Error, boolean> {
      return pipe(
        validateCreditsContext(ctx),
        TE.chain(() => validateDollarAmount(requiredDollars)),
        TE.chain(amount => dollarsToCents(amount)),
        TE.chain(requiredCents =>
          TE.tryCatch(
            async () => {
              const [row] = await db
                .select({ balance: organisationsCredits.balance })
                .from(organisationsCredits)
                .where(eq(organisationsCredits.organisationId, ctx.organisationId))
                .limit(1);

              const current = row?.balance ?? 0;
              return current >= requiredCents;
            },
            error => (error instanceof Error ? error : new Error('Failed to check balance'))
          )
        )
      );
    },

    addCost(ctx: CreditsContext, amountDollars: string): TE.TaskEither<Error, void> {
      return pipe(
        validateCreditsContext(ctx),
        TE.chain(() => validateDollarAmount(amountDollars)),
        TE.chain(amount => dollarsToCents(amount)),
        TE.chain(serviceCents =>
          TE.tryCatch(
            async () => {
              // Lookup base cost for appName (in cents)
              const [baseRow] = await db
                .select({ baseCostCents: backendBaseCosts.baseCostCents })
                .from(backendBaseCosts)
                .where(eq(backendBaseCosts.appName, ctx.appName))
                .limit(1);

              const baseCents = baseRow?.baseCostCents ?? 0;
              return { serviceCents, baseCents, totalCents: serviceCents + baseCents };
            },
            error => (error instanceof Error ? error : new Error('Failed to lookup base cost'))
          )
        ),
        TE.chain(({ totalCents }) =>
          TE.tryCatch(
            async () => {
              // Atomically decrement balance and log to creditLogs
              await db.transaction(async tx => {
                // Ensure org credits row exists
                await tx
                  .insert(organisationsCredits)
                  .values({
                    organisationId: ctx.organisationId,
                    balance: 0,
                  })
                  .onConflictDoNothing();

                // Fetch current balance with row lock to prevent race conditions
                // Using raw SQL for SELECT FOR UPDATE to lock the row
                const result = await tx.execute<{ balance: number }>(
                  sql`SELECT balance FROM organisations_credits WHERE organisation_id = ${ctx.organisationId} FOR UPDATE LIMIT 1`
                );

                const creditsRow = result.rows[0];
                const currentBalance = creditsRow?.balance ?? 0;
                const newBalance = currentBalance - totalCents;

                // If balance would go negative, set to 0 to prevent negative balance
                // Don't throw error - just set to 0 so next request will fail checkBalance
                if (newBalance < 0) {
                  await tx
                    .update(organisationsCredits)
                    .set({
                      balance: 0,
                      updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(eq(organisationsCredits.organisationId, ctx.organisationId));
                } else {
                  // Update balance (deduct credits) - only if sufficient
                  await tx
                    .update(organisationsCredits)
                    .set({
                      balance: newBalance,
                      updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(eq(organisationsCredits.organisationId, ctx.organisationId));

                  // Log the charge to creditLogs table
                  await tx.insert(creditLogs).values({
                    organisationId: ctx.organisationId,
                    costCents: totalCents,
                    service: ctx.appName, // App name/service name
                  });
                }
              });
            },
            error => (error instanceof Error ? error : new Error('Failed to add cost'))
          )
        )
      );
    },

    logRequestStart(
      ctx: CreditsContext,
      prompt: string,
      systemPrompt: string | undefined,
      model: string | undefined
    ): TE.TaskEither<Error, string> {
      const validatePrompt = (p: string): TE.TaskEither<Error, string> => {
        return TE.fromEither(
          E.tryCatch(
            () => {
              z.string().min(1, 'Prompt cannot be empty').parse(p);
              return p;
            },
            error => (error instanceof Error ? error : new Error('Invalid prompt'))
          )
        );
      };

      const validateOptionalString = (
        value: string | undefined,
        fieldName: string
      ): TE.TaskEither<Error, string | undefined> => {
        if (value === undefined) {
          return TE.right(undefined);
        }
        return TE.fromEither(
          E.tryCatch(
            () => {
              z.string().min(1, `${fieldName} cannot be empty`).parse(value);
              return value;
            },
            error => (error instanceof Error ? error : new Error(`Invalid ${fieldName}`))
          )
        );
      };

      return pipe(
        validateCreditsContext(ctx),
        TE.chain(() => validatePrompt(prompt)),
        TE.chain(validatedPrompt =>
          pipe(
            validateOptionalString(systemPrompt, 'systemPrompt'),
            TE.chain(validatedSystemPrompt =>
              pipe(
                validateOptionalString(model, 'model'),
                TE.chain(validatedModel =>
                  TE.tryCatch(
                    async () => {
                      const [row] = await db
                        .insert(requests)
                        .values({
                          organisationId: ctx.organisationId,
                          apiKeyId: ctx.apiKeyId ?? null,
                          prompt: validatedPrompt,
                          systemPrompt: validatedSystemPrompt ?? null,
                          model: validatedModel ?? null,
                          costCents: 0,
                          status: 'in_progress',
                          responseTimeMs: null,
                        })
                        .returning({ id: requests.id });

                      return row.id;
                    },
                    error => (error instanceof Error ? error : new Error('Failed to log request start'))
                  )
                )
              )
            )
          )
        )
      );
    },

    logRequestEnd(
      requestId: string,
      costDollars: string,
      status: 'success' | 'error',
      startedAt: number
    ): TE.TaskEither<Error, void> {
      const validateRequestId = (id: string): TE.TaskEither<Error, string> => {
        return TE.fromEither(
          E.tryCatch(
            () => {
              z.string().uuid('requestId must be a valid UUID').parse(id);
              return id;
            },
            error => (error instanceof Error ? error : new Error('Invalid request ID'))
          )
        );
      };

      const validateStatus = (s: string): TE.TaskEither<Error, 'success' | 'error'> => {
        return TE.fromEither(
          E.tryCatch(
            () => {
              z.enum(['success', 'error']).parse(s);
              return s as 'success' | 'error';
            },
            error => (error instanceof Error ? error : new Error('Invalid status'))
          )
        );
      };

      const validateStartedAt = (at: number): TE.TaskEither<Error, number> => {
        return TE.fromEither(
          E.tryCatch(
            () => {
              z.number().int().positive('startedAt must be a positive integer').parse(at);
              return at;
            },
            error => (error instanceof Error ? error : new Error('Invalid startedAt'))
          )
        );
      };

      return pipe(
        validateRequestId(requestId),
        TE.chain(() => validateDollarAmount(costDollars)),
        TE.chain(amount => dollarsToCents(amount)),
        TE.chain(costCents =>
          pipe(
            validateStatus(status),
            TE.chain(validatedStatus =>
              pipe(
                validateStartedAt(startedAt),
                TE.chain(validatedStartedAt =>
                  TE.tryCatch(
                    async () => {
                      const responseTimeMs = Date.now() - validatedStartedAt;
                      await db
                        .update(requests)
                        .set({
                          costCents,
                          status: validatedStatus,
                          responseTimeMs,
                        })
                        .where(eq(requests.id, requestId));
                    },
                    error => (error instanceof Error ? error : new Error('Failed to log request end'))
                  )
                )
              )
            )
          )
        )
      );
    },
  };
}
