import { TableSchema, ColumnDefinition } from "./databaseMigration";

/**
 * Simplified table schema for fractional payment system
 * Tracks costs per wallet address and subnet_id
 * subnet_id is used for tracking costs per access point to avoid double charging
 */
export function getFractionalTableSchemas(): TableSchema[] {
  const requiredColumns: ColumnDefinition[] = [
    { name: "id", type: "SERIAL PRIMARY KEY" },
    { name: "wallet_address", type: "TEXT NOT NULL" },
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
          wallet_address TEXT NOT NULL,
          subnet_id TEXT NOT NULL,
          amount TEXT NOT NULL DEFAULT '0',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(wallet_address, subnet_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_fractional_payments_wallet_address ON fractional_payments(wallet_address);
        CREATE INDEX IF NOT EXISTS idx_fractional_payments_subnet_id ON fractional_payments(subnet_id);
        CREATE INDEX IF NOT EXISTS idx_fractional_payments_created_at ON fractional_payments(created_at);
      `,
      requiredColumns
    }
  ];
}
