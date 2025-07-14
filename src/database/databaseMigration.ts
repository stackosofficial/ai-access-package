import { Pool, PoolClient } from 'pg';

export interface TableSchema {
  tableName: string;
  createTableSQL: string;
  requiredColumns: ColumnDefinition[];
  functions?: string[];
  triggers?: string[];
}

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable?: boolean;
  defaultValue?: string;
}

export class DatabaseMigration {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async migrateTables(tableSchemas: TableSchema[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      let tablesCreated = 0;
      let totalColumnsAdded = 0;
      let functionsCreated = 0;
      let triggersCreated = 0;
      
      for (const schema of tableSchemas) {
        const tableExists = await this.tableExists(client, schema.tableName);
        const columnsAdded = await this.migrateTable(client, schema);
        
        if (!tableExists) {
          tablesCreated++;
        }
        totalColumnsAdded += columnsAdded;
        
        // Create functions and triggers for existing tables if they don't exist
        if (tableExists && (schema.functions || schema.triggers)) {
          const { functions, triggers } = await this.createFunctionsAndTriggers(client, schema);
          functionsCreated += functions;
          triggersCreated += triggers;
        }
      }
      
      if (tablesCreated > 0 || totalColumnsAdded > 0 || functionsCreated > 0 || triggersCreated > 0) {
        const parts = [];
        if (tablesCreated > 0) parts.push(`${tablesCreated} table(s) created`);
        if (totalColumnsAdded > 0) parts.push(`${totalColumnsAdded} column(s) added`);
        if (functionsCreated > 0) parts.push(`${functionsCreated} function(s) created`);
        if (triggersCreated > 0) parts.push(`${triggersCreated} trigger(s) created`);
        
        console.log(`✅ Database migration: ${parts.join(', ')}`);
      }
    } finally {
      client.release();
    }
  }

  private async createFunctionsAndTriggers(client: PoolClient, schema: TableSchema): Promise<{ functions: number; triggers: number }> {
    let functionsCreated = 0;
    let triggersCreated = 0;
    
    if (schema.functions) {
      for (const func of schema.functions) {
        try {
          await client.query(func);
          functionsCreated++;
        } catch (error) {
          console.log(`ℹ️ Function already exists or error creating: ${error}`);
        }
      }
    }
    
    if (schema.triggers) {
      for (const trigger of schema.triggers) {
        try {
          await client.query(trigger);
          triggersCreated++;
        } catch (error) {
          console.log(`ℹ️ Trigger already exists or error creating: ${error}`);
        }
      }
    }
    
    return { functions: functionsCreated, triggers: triggersCreated };
  }

  private async migrateTable(client: PoolClient, schema: TableSchema): Promise<number> {
    const { tableName, createTableSQL, requiredColumns, functions, triggers } = schema;
    
    const tableExists = await this.tableExists(client, tableName);
    
    if (!tableExists) {
      console.log(`➕ Creating table: ${tableName}`);
      await client.query(createTableSQL);
      console.log(`✅ Created table: ${tableName}`);
      
      // Create functions and triggers if they exist
      if (functions) {
        for (const func of functions) {
          await client.query(func);
        }
        console.log(`✅ Created ${functions.length} function(s) for ${tableName}`);
      }
      
      if (triggers) {
        for (const trigger of triggers) {
          await client.query(trigger);
        }
        console.log(`✅ Created ${triggers.length} trigger(s) for ${tableName}`);
      }
      
      return 0; // No columns added since table was just created
    } else {
      return await this.validateAndUpdateColumns(client, tableName, requiredColumns);
    }
  }

  private async tableExists(client: PoolClient, tableName: string): Promise<boolean> {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `, [tableName]);
    
    return result.rows[0].exists;
  }

  private async columnExists(client: PoolClient, tableName: string, columnName: string): Promise<boolean> {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1 
        AND column_name = $2
      );
    `, [tableName, columnName]);
    
    return result.rows[0].exists;
  }

  private async validateAndUpdateColumns(
    client: PoolClient, 
    tableName: string, 
    requiredColumns: ColumnDefinition[]
  ): Promise<number> {
    let columnsAdded = 0;
    
    for (const column of requiredColumns) {
      const exists = await this.columnExists(client, tableName, column.name);
      
      if (!exists) {
        console.log(`➕ Adding column ${column.name} to ${tableName}...`);
        await this.addColumn(client, tableName, column);
        columnsAdded++;
      }
    }
    
    if (columnsAdded > 0) {
      console.log(`✅ Added ${columnsAdded} column(s) to ${tableName}`);
    }
    
    return columnsAdded;
  }

  private async addColumn(client: PoolClient, tableName: string, column: ColumnDefinition): Promise<void> {
    let columnDefinition = `${column.name} ${column.type}`;
    
    if (column.nullable === false) {
      columnDefinition += ' NOT NULL';
    }
    
    if (column.defaultValue) {
      columnDefinition += ` DEFAULT ${column.defaultValue}`;
    }
    
    await client.query(`
      ALTER TABLE ${tableName} 
      ADD COLUMN ${columnDefinition}
    `);
  }

  async validateTableStructure(tableName: string, requiredColumns: ColumnDefinition[]): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const tableExists = await this.tableExists(client, tableName);
      if (!tableExists) {
        console.log(`❌ Table ${tableName} does not exist`);
        return false;
      }

      for (const column of requiredColumns) {
        const columnExists = await this.columnExists(client, tableName, column.name);
        if (!columnExists) {
          console.log(`❌ Column ${column.name} missing in table ${tableName}`);
          return false;
        }
      }

      return true;
    } finally {
      client.release();
    }
  }
} 