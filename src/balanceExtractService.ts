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
import ServerBalanceDatabaseService from './serverBalanceDatabaseService';
  

let NFT_UPDATE_INTERVAL = 1 * 60 * 1000;
let batchSize = 100;


export default class balanceExtractService {

  databaseWriter: DatabaseWriterExecution<NFTCosts[]>;
  nftCostsToWriteList: NFTCosts[];
  envConfig: ENVConfig;
  databaseService: ServerBalanceDatabaseService;
  
  constructor(envConfig: ENVConfig, databaseService: ServerBalanceDatabaseService) {
    this.nftCostsToWriteList = [];
    this.databaseWriter = new DatabaseWriterExecution<NFTCosts[]>(
      "nftCostsWriter",
      this.scanNFTBalancesInternal,
      this.addNFTCostsToWrite,
      NFT_UPDATE_INTERVAL,
    );
    this.envConfig = envConfig;
    this.databaseService = databaseService;
  }

  addNFTCostsToWriteInternal = (nftCosts: NFTCosts[]) => {
    this.nftCostsToWriteList = [...this.nftCostsToWriteList, ...nftCosts];
  };

  addNFTCostsToWrite = async (nftCosts: NFTCosts[]) => {
      // await this.databaseWriter.insert(nftCosts);
  };
  


  scanNFTBalancesInternal = async () => {
    try {

        const cursor = this.databaseService.getNFTExtractCursor();

        cursor.batchSize(batchSize);

        for await (const nftCosts of cursor) {
            console.log("nftCosts: ", nftCosts);
            if(nftCosts.costs !== '0') {
                const resp = await addCostToContract( nftCosts.nftID, nftCosts.costs, this.envConfig);
                if(resp.success) {
                  console.log("setting extract balance to 0: ", nftCosts.nftID);
                await this.databaseService.setExtractBalance(nftCosts.nftID, '0');
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
  }

  update = async () => {
    await this.databaseWriter.execute();
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
  
    console.log("adding costs to contract: ", nftID, price);
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


