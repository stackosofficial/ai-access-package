import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
import { APICallReturn } from '@decloudlabs/skynet/lib/types/types';
import { apiCallWrapper } from '@decloudlabs/skynet/lib/utils/utils';
import { ethers } from 'ethers';
import { Collection, InsertManyResult, MongoClient, UpdateResult } from 'mongodb';
import ServerCostCalculatorABI from './ABI/ServerCostCalculator';
import { getSkyNode } from './init';
import { DatabaseWriterExecution } from '@decloudlabs/sky-cluster-operator/lib/utils/databaseWriterExecution';
import { NFTCosts } from './types/types';
import ENVConfig from './envConfig';
  
let nftCostsCollection: Collection<NFTCosts>;
let NFT_UPDATE_INTERVAL = 60 * 60 * 1000;
let batchSize = 100;


export default class balanceExtractService {

  databaseWriter: DatabaseWriterExecution<NFTCosts[]>;
  nftCostsToWriteList: NFTCosts[];
  envConfig: ENVConfig;

  constructor(envConfig: ENVConfig) {
    this.nftCostsToWriteList = [];
    this.databaseWriter = new DatabaseWriterExecution<NFTCosts[]>(
      "nftCostsWriter",
      this.scanNFTBalancesInternal,
      this.addNFTCostsToWrite,
      NFT_UPDATE_INTERVAL,
    );
    this.envConfig = envConfig;
  }

  addNFTCostsToWriteInternal = (nftCosts: NFTCosts[]) => {
    this.nftCostsToWriteList = [...this.nftCostsToWriteList, ...nftCosts];
  };

  addNFTCostsToWrite = async (nftCosts: NFTCosts[]) => {
      await this.databaseWriter.insert(nftCosts);
  };
  
  setupDatabase = async () => {
    const MONGODB_URL = this.envConfig.env.MONGODB_URL || '';
    const MONGODB_DBNAME = this.envConfig.env.MONGODB_DBNAME || '';
  
    const client = await MongoClient.connect(MONGODB_URL);
    console.log(`created database client: ${MONGODB_URL}`);
  
    const database = client.db(MONGODB_DBNAME);
    console.log(`connected to database: ${MONGODB_DBNAME}`);

    const collectionName = this.envConfig.env.MONGODB_COLLECTION_NAME || '';

    console.log("checking mongodb cred:", MONGODB_URL, MONGODB_DBNAME, collectionName);
  
    nftCostsCollection = database.collection<NFTCosts>(collectionName);
  }

  scanNFTBalancesInternal = async () => {
    try {
        const balances = await nftCostsCollection.find({}).toArray();
        console.log(balances);

        const cursor = nftCostsCollection.find<NFTCosts>({
        });

        cursor.batchSize(batchSize);

        for await (const nftCosts of cursor) {
            if(nftCosts.costs !== '0') {
                const resp = await addCostToContract( nftCosts.nftID, nftCosts.costs, this.envConfig);
                if(resp.success) {
                await setBalance(nftCosts.nftID, '0');
                }

                await updateBalanceInContract(nftCosts.nftID, this.envConfig);
            }
        }

    }
    catch(error) {
        console.error(error);
    }
  }

  setup = async () => {
    await this.setupDatabase();
  }

  update = async () => {
    await this.databaseWriter.execute();
  }
}

 const setBalance = async (nftID: string, price: string): Promise<APICallReturn<number>> => {
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

  const getBalance = async (
    nftID: string,
  ): Promise<APICallReturn<NFTCosts | null>> => {
    const result = await apiCallWrapper<NFTCosts | null, NFTCosts | null>(
        nftCostsCollection.findOne({ nftID }),
        (res) => res,
    );
  
    return result;
  };
  
   export const addBalance = async (nftID: string, price: string): Promise<APICallReturn<number>> => {
    const balance = await getBalance(nftID);
    if(balance.success == false) return balance;
  
    if(balance.data) {
      const newBalance = ethers.BigNumber.from(balance.data?.costs || 0).add(ethers.BigNumber.from(price));
      return await setBalance(nftID, newBalance.toString());
    }
    else {
      return await setBalance(nftID, price);
    }
  }

  const addCostToContract = async (nftID: string, price: string, envConfig: ENVConfig) => {
    const skyNode: SkyMainNodeJS = getSkyNode();
    const address = '0x099B69911207bE7a2A18C2a2878F9b267838e388';
    const subnetID = envConfig.env.SUBNET_ID || '';
    const abi = ServerCostCalculatorABI;
  
    const provider = new ethers.providers.JsonRpcProvider(envConfig.env.JSON_RPC_PROVIDER);
    const wallet = new ethers.Wallet(envConfig.env.WALLET_PRIVATE_KEY || '', provider);
    const serverCostCalculator = new ethers.Contract(address, abi, wallet);
  
    const response = await skyNode.contractService.callContractWrite(serverCostCalculator.addNFTCosts(
      subnetID,
      nftID,
      price
    ));
  
    console.log("response: ", response)
  
    return response;
  }

  const updateBalanceInContract = async (nftID: string, envConfig: ENVConfig) => {
    const skyNode = getSkyNode();
    const subnetID = envConfig.env.SUBNET_ID || '';
    const resp = await skyNode.contractService.callContractWrite(skyNode.contractService.SubscriptionBalance.updateBalance(
      nftID,
      [subnetID]
    ));
    return resp;
  }


