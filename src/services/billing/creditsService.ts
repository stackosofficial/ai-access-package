import { Request } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  createDrizzleClient,
  organisationsCredits,
  creditsLedger,
  backendBaseCosts,
  requests,
} from "../../database/drizzleClient";
import { Pool } from "pg";
import { z } from "zod";
import {
  addCostOptionsSchema,
  creditsContextSchema,
  type AddCostOptions,
  type CreditsContext,
} from "../../types/schemas";

export function createCreditsService(pool: Pool) {
  const db = createDrizzleClient(pool);

  function dollarsToCents(value: string): number {
    const [whole, frac = ""] = value.split(".");
    const fracPadded = (frac + "00").slice(0, 2);
    const cents = Number(whole) * 100 + Number(fracPadded);
    if (!Number.isFinite(cents)) {
      throw new Error(`Invalid dollar value: ${value}`);
    }
    return cents;
  }

  return {
    async checkBalance(
      ctx: CreditsContext,
      requiredDollars: string
    ): Promise<boolean> {
      // Validate context
      creditsContextSchema.parse(ctx);

      // Validate amount format (dollars with 2 decimals)
      const dollarAmountSchema = z
        .string()
        .regex(
          /^\d+(\.\d{1,2})?$/,
          "Amount must be a valid dollar value with up to 2 decimal places"
        );
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

    async addCost(
      ctx: CreditsContext,
      amountDollars: string,
      options: AddCostOptions = {}
    ): Promise<void> {
      // Validate context
      creditsContextSchema.parse(ctx);

      // Validate options
      addCostOptionsSchema.parse(options);

      // Validate amount format (dollars with 2 decimals)
      const dollarAmountSchema = z
        .string()
        .regex(
          /^\d+(\.\d{1,2})?$/,
          "Amount must be a valid dollar value with up to 2 decimal places"
        );
      dollarAmountSchema.parse(amountDollars);
      const service = options.service ?? "natural-request";
      const reason = options.reason ?? null;
      const externalRef = options.externalRef ?? null;

      const serviceCents = dollarsToCents(amountDollars);

      // Lookup base cost for appName (in cents)
      const [baseRow] = await db
        .select({ baseCostCents: backendBaseCosts.baseCostCents })
        .from(backendBaseCosts)
        .where(eq(backendBaseCosts.appName, ctx.appName))
        .limit(1);

      const baseCents = baseRow?.baseCostCents ?? 0;
      const totalCents = serviceCents + baseCents;

      // Atomically decrement balance and insert ledger
      await db.transaction(async (tx) => {
        // Ensure org credits row exists
        await tx
          .insert(organisationsCredits)
          .values({
            organisationId: ctx.organisationId,
            balance: 0,
          })
          .onConflictDoNothing();

        // Fetch current balance
        const [creditsRow] = await tx
          .select({ balance: organisationsCredits.balance })
          .from(organisationsCredits)
          .where(eq(organisationsCredits.organisationId, ctx.organisationId))
          .limit(1);

        const currentBalance = creditsRow?.balance ?? 0;
        if (currentBalance < totalCents) {
          throw new Error(
            `Insufficient credits: have ${currentBalance} cents, need ${totalCents} cents`
          );
        }

        const newBalance = currentBalance - totalCents;

        await tx
          .update(organisationsCredits)
          .set({
            balance: newBalance,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(organisationsCredits.organisationId, ctx.organisationId));

        await tx.insert(creditsLedger).values({
          organisationId: ctx.organisationId,
          userId: null,
          delta: -totalCents,
          service,
          reason,
          externalRef,
        });
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
      z.string().min(1, "Prompt cannot be empty").parse(prompt);

      // Validate optional fields
      if (systemPrompt !== undefined) {
        z.string().parse(systemPrompt);
      }
      if (model !== undefined) {
        z.string().min(1, "Model name cannot be empty").parse(model);
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
          status: "in_progress",
          responseTimeMs: null,
        })
        .returning({ id: requests.id });

      return row.id;
    },

    async logRequestEnd(
      requestId: string,
      costDollars: string,
      status: "success" | "error",
      startedAt: number
    ): Promise<void> {
      // Validate requestId
      z.string().uuid("requestId must be a valid UUID").parse(requestId);

      // Validate amount format (dollars with 2 decimals)
      const dollarAmountSchema = z
        .string()
        .regex(
          /^\d+(\.\d{1,2})?$/,
          "Amount must be a valid dollar value with up to 2 decimal places"
        );
      dollarAmountSchema.parse(costDollars);

      // Validate status
      z.enum(["success", "error"]).parse(status);

      // Validate startedAt
      z.number()
        .int()
        .positive("startedAt must be a positive integer")
        .parse(startedAt);

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
