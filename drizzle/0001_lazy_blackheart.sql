ALTER TABLE "credit_logs" RENAME COLUMN "cost_cents" TO "cost_dollars";--> statement-breakpoint
ALTER TABLE "requests" RENAME COLUMN "cost_cents" TO "cost_dollars";--> statement-breakpoint
ALTER TABLE "organisations_credits" ALTER COLUMN "balance" SET DATA TYPE numeric(10, 2);