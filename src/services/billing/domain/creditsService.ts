import * as E from 'fp-ts/Either';
import { pipe } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import { z } from 'zod';

import { createDrizzleClient } from '../../../database/drizzleClient';
import type { CreditsContext } from '../../../types/schemas';
import type { CreditsRepository } from '../data-access/db';

// Transaction executor type - properly typed from Drizzle transaction callback
type DrizzleDb = ReturnType<typeof createDrizzleClient>;
type DrizzleTransaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];
type TransactionExecutor = (fn: (tx: DrizzleTransaction) => Promise<void>) => Promise<void>;

/**
 * Round dollar amount UP to 2 decimal places (ceiling)
 * Accepts any numeric string and rounds it UP to 2 decimal places
 * This ensures we never lose money by rounding down
 */
export const roundDollarAmount = (amount: string): TE.TaskEither<Error, string> => {
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

/**
 * Convert dollars string to number
 */
export const dollarsToNumber = (value: string): TE.TaskEither<Error, number> => {
  return TE.fromEither(
    E.tryCatch(
      () => {
        const numValue = Number.parseFloat(value);
        if (!Number.isFinite(numValue)) {
          throw new Error(`Invalid dollar value: ${value}`);
        }
        if (numValue < 0) {
          throw new Error(`Dollar amount cannot be negative: ${value}`);
        }
        return numValue;
      },
      error => (error instanceof Error ? error : new Error(`Invalid dollar value: ${value}`))
    )
  );
};

/**
 * Check if balance is sufficient
 */
export const checkBalance = (
  repository: CreditsRepository,
  ctx: CreditsContext,
  requiredDollars: string
): TE.TaskEither<Error, boolean> => {
  return pipe(
    roundDollarAmount(requiredDollars),
    TE.chain(roundedAmount => dollarsToNumber(roundedAmount)),
    TE.chain(requiredDollarsNum =>
      pipe(
        repository.getBalance(ctx.organisationId),
        TE.map(balance => balance >= requiredDollarsNum)
      )
    )
  );
};

/**
 * Add cost to organisation (deduct from balance)
 */
export const addCost = (
  repository: CreditsRepository,
  executeTransaction: TransactionExecutor,
  ctx: CreditsContext,
  amountDollars: string
): TE.TaskEither<Error, void> => {
  return pipe(
    roundDollarAmount(amountDollars),
    TE.chain(roundedAmount => dollarsToNumber(roundedAmount)),
    TE.chain(serviceDollars =>
      pipe(
        repository.getBaseCost(ctx.appName),
        // Base cost is already in dollars
        TE.map(baseCostDollars => {
          return { serviceDollars, baseCostDollars, totalDollars: serviceDollars + baseCostDollars };
        })
      )
    ),
    TE.chain(({ totalDollars }) =>
      TE.tryCatch(
        async () => {
          await executeTransaction(async tx => {
            // Ensure org credits row exists
            const ensureResult = await repository.ensureOrganisationCreditsExists(ctx.organisationId, tx)();
            if (ensureResult._tag === 'Left') {
              throw ensureResult.left;
            }

            // Fetch current balance with row lock
            const balanceResult = await repository.getBalanceWithLock(ctx.organisationId, tx)();
            if (balanceResult._tag === 'Left') {
              throw balanceResult.left;
            }

            const currentBalance = balanceResult.right;
            const newBalance = currentBalance - totalDollars;

            // If balance would go negative, set to 0
            if (newBalance < 0) {
              const updateResult = await repository.updateBalance(ctx.organisationId, 0, tx)();
              if (updateResult._tag === 'Left') {
                throw updateResult.left;
              }
            } else {
              // Update balance
              const updateResult = await repository.updateBalance(ctx.organisationId, newBalance, tx)();
              if (updateResult._tag === 'Left') {
                throw updateResult.left;
              }

              // Log the charge (convert dollars to cents)
              const costCents = Math.round(totalDollars * 100);
              const logResult = await repository.insertCreditLog(ctx.organisationId, costCents, ctx.appName, tx)();
              if (logResult._tag === 'Left') {
                throw logResult.left;
              }
            }
          });
        },
        error => (error instanceof Error ? error : new Error('Failed to add cost'))
      )
    )
  );
};

/**
 * Log request start
 */
export const logRequestStart = (
  repository: CreditsRepository,
  executeTransaction: TransactionExecutor,
  ctx: CreditsContext,
  prompt: string,
  systemPrompt: string | undefined,
  model: string | undefined,
  userAgentId: string | undefined
): TE.TaskEither<Error, string> => {
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
    validatePrompt(prompt),
    TE.chain(validatedPrompt =>
      pipe(
        validateOptionalString(systemPrompt, 'systemPrompt'),
        TE.chain(validatedSystemPrompt =>
          pipe(
            validateOptionalString(model, 'model'),
            TE.chain(validatedModel =>
              TE.tryCatch(
                async () => {
                  let requestId = '';
                  await executeTransaction(async tx => {
                    const result = await repository.insertRequest(
                      ctx.organisationId,
                      ctx.apiKeyId ?? null,
                      userAgentId ?? null,
                      validatedPrompt,
                      validatedSystemPrompt ?? null,
                      validatedModel ?? null,
                      tx
                    )();
                    if (result._tag === 'Left') {
                      throw result.left;
                    }
                    requestId = result.right;
                  });
                  return requestId;
                },
                error => (error instanceof Error ? error : new Error('Failed to log request start'))
              )
            )
          )
        )
      )
    )
  );
};

/**
 * Log request end
 */
export const logRequestEnd = (
  repository: CreditsRepository,
  executeTransaction: TransactionExecutor,
  requestId: string,
  costDollars: string,
  status: 'success' | 'error',
  startedAt: number
): TE.TaskEither<Error, void> => {
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
    TE.chain(() => roundDollarAmount(costDollars)),
    TE.chain(amount => dollarsToNumber(amount)),
    TE.chain(costDollarsNum =>
      pipe(
        validateStatus(status),
        TE.chain(validatedStatus =>
          pipe(
            validateStartedAt(startedAt),
            TE.chain(validatedStartedAt =>
              TE.tryCatch(
                async () => {
                  const responseTimeMs = Date.now() - validatedStartedAt;
                  // Store cost in dollars
                  await executeTransaction(async tx => {
                    const result = await repository.updateRequest(
                      requestId,
                      costDollarsNum,
                      validatedStatus,
                      responseTimeMs,
                      tx
                    )();
                    if (result._tag === 'Left') {
                      throw result.left;
                    }
                  });
                },
                error => (error instanceof Error ? error : new Error('Failed to log request end'))
              )
            )
          )
        )
      )
    )
  );
};
