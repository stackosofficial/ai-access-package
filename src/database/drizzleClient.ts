import { relations } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { boolean, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

// --- Existing core tables from user management service ---

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  userEmail: text('user_email'),
  userName: text('user_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organisations = pgTable('organisations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable('apikeys', {
  id: uuid('id').defaultRandom().primaryKey(),
  organisationId: uuid('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  apiKey: text('api_key').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

// Referrals table
export const referrals = pgTable('referrals', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  referralId: text('referral_id').notNull().unique(),
  referredUsed: integer('referred_used').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organisationsCredits = pgTable('organisations_credits', {
  organisationId: uuid('organisation_id')
    .primaryKey()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  balance: numeric('balance', { precision: 10, scale: 2, mode: 'number' }).notNull().default(0), // Stored as dollars with 2 decimal places
  stripeCustomerId: text('stripe_customer_id'), // For Stripe credit additions
  stripeSubscriptionId: text('stripe_subscription_id'), // For Stripe credit additions
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Credit logs table - logs charges made by this SDK
export const creditLogs = pgTable('credit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organisationId: uuid('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  costDollars: numeric('cost_dollars', { precision: 10, scale: 2, mode: 'number' }).notNull(), // Cost charged in dollars
  service: text('service').notNull(), // App name/service name
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- New tables for base cost and request logging ---

export const backendBaseCosts = pgTable('backend_base_costs', {
  id: uuid('id').defaultRandom().primaryKey(),
  appName: text('app_name').notNull().unique(), // Changed from backendId to appName
  baseCostCents: integer('base_cost_cents').notNull(), // 2-decimal dollars -> cents
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const requests = pgTable('requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  organisationId: uuid('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  apiKeyId: uuid('api_key_id').references(() => apiKeys.id, {
    onDelete: 'set null',
  }),
  prompt: text('prompt').notNull(),
  systemPrompt: text('system_prompt'),
  model: text('model'),
  costDollars: numeric('cost_dollars', { precision: 10, scale: 2, mode: 'number' }).notNull().default(0),
  status: text('status').notNull().default('success'), // e.g. success|error
  responseTimeMs: integer('response_time_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Drizzle Relations ---

export const usersRelations = relations(users, ({ many, one }) => ({
  organisations: many(organisations),
  referral: one(referrals),
}));

export const organisationsRelations = relations(organisations, ({ one, many }) => ({
  user: one(users, {
    fields: [organisations.userId],
    references: [users.id],
  }),
  apiKeys: many(apiKeys),
  credits: one(organisationsCredits, {
    fields: [organisations.id],
    references: [organisationsCredits.organisationId],
  }),
  requests: many(requests),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [apiKeys.organisationId],
    references: [organisations.id],
  }),
  requests: many(requests),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  user: one(users, {
    fields: [referrals.userId],
    references: [users.id],
  }),
}));

export const organisationsCreditsRelations = relations(organisationsCredits, ({ one }) => ({
  organisation: one(organisations, {
    fields: [organisationsCredits.organisationId],
    references: [organisations.id],
  }),
}));

export const requestsRelations = relations(requests, ({ one }) => ({
  organisation: one(organisations, {
    fields: [requests.organisationId],
    references: [organisations.id],
  }),
  apiKey: one(apiKeys, {
    fields: [requests.apiKeyId],
    references: [apiKeys.id],
  }),
}));

// --- Drizzle client factory ---

export function createDrizzleClient(pool: Pool) {
  return drizzle(pool, {
    schema: {
      users,
      organisations,
      apiKeys,
      referrals,
      organisationsCredits,
      backendBaseCosts,
      requests,
      creditLogs,
      usersRelations,
      organisationsRelations,
      apiKeysRelations,
      referralsRelations,
      organisationsCreditsRelations,
      requestsRelations,
    },
  });
}
