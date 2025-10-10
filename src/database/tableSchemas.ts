import { TableSchema } from './databaseMigration';

export interface AppTableSchemas {
  apiKeyTables: TableSchema[];
  authTables: TableSchema[];
  dataStorageTables: TableSchema[];
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
          agent_collection_address TEXT,
          agent_collection_id INTEGER,
          auth_data JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_auth_data_user_nft_backend 
        ON auth_data(user_address, nft_id, backend_id);
        
        CREATE INDEX IF NOT EXISTS idx_auth_data_agent_collection_address 
        ON auth_data(agent_collection_address) WHERE agent_collection_address IS NOT NULL;
        
        CREATE INDEX IF NOT EXISTS idx_auth_data_agent_collection_id 
        ON auth_data(agent_collection_id) WHERE agent_collection_id IS NOT NULL;
        
        CREATE INDEX IF NOT EXISTS idx_auth_data_user_address_lower 
        ON auth_data(LOWER(user_address));
        
        CREATE INDEX IF NOT EXISTS idx_auth_data_agent_address_id 
        ON auth_data(agent_collection_address, agent_collection_id) WHERE agent_collection_address IS NOT NULL;
      `,
      requiredColumns: [
        { name: 'user_address', type: 'TEXT', nullable: false },
        { name: 'nft_id', type: 'TEXT', nullable: false },
        { name: 'backend_id', type: 'TEXT', nullable: false, defaultValue: "'default'" },
        { name: 'agent_collection_address', type: 'TEXT', nullable: true },
        { name: 'agent_collection_id', type: 'INTEGER', nullable: true },
        { name: 'auth_data', type: 'JSONB', nullable: true },
        { name: 'created_at', type: 'TIMESTAMPTZ', defaultValue: 'NOW()' },
        { name: 'updated_at', type: 'TIMESTAMPTZ', defaultValue: 'NOW()' }
      ]
    }
  ];
}

export function getDataStorageTableSchemas(): TableSchema[] {
  return [
    {
      tableName: 'data_storage',
      createTableSQL: `
        CREATE TABLE IF NOT EXISTS data_storage (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          service_name TEXT NOT NULL,
          collection_id TEXT NOT NULL,
          nft_id TEXT NOT NULL,
          reference_id TEXT NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(service_name, collection_id, nft_id, reference_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_data_storage_service_nft 
        ON data_storage(service_name, collection_id, nft_id);
        
        CREATE INDEX IF NOT EXISTS idx_data_storage_reference 
        ON data_storage(reference_id);
        
        CREATE INDEX IF NOT EXISTS idx_data_storage_nft_reference 
        ON data_storage(collection_id, nft_id, reference_id);
      `,
      requiredColumns: [
        { name: 'id', type: 'UUID', nullable: false, defaultValue: 'gen_random_uuid()' },
        { name: 'service_name', type: 'TEXT', nullable: false },
        { name: 'collection_id', type: 'TEXT', nullable: false },
        { name: 'nft_id', type: 'TEXT', nullable: false },
        { name: 'reference_id', type: 'TEXT', nullable: false },
        { name: 'data', type: 'JSONB', nullable: false },
        { name: 'created_at', type: 'TIMESTAMPTZ', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMPTZ', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ]
    }
  ];
}

export function getAllTableSchemas(subnetId: string): TableSchema[] {
  return [
    ...getApiKeyTableSchemas(),
    ...getAuthTableSchemas(),
    ...getDataStorageTableSchemas()
  ];
}

export function getAppTableSchemas(subnetId: string): AppTableSchemas {
  return {
    apiKeyTables: getApiKeyTableSchemas(),
    authTables: getAuthTableSchemas(),
    dataStorageTables: getDataStorageTableSchemas()
  };
} 