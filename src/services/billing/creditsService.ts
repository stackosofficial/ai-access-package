import * as TE from 'fp-ts/TaskEither';
import { Pool } from 'pg';

import type { CreditsContext } from '../../types/schemas';

import * as CreditsAPI from './entrypoint';

export function createCreditsService(pool: Pool) {
  return {
    checkBalance(ctx: CreditsContext, requiredDollars: string): TE.TaskEither<Error, boolean> {
      return CreditsAPI.checkBalance(pool, ctx, requiredDollars);
    },

    addCost(ctx: CreditsContext, amountDollars: string): TE.TaskEither<Error, void> {
      return CreditsAPI.addCost(pool, ctx, amountDollars);
    },

    logRequestStart(
      ctx: CreditsContext,
      prompt: string,
      systemPrompt: string | undefined,
      model: string | undefined,
      userAgentId: string | undefined
    ): TE.TaskEither<Error, string> {
      return CreditsAPI.logRequestStart(pool, ctx, prompt, systemPrompt, model, userAgentId);
    },

    logRequestEnd(
      requestId: string,
      costDollars: string,
      status: 'success' | 'error',
      startedAt: number
    ): TE.TaskEither<Error, void> {
      return CreditsAPI.logRequestEnd(pool, requestId, costDollars, status, startedAt);
    },
  };
}
