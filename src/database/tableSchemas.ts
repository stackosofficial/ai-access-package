import { TableSchema } from './databaseMigration';

export interface AppTableSchemas {
  balanceTables: TableSchema[];
  apiKeyTables: TableSchema[];
  authTables: TableSchema[];
}

export function getBalanceTableSchemas(subnetId: string): TableSchema[] {
  const costsTable = `nft_extract_costs_${subnetId}`;
  const historyTable = `nft_extract_costs_history_${subnetId}`;

  return [
    {
      tableName: costsTable,
      createTableSQL: `
        CREATE TABLE IF NOT EXISTS ${costsTable} (
          id SERIAL PRIMARY KEY,
          collection_id TEXT NOT NULL,
          nft_id TEXT NOT NULL,
          costs TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(collection_id, nft_id),
          failed_count INT DEFAULT 0,
          success_count INT DEFAULT 0
        );
        
        CREATE INDEX IF NOT EXISTS idx_${costsTable}_collection_nft 
        ON ${costsTable}(collection_id, nft_id);
        
        CREATE INDEX IF NOT EXISTS idx_${costsTable}_costs 
        ON ${costsTable}(costs);
      `,
      requiredColumns: [
        { name: 'id', type: 'SERIAL', nullable: false },
        { name: 'collection_id', type: 'TEXT', nullable: false },
        { name: 'nft_id', type: 'TEXT', nullable: false },
        { name: 'costs', type: 'TEXT', nullable: false },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'failed_count', type: 'INT', defaultValue: '0' },
        { name: 'success_count', type: 'INT', defaultValue: '0' }
      ]
    },
    {
      tableName: historyTable,
      createTableSQL: `
        CREATE TABLE IF NOT EXISTS ${historyTable} (
          id SERIAL PRIMARY KEY,
          collection_id TEXT NOT NULL,
          nft_id TEXT NOT NULL,
          costs TEXT NOT NULL,
          applied BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_${historyTable}_applied 
        ON ${historyTable}(applied);
        
        CREATE INDEX IF NOT EXISTS idx_${historyTable}_created_at 
        ON ${historyTable}(created_at DESC);
      `,
      requiredColumns: [
        { name: 'id', type: 'SERIAL', nullable: false },
        { name: 'collection_id', type: 'TEXT', nullable: false },
        { name: 'nft_id', type: 'TEXT', nullable: false },
        { name: 'costs', type: 'TEXT', nullable: false },
        { name: 'applied', type: 'BOOLEAN', defaultValue: 'FALSE' },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', defaultValue: 'CURRENT_TIMESTAMP' }
      ]
    }
  ];
}

export function getApiKeyTableSchemas(): TableSchema[] {
  return [
    {
      tableName: 'api_keys',
      createTableSQL: `
        CREATE TABLE IF NOT EXISTS api_keys (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          key TEXT NOT NULL UNIQUE,
          wallet_address TEXT NOT NULL,
          nft_collection_id TEXT NOT NULL,
          nft_id TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_used_at TIMESTAMPTZ
        );
        
        CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
        CREATE INDEX IF NOT EXISTS idx_api_keys_wallet ON api_keys(wallet_address);
        CREATE INDEX IF NOT EXISTS idx_api_keys_nft ON api_keys(wallet_address, nft_collection_id, nft_id);
      `,
      requiredColumns: [
        { name: 'id', type: 'UUID', nullable: false, defaultValue: 'gen_random_uuid()' },
        { name: 'key', type: 'TEXT', nullable: false },
        { name: 'wallet_address', type: 'TEXT', nullable: false },
        { name: 'nft_collection_id', type: 'TEXT', nullable: false },
        { name: 'nft_id', type: 'TEXT', nullable: false },
        { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'last_used_at', type: 'TIMESTAMPTZ', nullable: true }
      ]
    },
    {
      tableName: 'api_usage_logs',
      createTableSQL: `
        CREATE TABLE IF NOT EXISTS api_usage_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL,
          status_code INTEGER,
          service_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_api_usage_logs_api_key ON api_usage_logs(api_key_id);
        CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_api_usage_logs_service_id ON api_usage_logs(service_id);
      `,
      requiredColumns: [
        { name: 'id', type: 'UUID', nullable: false, defaultValue: 'gen_random_uuid()' },
        { name: 'api_key_id', type: 'UUID', nullable: false },
        { name: 'endpoint', type: 'TEXT', nullable: false },
        { name: 'method', type: 'TEXT', nullable: false },
        { name: 'status_code', type: 'INTEGER', nullable: true },
        { name: 'service_id', type: 'TEXT', nullable: true },
        { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      functions: [
        `CREATE OR REPLACE FUNCTION update_api_key_last_used()
        RETURNS TRIGGER AS $$
        BEGIN
            UPDATE api_keys
            SET last_used_at = CURRENT_TIMESTAMP
            WHERE id = NEW.api_key_id;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;`
      ],
      triggers: [
        `DROP TRIGGER IF EXISTS update_api_key_last_used_trigger ON api_usage_logs;
        CREATE TRIGGER update_api_key_last_used_trigger
        AFTER INSERT ON api_usage_logs
        FOR EACH ROW
        EXECUTE FUNCTION update_api_key_last_used();`
      ]
    }
  ];
}

export function getAuthTableSchemas(): TableSchema[] {
  return [
    {
      tableName: 'auth_data',
      createTableSQL: `
        CREATE TABLE IF NOT EXISTS auth_data (
          user_address TEXT NOT NULL,
          nft_id TEXT NOT NULL,
          backend_id TEXT NOT NULL DEFAULT 'default',
          auth_data JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (user_address, nft_id, backend_id)
        );
      `,
      requiredColumns: [
        { name: 'user_address', type: 'TEXT', nullable: false },
        { name: 'nft_id', type: 'TEXT', nullable: false },
        { name: 'backend_id', type: 'TEXT', nullable: false, defaultValue: "'default'" },
        { name: 'auth_data', type: 'JSONB', nullable: true },
        { name: 'created_at', type: 'TIMESTAMPTZ', defaultValue: 'NOW()' },
        { name: 'updated_at', type: 'TIMESTAMPTZ', defaultValue: 'NOW()' }
      ]
    }
  ];
}

export function getAllTableSchemas(subnetId: string): TableSchema[] {
  return [
    ...getBalanceTableSchemas(subnetId),
    ...getApiKeyTableSchemas(),
    ...getAuthTableSchemas()
  ];
}

export function getAppTableSchemas(subnetId: string): AppTableSchemas {
  return {
    balanceTables: getBalanceTableSchemas(subnetId),
    apiKeyTables: getApiKeyTableSchemas(),
    authTables: getAuthTableSchemas()
  };
} 