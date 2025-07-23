import { Pool } from 'pg';

export interface DataStorageRecord {
  id: string;
  serviceName: string;
  collectionId: string;
  nftId: string;
  referenceId: string;
  data: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreDataRequest {
  serviceName: string;
  referenceId: string;
  data: any;
}

export interface FetchDataRequest {
  referenceId: string;
}

export interface FetchDataResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export type DataValidationFunction = (
  data: any,
  accountNFT: { collectionID: string; nftID: string },
  serviceName: string,
  referenceId: string
) => Promise<{ isValid: boolean; error?: string; transformedData?: any }>;

export class DataStorageService {
  private pool: Pool;
  private validationFunction?: DataValidationFunction;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Set a custom validation function for data fetching
   * This allows developers to add custom validation logic and transform the response
   */
  setValidationFunction(validationFunction: DataValidationFunction): void {
    this.validationFunction = validationFunction;
  }

  /**
   * Store data for a specific service and accountNFT
   */
  async storeData(
    serviceName: string,
    collectionId: string,
    nftId: string,
    referenceId: string,
    data: any
  ): Promise<{ success: boolean; error?: string; id?: string }> {
    try {
      // Validate input
      if (!serviceName || !collectionId || !nftId || !referenceId) {
        return {
          success: false,
          error: 'serviceName, collectionId, nftId, and referenceId are required'
        };
      }

      if (data === undefined || data === null) {
        return {
          success: false,
          error: 'data is required'
        };
      }

      // Check if record already exists
      const existingRecord = await this.pool.query(
        'SELECT id FROM data_storage WHERE service_name = $1 AND collection_id = $2 AND nft_id = $3 AND reference_id = $4',
        [serviceName, collectionId, nftId, referenceId]
      );

      if (existingRecord.rows.length > 0) {
        // Update existing record
        const result = await this.pool.query(
          `UPDATE data_storage 
           SET data = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE service_name = $2 AND collection_id = $3 AND nft_id = $4 AND reference_id = $5 
           RETURNING id`,
          [JSON.stringify(data), serviceName, collectionId, nftId, referenceId]
        );

        return {
          success: true,
          id: result.rows[0].id
        };
      } else {
        // Insert new record
        const result = await this.pool.query(
          `INSERT INTO data_storage (service_name, collection_id, nft_id, reference_id, data) 
           VALUES ($1, $2, $3, $4, $5) 
           RETURNING id`,
          [serviceName, collectionId, nftId, referenceId, JSON.stringify(data)]
        );

        return {
          success: true,
          id: result.rows[0].id
        };
      }
    } catch (error: any) {
      console.error('❌ Error storing data:', error);
      return {
        success: false,
        error: `Failed to store data: ${error.message}`
      };
    }
  }

  /**
   * Fetch data by referenceId for a specific accountNFT
   */
  async fetchData(
    collectionId: string,
    nftId: string,
    referenceId: string
  ): Promise<FetchDataResponse> {
    try {
      // Validate input
      if (!collectionId || !nftId || !referenceId) {
        return {
          success: false,
          error: 'collectionId, nftId, and referenceId are required'
        };
      }

      // Fetch the data
      const result = await this.pool.query(
        `SELECT service_name, data, created_at, updated_at 
         FROM data_storage 
         WHERE collection_id = $1 AND nft_id = $2 AND reference_id = $3`,
        [collectionId, nftId, referenceId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Data not found for the given referenceId and accountNFT'
        };
      }

      const record = result.rows[0];
      let data = record.data;

      // Apply custom validation if provided
      if (this.validationFunction) {
        try {
          const validationResult = await this.validationFunction(
            data,
            { collectionID: collectionId, nftID: nftId },
            record.service_name,
            referenceId
          );

          if (!validationResult.isValid) {
            return {
              success: false,
              error: validationResult.error || 'Data validation failed'
            };
          }

          // Use transformed data if provided, otherwise use original
          if (validationResult.transformedData !== undefined) {
            data = validationResult.transformedData;
          }
        } catch (validationError: any) {
          console.error('❌ Error in custom validation:', validationError);
          return {
            success: false,
            error: `Validation error: ${validationError.message}`
          };
        }
      }

      return {
        success: true,
        data: {
          serviceName: record.service_name,
          data: data,
          createdAt: record.created_at,
          updatedAt: record.updated_at
        }
      };
    } catch (error: any) {
      console.error('❌ Error fetching data:', error);
      return {
        success: false,
        error: `Failed to fetch data: ${error.message}`
      };
    }
  }

  /**
   * List all data records for a specific accountNFT
   */
  async listData(
    collectionId: string,
    nftId: string,
    serviceName?: string
  ): Promise<{ success: boolean; data?: DataStorageRecord[]; error?: string }> {
    try {
      // Validate input
      if (!collectionId || !nftId) {
        return {
          success: false,
          error: 'collectionId and nftId are required'
        };
      }

      let query: string;
      let params: any[];

      if (serviceName) {
        query = `SELECT id, service_name, collection_id, nft_id, reference_id, data, created_at, updated_at 
                 FROM data_storage 
                 WHERE collection_id = $1 AND nft_id = $2 AND service_name = $3 
                 ORDER BY updated_at DESC`;
        params = [collectionId, nftId, serviceName];
      } else {
        query = `SELECT id, service_name, collection_id, nft_id, reference_id, data, created_at, updated_at 
                 FROM data_storage 
                 WHERE collection_id = $1 AND nft_id = $2 
                 ORDER BY updated_at DESC`;
        params = [collectionId, nftId];
      }

      const result = await this.pool.query(query, params);

      return {
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          serviceName: row.service_name,
          collectionId: row.collection_id,
          nftId: row.nft_id,
          referenceId: row.reference_id,
          data: row.data,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      };
    } catch (error: any) {
      console.error('❌ Error listing data:', error);
      return {
        success: false,
        error: `Failed to list data: ${error.message}`
      };
    }
  }

  /**
   * Delete data by referenceId for a specific accountNFT
   */
  async deleteData(
    collectionId: string,
    nftId: string,
    referenceId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate input
      if (!collectionId || !nftId || !referenceId) {
        return {
          success: false,
          error: 'collectionId, nftId, and referenceId are required'
        };
      }

      const result = await this.pool.query(
        'DELETE FROM data_storage WHERE collection_id = $1 AND nft_id = $2 AND reference_id = $3',
        [collectionId, nftId, referenceId]
      );

      if (result.rowCount === 0) {
        return {
          success: false,
          error: 'Data not found for the given referenceId and accountNFT'
        };
      }

      return {
        success: true
      };
    } catch (error: any) {
      console.error('❌ Error deleting data:', error);
      return {
        success: false,
        error: `Failed to delete data: ${error.message}`
      };
    }
  }
} 