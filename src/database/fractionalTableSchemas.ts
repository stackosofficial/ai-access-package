import { TableSchema, ColumnDefinition } from "./databaseMigration";

/**
 * Simplified table schema for fractional payment system
 * fractional_payments: Accumulated costs per wallet (simple aggregation)
 * payment_logs: Detailed log of each charge with backend_id for tracking
 * base_costs: Base cost configuration per backend/service
 */
export function getFractionalTableSchemas(): TableSchema[] {
  const paymentsRequiredColumns: ColumnDefinition[] = [
    { name: "id", type: "SERIAL PRIMARY KEY" },
    { name: "wallet_address", type: "TEXT NOT NULL UNIQUE" },
    { name: "amount", type: "TEXT NOT NULL DEFAULT '0'" },
    { name: "created_at", type: "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP" },
    { name: "updated_at", type: "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP" }
  ];

  const paymentLogsRequiredColumns: ColumnDefinition[] = [
    { name: "id", type: "SERIAL PRIMARY KEY" },
    { name: "wallet_address", type: "TEXT NOT NULL" },
    { name: "backend_id", type: "TEXT NOT NULL" },
    { name: "service_cost_wei", type: "TEXT NOT NULL" },
    { name: "base_cost_wei", type: "TEXT NOT NULL" },
    { name: "total_cost_wei", type: "TEXT NOT NULL" },
    { name: "created_at", type: "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP" }
  ];

  const baseCostsRequiredColumns: ColumnDefinition[] = [
    { name: "id", type: "SERIAL PRIMARY KEY" },
    { name: "backend_id", type: "TEXT NOT NULL UNIQUE" },
    { name: "base_cost_wei", type: "TEXT NOT NULL DEFAULT '0'" },
    { name: "created_at", type: "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP" },
    { name: "updated_at", type: "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP" }
  ];

  return [
    {
      tableName: "fractional_payments",
      createTableSQL: `
        CREATE TABLE IF NOT EXISTS fractional_payments (
          id SERIAL PRIMARY KEY,
          wallet_address TEXT NOT NULL UNIQUE,
          amount TEXT NOT NULL DEFAULT '0',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_fractional_payments_wallet_address ON fractional_payments(wallet_address);
        CREATE INDEX IF NOT EXISTS idx_fractional_payments_amount ON fractional_payments(CAST(amount AS BIGINT)) WHERE CAST(amount AS BIGINT) > 0;
      `,
      requiredColumns: paymentsRequiredColumns
    },
    {
      tableName: "payment_logs",
      createTableSQL: `
        CREATE TABLE IF NOT EXISTS payment_logs (
          id SERIAL PRIMARY KEY,
          wallet_address TEXT NOT NULL,
          backend_id TEXT NOT NULL,
          service_cost_wei TEXT NOT NULL,
          base_cost_wei TEXT NOT NULL,
          total_cost_wei TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_payment_logs_wallet_address ON payment_logs(wallet_address);
        CREATE INDEX IF NOT EXISTS idx_payment_logs_backend_id ON payment_logs(backend_id);
        CREATE INDEX IF NOT EXISTS idx_payment_logs_wallet_backend ON payment_logs(wallet_address, backend_id);
        CREATE INDEX IF NOT EXISTS idx_payment_logs_created_at ON payment_logs(created_at DESC);
      `,
      requiredColumns: paymentLogsRequiredColumns
    },
    {
      tableName: "base_costs",
      createTableSQL: `
        CREATE TABLE IF NOT EXISTS base_costs (
          id SERIAL PRIMARY KEY,
          backend_id TEXT NOT NULL UNIQUE,
          base_cost_wei TEXT NOT NULL DEFAULT '0',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_base_costs_backend_id ON base_costs(backend_id);
      `,
      requiredColumns: baseCostsRequiredColumns
    }
  ];
}
