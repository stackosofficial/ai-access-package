import { pipe } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import { Pool } from 'pg';
import { z } from 'zod';

import { createDrizzleClient } from '../../../database/drizzleClient';
import { type CreditsContext, creditsContextSchema } from '../../../types/schemas';
import { createCreditsRepository } from '../data-access/db';
import * as CreditsDomain from '../domain/creditsService';

// Transaction type for proper typing
type DrizzleDb = ReturnType<typeof createDrizzleClient>;
type DrizzleTransaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

/**
 * Validate credits context using Zod schema (entrypoint validation)
 */
const validateCreditsContext = (ctx: unknown): TE.TaskEither<Error, CreditsContext> => {
  const result = creditsContextSchema.safeParse(ctx);

  if (!result.success) {
    const errorMessages = result.error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');

    return TE.left(new Error(`Validation failed: ${errorMessages}`));
  }

  return TE.right(result.data);
};

/**
 * Validate dollar amount string
 */
const validateDollarAmount = (amount: unknown): TE.TaskEither<Error, string> => {
  if (typeof amount !== 'string') {
    return TE.left(new Error('Amount must be a string'));
  }

  const numValue = Number.parseFloat(amount);
  if (!Number.isFinite(numValue)) {
    return TE.left(new Error(`Invalid dollar value: ${amount}`));
  }

  return TE.right(amount);
};

/**
 * Check balance entrypoint: Validate params, then call domain logic
 */
export const checkBalance = (pool: Pool, ctx: unknown, requiredDollars: unknown): TE.TaskEither<Error, boolean> => {
  const repository = createCreditsRepository(pool);

  return pipe(
    validateCreditsContext(ctx),
    TE.chain(validatedCtx =>
      pipe(
        validateDollarAmount(requiredDollars),
        TE.chain(amount => CreditsDomain.checkBalance(repository, validatedCtx, amount))
      )
    )
  );
};

/**
 * Add cost entrypoint: Validate params, then call domain logic
 */
export const addCost = (pool: Pool, ctx: unknown, amountDollars: unknown): TE.TaskEither<Error, void> => {
  const repository = createCreditsRepository(pool);
  const db = createDrizzleClient(pool);

  return pipe(
    validateCreditsContext(ctx),
    TE.chain(validatedCtx =>
      pipe(
        validateDollarAmount(amountDollars),
        TE.chain(amount =>
          CreditsDomain.addCost(
            repository,
            async (fn: (tx: DrizzleTransaction) => Promise<void>) => {
              await db.transaction(fn);
            },
            validatedCtx,
            amount
          )
        )
      )
    )
  );
};

/**
 * Log request start entrypoint: Validate params, then call domain logic
 */
export const logRequestStart = (
  pool: Pool,
  ctx: unknown,
  prompt: unknown,
  systemPrompt: unknown,
  model: unknown,
  agentId: unknown
): TE.TaskEither<Error, string> => {
  const repository = createCreditsRepository(pool);
  const db = createDrizzleClient(pool);

  return pipe(
    validateCreditsContext(ctx),
    TE.chain(validatedCtx =>
      pipe(
        validatePrompt(prompt),
        TE.chain(validatedPrompt =>
          pipe(
            validateOptionalString(systemPrompt, 'systemPrompt'),
            TE.chain(validatedSystemPrompt =>
              pipe(
                validateOptionalString(model, 'model'),
                TE.chain(validatedModel =>
                  pipe(
                    validateOptionalString(agentId, 'agentId'),
                    TE.chain(validatedAgentId =>
                      CreditsDomain.logRequestStart(
                        repository,
                        async (fn: (tx: DrizzleTransaction) => Promise<void>) => {
                          await db.transaction(fn);
                        },
                        validatedCtx,
                        validatedPrompt,
                        validatedSystemPrompt,
                        validatedModel,
                        validatedAgentId
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
  );
};

/**
 * Log request end entrypoint: Validate params, then call domain logic
 */
export const logRequestEnd = (
  pool: Pool,
  requestId: unknown,
  costDollars: unknown,
  status: unknown,
  startedAt: unknown
): TE.TaskEither<Error, void> => {
  const repository = createCreditsRepository(pool);
  const db = createDrizzleClient(pool);

  return pipe(
    validateRequestId(requestId),
    TE.chain(validatedRequestId =>
      pipe(
        validateDollarAmount(costDollars),
        TE.chain(amount =>
          pipe(
            validateStatus(status),
            TE.chain(validatedStatus =>
              pipe(
                validateStartedAt(startedAt),
                TE.chain(validatedStartedAt =>
                  CreditsDomain.logRequestEnd(
                    repository,
                    async (fn: (tx: DrizzleTransaction) => Promise<void>) => {
                      await db.transaction(fn);
                    },
                    validatedRequestId,
                    amount,
                    validatedStatus,
                    validatedStartedAt
                  )
                )
              )
            )
          )
        )
      )
    )
  );
};

// Validation helpers
const validatePrompt = (p: unknown): TE.TaskEither<Error, string> => {
  const result = z.string().min(1, 'Prompt cannot be empty').safeParse(p);

  if (!result.success) {
    return TE.left(new Error(`Validation failed: ${result.error.issues.map(i => i.message).join(', ')}`));
  }

  return TE.right(result.data);
};

const validateOptionalString = (value: unknown, fieldName: string): TE.TaskEither<Error, string | undefined> => {
  if (value === undefined || value === null) {
    return TE.right(undefined);
  }

  const result = z.string().min(1, `${fieldName} cannot be empty`).safeParse(value);

  if (!result.success) {
    return TE.left(new Error(`Validation failed: ${result.error.issues.map(i => i.message).join(', ')}`));
  }

  return TE.right(result.data);
};

const validateRequestId = (id: unknown): TE.TaskEither<Error, string> => {
  const result = z.string().uuid('requestId must be a valid UUID').safeParse(id);

  if (!result.success) {
    return TE.left(new Error(`Validation failed: ${result.error.issues.map(i => i.message).join(', ')}`));
  }

  return TE.right(result.data);
};

const validateStatus = (s: unknown): TE.TaskEither<Error, 'success' | 'error'> => {
  const result = z.enum(['success', 'error']).safeParse(s);

  if (!result.success) {
    return TE.left(new Error(`Validation failed: ${result.error.issues.map(i => i.message).join(', ')}`));
  }

  return TE.right(result.data);
};

const validateStartedAt = (at: unknown): TE.TaskEither<Error, number> => {
  const result = z.number().int().positive('startedAt must be a positive integer').safeParse(at);

  if (!result.success) {
    return TE.left(new Error(`Validation failed: ${result.error.issues.map(i => i.message).join(', ')}`));
  }

  return TE.right(result.data);
};
