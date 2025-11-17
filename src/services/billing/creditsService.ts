import { eq, sql } from 'drizzle-orm';
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

  function dollarsToCents(value: string): number {
    const [whole, frac = ''] = value.split('.');
    const fracPadded = (frac + '00').slice(0, 2);
    const cents = Number(whole) * 100 + Number(fracPadded);
    if (!Number.isFinite(cents)) {
      throw new Error(`Invalid dollar value: ${value}`);
    }
    return cents;
  }

  return {
    async checkBalance(ctx: CreditsContext, requiredDollars: string): Promise<boolean> {
      // Validate context
      creditsContextSchema.parse(ctx);

      // Validate amount format (dollars with 2 decimals)
      const dollarAmountSchema = z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid dollar value with up to 2 decimal places');
      dollarAmountSchema.parse(requiredDollars);

      const requiredCents = dollarsToCents(requiredDollars);
      const [row] = await db
        .select({ balance: organisationsCredits.balance })
        .from(organisationsCredits)
        .where(eq(organisationsCredits.organisationId, ctx.organisationId))
        .limit(1);

      const current = row?.balance ?? 0;
      return current >= requiredCents;
    },

    async addCost(ctx: CreditsContext, amountDollars: string): Promise<void> {
      // Validate context
      creditsContextSchema.parse(ctx);

      // Validate amount format (dollars with 2 decimals)
      const dollarAmountSchema = z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid dollar value with up to 2 decimal places');
      dollarAmountSchema.parse(amountDollars);

      const serviceCents = dollarsToCents(amountDollars);

      // Lookup base cost for appName (in cents)
      const [baseRow] = await db
        .select({ baseCostCents: backendBaseCosts.baseCostCents })
        .from(backendBaseCosts)
        .where(eq(backendBaseCosts.appName, ctx.appName))
        .limit(1);

      const baseCents = baseRow?.baseCostCents ?? 0;
      const totalCents = serviceCents + baseCents;

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

    async logRequestStart(
      ctx: CreditsContext,
      prompt: string,
      systemPrompt: string | undefined,
      model: string | undefined
    ): Promise<string> {
      // Validate context
      creditsContextSchema.parse(ctx);

      // Validate prompt
      z.string().min(1, 'Prompt cannot be empty').parse(prompt);

      // Validate optional fields
      if (systemPrompt !== undefined) {
        z.string().parse(systemPrompt);
      }
      if (model !== undefined) {
        z.string().min(1, 'Model name cannot be empty').parse(model);
      }
      const [row] = await db
        .insert(requests)
        .values({
          organisationId: ctx.organisationId,
          apiKeyId: ctx.apiKeyId ?? null,
          prompt,
          systemPrompt: systemPrompt ?? null,
          model: model ?? null,
          costCents: 0,
          status: 'in_progress',
          responseTimeMs: null,
        })
        .returning({ id: requests.id });

      return row.id;
    },

    async logRequestEnd(
      requestId: string,
      costDollars: string,
      status: 'success' | 'error',
      startedAt: number
    ): Promise<void> {
      // Validate requestId
      z.string().uuid('requestId must be a valid UUID').parse(requestId);

      // Validate amount format (dollars with 2 decimals)
      const dollarAmountSchema = z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid dollar value with up to 2 decimal places');
      dollarAmountSchema.parse(costDollars);

      // Validate status
      z.enum(['success', 'error']).parse(status);

      // Validate startedAt
      z.number().int().positive('startedAt must be a positive integer').parse(startedAt);

      const costCents = dollarsToCents(costDollars);
      const responseTimeMs = Date.now() - startedAt;

      await db
        .update(requests)
        .set({
          costCents,
          status,
          responseTimeMs,
        })
        .where(eq(requests.id, requestId));
    },
  };
}
