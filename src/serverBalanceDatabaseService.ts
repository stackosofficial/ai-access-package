import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
import { APICallReturn } from '@decloudlabs/skynet/lib/types/types';
import { apiCallWrapper } from '@decloudlabs/skynet/lib/utils/utils';
import { ethers } from 'ethers';
import { Collection, DeleteResult, FindCursor, InsertManyResult, MongoClient, UpdateResult } from 'mongodb';
import ServerCostCalculatorABI from './ABI/ServerCostCalculator';
import { getSkyNode } from './init';
import { COService } from '@decloudlabs/sky-cluster-operator/lib/utils/service';

interface NFTCosts {
    nftID: string;
    costs: string;
  }
  
let nftCostsCollection: Collection<NFTCosts>;
let NFT_UPDATE_INTERVAL = 30000;
let batchSize = 100;


export default class ServerBalanceDatabaseService implements COService {


  constructor() {

  }

    setup = async () => {
        await this.setupDatabase();
    }


    setBalance = async (nftID: string, price: string): Promise<APICallReturn<number>> => {
        const result = await apiCallWrapper<
        UpdateResult<NFTCosts>,
        number
    >(
        nftCostsCollection.updateOne(
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

    getBalance = async (
        nftID: string,
      ): Promise<APICallReturn<NFTCosts | null>> => {
        const result = await apiCallWrapper<NFTCosts | null, NFTCosts | null>(
            nftCostsCollection.findOne({ nftID }),
            (res) => res,
        );
      
        return result;
    };

    addBalance = async (nftID: string, price: string): Promise<APICallReturn<number>> => {
        const balance = await this.getBalance(nftID);
        if(balance.success == false) return balance;
      
        if(balance.data) {
          const newBalance = ethers.BigNumber.from(balance.data?.costs || 0).add(ethers.BigNumber.from(price));
          return await this.setBalance(nftID, newBalance.toString());
        }
        else {
          return await this.setBalance(nftID, price);
        }
    }

    getNFTCostCursor = (
        batchSize = 1000,
    ): FindCursor<NFTCosts> => {
        const cursor = nftCostsCollection.find<NFTCosts>({
        });

        cursor.batchSize(batchSize);
        return cursor;
    };

    deleteNFTCosts = async (nftIDs: string[]) => {
        const resp = await apiCallWrapper<DeleteResult, number>(
            nftCostsCollection.deleteMany({ nftID: { $in: nftIDs } }),
            (res) => res.deletedCount,
        );
        return resp;
    }

    setupDatabase = async () => {
        const MONGODB_URL = process.env.MONGODB_URL || '';
        const MONGODB_DBNAME = process.env.MONGODB_DBNAME || '';
  
        const client = await MongoClient.connect(MONGODB_URL);
        console.log(`created database client: ${MONGODB_URL}`);
  
        const database = client.db(MONGODB_DBNAME);
        console.log(`connected to database: ${MONGODB_DBNAME}`);

  
        nftCostsCollection = database.collection<NFTCosts>("nftCosts");
    }

  update = async () => {}
}

