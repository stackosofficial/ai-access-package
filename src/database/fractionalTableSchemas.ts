import { TableSchema, ColumnDefinition } from "./databaseMigration";

/**
 * Simplified table schema for fractional payment system
 * Only one table needed: api_key, subnet_id, amount, createdAt, updatedAt
 * subnet_id is used for tracking costs per access point to avoid double charging
 */
export function getFractionalTableSchemas(): TableSchema[] {
  const requiredColumns: ColumnDefinition[] = [
    { name: "id", type: "SERIAL PRIMARY KEY" },
    { name: "api_key", type: "TEXT NOT NULL" },
    { name: "subnet_id", type: "TEXT NOT NULL" },
    { name: "amount", type: "TEXT NOT NULL DEFAULT '0'" },
    { name: "created_at", type: "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP" },
    { name: "updated_at", type: "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP" }
  ];

  return [
    {
      tableName: "fractional_payments",
      createTableSQL: `
        CREATE TABLE IF NOT EXISTS fractional_payments (
          id SERIAL PRIMARY KEY,
          api_key TEXT NOT NULL,
          subnet_id TEXT NOT NULL,
          amount TEXT NOT NULL DEFAULT '0',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(api_key, subnet_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_fractional_payments_api_key ON fractional_payments(api_key);
        CREATE INDEX IF NOT EXISTS idx_fractional_payments_subnet_id ON fractional_payments(subnet_id);
        CREATE INDEX IF NOT EXISTS idx_fractional_payments_created_at ON fractional_payments(created_at);
      `,
      requiredColumns
    }
  ];
}
