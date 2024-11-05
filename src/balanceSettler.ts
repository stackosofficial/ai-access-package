import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
import { APICallReturn } from '@decloudlabs/skynet/lib/types/types';
import { apiCallWrapper } from '@decloudlabs/skynet/lib/utils/utils';
import { ethers } from 'ethers';
import { Collection, InsertManyResult, MongoClient, UpdateResult } from 'mongodb';
import ServerCostCalculatorABI from './ABI/ServerCostCalculator';
import { getSkyNode } from './init';

interface NFTCosts {
    nftID: string;
    costs: string;
  }
  
let nftCostsCollection: Collection<NFTCosts>;
let NFT_UPDATE_INTERVAL = 30000;
let batchSize = 100;


export const setupDatabase = async () => {
    // const { MONGODB_URL, MONGODB_DBNAME } = process.env;
    const MONGODB_URL = process.env.MONGODB_URL || '';
    const MONGODB_DBNAME = process.env.MONGODB_DBNAME || '';
  
    const client = await MongoClient.connect(MONGODB_URL);
    console.log(`created database client: ${MONGODB_URL}`);
  
    const database = client.db(MONGODB_DBNAME);
    console.log(`connected to database: ${MONGODB_DBNAME}`);
  
    nftCostsCollection = database.collection<NFTCosts>("nftCosts");
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

  const addCostToContract = async (skyNode: SkyMainNodeJS, nftID: string, price: string) => {
    const address = '0x099B69911207bE7a2A18C2a2878F9b267838e388';
    const subnetID = process.env.SUBNET_ID || '';
    const abi = ServerCostCalculatorABI;
  
    const provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_RPC);
    const wallet = new ethers.Wallet(process.env.OPERATOR_PRIVATE_KEY || '', provider);
    const serverCostCalculator = new ethers.Contract(address, abi, wallet);
  
    const response = await skyNode.contractService.callContractWrite(serverCostCalculator.addNFTCosts(
      subnetID,
      nftID,
      price
    ));
  
    console.log("response: ", response)
  
    return response;
  }

  const updateBalanceInContract = async (nftID: string) => {
    const skyNode = getSkyNode();
    const subnetID = process.env.SUBNET_ID || '';
    const resp = await skyNode.contractService.callContractWrite(skyNode.contractService.SubscriptionBalance.updateBalance(
      nftID,
      [subnetID]
    ));
    return resp;
  }

export const scanNFTBalances = async (skyNode: SkyMainNodeJS) => {
    while(true) {
        try {
            const balances = await nftCostsCollection.find({}).toArray();
            console.log(balances);

            const cursor = nftCostsCollection.find<NFTCosts>({
            });
    
            cursor.batchSize(batchSize);

            for await (const nftCosts of cursor) {
                if(nftCosts.costs !== '0') {
                    const resp = await addCostToContract(skyNode, nftCosts.nftID, nftCosts.costs);
                    if(resp.success) {
                    await setBalance(nftCosts.nftID, '0');
                    }

                    await updateBalanceInContract(nftCosts.nftID);
                }
            }
    
        }
        catch(error) {
            console.error(error);
        }
        await new Promise(resolve => setTimeout(resolve, NFT_UPDATE_INTERVAL));
    }
}