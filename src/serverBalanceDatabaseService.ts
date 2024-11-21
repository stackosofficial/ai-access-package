import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
import { APICallReturn } from '@decloudlabs/skynet/lib/types/types';
import { apiCallWrapper } from '@decloudlabs/skynet/lib/utils/utils';
import { ethers } from 'ethers';
import { Collection, DeleteResult, FindCursor, InsertManyResult, MongoClient, UpdateResult } from 'mongodb';
import ServerCostCalculatorABI from './ABI/ServerCostCalculator';
import { getSkyNode } from './init';
import { COService } from '@decloudlabs/sky-cluster-operator/lib/utils/service';
import ENVConfig from './envConfig';

interface NFTCosts {
    nftID: string;
    costs: string;
  }
  
let nftTrackerCollection: Collection<NFTCosts>;
let nftExtractCollection: Collection<NFTCosts>;
let NFT_UPDATE_INTERVAL = 30000;
let batchSize = 100;


export default class ServerBalanceDatabaseService implements COService {
    envConfig: ENVConfig;
    private client: MongoClient | null = null;

  constructor(envConfig: ENVConfig) {
    this.envConfig = envConfig;
  }

    setup = async () => {
        await this.setupDatabase();
    }


    setTrackerBalance = async (nftID: string, price: string): Promise<APICallReturn<number>> => {
        const result = await apiCallWrapper<
        UpdateResult<NFTCosts>,
        number
    >(
        nftTrackerCollection.updateOne(
            {},
            {
                $set: {nftID, costs: price},
            },
            {
                upsert: true,
            },
        ),
        (res) => res.upsertedCount + res.modifiedCount,
    );
      
        return result;
    }


    getTrackerBalance = async (
        nftID: string,
      ): Promise<APICallReturn<NFTCosts | null>> => {
        const result = await apiCallWrapper<NFTCosts | null, NFTCosts | null>(
            nftTrackerCollection.findOne({ nftID }),
            (res) => res,
        );
      
        return result;
    };

    addTrackerBalance = async (nftID: string, price: string): Promise<APICallReturn<number>> => {
        const balance = await this.getTrackerBalance(nftID);
        if(balance.success == false) return balance;
      
        if(balance.data) {
          const newBalance = ethers.BigNumber.from(balance.data?.costs || 0).add(ethers.BigNumber.from(price));
          return await this.setTrackerBalance(nftID, newBalance.toString());
        }
        else {
          return await this.setTrackerBalance(nftID, price);
        }
    }

    getNFTTrackerCursor = (
        batchSize = 1000,
    ): FindCursor<NFTCosts> => {
        const cursor = nftTrackerCollection.find<NFTCosts>({
        });

        cursor.batchSize(batchSize);
        return cursor;
    };

    deleteNFTTracker = async (nftIDs: string[]) => {
        const resp = await apiCallWrapper<DeleteResult, number>(
            nftTrackerCollection.deleteMany({ nftID: { $in: nftIDs } }),
            (res) => res.deletedCount,
        );
        return resp;
    }

    setExtractBalance = async (nftID: string, price: string): Promise<APICallReturn<number>> => {
        const result = await apiCallWrapper<
        UpdateResult<NFTCosts>,
        number
    >(
        nftExtractCollection.updateOne(
            {},
            {
                $set: {nftID, costs: price},
            },
            {
                upsert: true,
            },
        ),
        (res) => res.upsertedCount + res.modifiedCount,
    );
      
        return result;
    }


    getExtractBalance = async (
        nftID: string,
      ): Promise<APICallReturn<NFTCosts | null>> => {
        const result = await apiCallWrapper<NFTCosts | null, NFTCosts | null>(
            nftExtractCollection.findOne({ nftID }),
            (res) => res,
        );
      
        return result;
    };

    addExtractBalance = async (nftID: string, price: string): Promise<APICallReturn<number>> => {
        const balance = await this.getExtractBalance(nftID);
        if(balance.success == false) return balance;
      
        if(balance.data) {
          const newBalance = ethers.BigNumber.from(balance.data?.costs || 0).add(ethers.BigNumber.from(price));
          return await this.setExtractBalance(nftID, newBalance.toString());
        }
        else {
          return await this.setExtractBalance(nftID, price);
        }
    }

    getNFTExtractCursor = (
        batchSize = 1000,
    ): FindCursor<NFTCosts> => {
        const cursor = nftExtractCollection.find<NFTCosts>({
        });

        cursor.batchSize(batchSize);
        return cursor;
    };

    deleteNFTExtract = async (nftIDs: string[]) => {
        const resp = await apiCallWrapper<DeleteResult, number>(
            nftExtractCollection.deleteMany({ nftID: { $in: nftIDs } }),
            (res) => res.deletedCount,
        );
        return resp;
    }

    setupDatabase = async () => {
        const MONGODB_URL = this.envConfig.env.MONGODB_URL || '';
        const MONGODB_DBNAME = this.envConfig.env.MONGODB_DBNAME || '';
  
        this.client = await MongoClient.connect(MONGODB_URL);
        console.log(`created database client: ${MONGODB_URL}`);
  
        const database = this.client.db(MONGODB_DBNAME);
        console.log(`connected to database: ${MONGODB_DBNAME}`);


        const collectionName = this.envConfig.env.MONGODB_COLLECTION_NAME || '';

        console.log("checking mongodb cred:", MONGODB_URL, MONGODB_DBNAME, collectionName);

  
        nftTrackerCollection = database.collection<NFTCosts>(`${collectionName}_tracker`);
        nftExtractCollection = database.collection<NFTCosts>(`${collectionName}_extract`);
    }

  update = async () => {}

  setTrackerAndExtractBalance = async (nftID: string, price: string): Promise<APICallReturn<boolean>> => {
        if (!this.client) {
            return { success: false, data: new Error('Database client not initialized') };
        }

        const session = this.client.startSession();
        
        try {
            await session.withTransaction(async () => {
                // Set both balances within the same transaction
                await nftTrackerCollection.updateOne(
                    { nftID },
                    { $set: { nftID, costs: price } },
                    { upsert: true, session }
                );
                
                await nftExtractCollection.updateOne(
                    { nftID },
                    { $set: { nftID, costs: price } },
                    { upsert: true, session }
                );
            });

            return { success: true, data: true };
        } catch (error) {
            return { 
                success: false, 
                data: new Error("unknown error")
            };
        } finally {
            await session.endSession();
        }
    }

}

