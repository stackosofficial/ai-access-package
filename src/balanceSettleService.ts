
import { ethers } from "ethers";
import ServerCostCalculator from "./ABI/ServerCostCalculator";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import { NFTCosts } from "./types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import ENVConfig from "./envConfig";

import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
import SkyEnvConfigNodeJS, { AppSubnetConfig } from '@decloudlabs/skynet/lib/types/types';
import { DatabaseWriterExecution } from '@decloudlabs/sky-cluster-operator/lib/utils/databaseWriterExecution';

let initializedAppCrypto: SkyMainNodeJS;

const initializeSkyNodeCrypto = async (envConfig: ENVConfig): Promise<SkyMainNodeJS> => {
    if (!initializedAppCrypto) {
        const skymainEnvConfig: SkyEnvConfigNodeJS = {
            JRPC_PROVIDER: envConfig.env.JSON_RPC_PROVIDER,
            WALLET_PRIVATE_KEY: envConfig.env.WALLET_PRIVATE_KEY,
            STORAGE_API: envConfig.env.STORAGE_API,
        };
            initializedAppCrypto = new SkyMainNodeJS(skymainEnvConfig);
        await initializedAppCrypto.init(true);
    }
    return initializedAppCrypto;
};

const getSkyNode = async (envConfig: ENVConfig): Promise<SkyMainNodeJS> => {
    return await initializeSkyNodeCrypto(envConfig);
};

export default class BalanceSettleService {
    databaseService: ServerBalanceDatabaseService;
    shortTermDatabaseWriter: DatabaseWriterExecution<NFTCosts>;
    envConfig: ENVConfig;
    serverCostCalculator: ethers.Contract;
    checkBalanceCondition: (nftCosts: NFTCosts) => Promise<APICallReturn<boolean>>;

    constructor(envConfig: ENVConfig, databaseService: ServerBalanceDatabaseService, signer: ethers.Wallet, checkBalanceCondition: (nftCosts: NFTCosts) => Promise<APICallReturn<boolean>>) {
        this.databaseService = databaseService;
        this.serverCostCalculator = new ethers.Contract("0x099B69911207bE7a2A18C2a2878F9b267838e388", ServerCostCalculator, signer);
        this.shortTermDatabaseWriter = new DatabaseWriterExecution<NFTCosts>(
            "BalanceSettleService",
            this.scanShortTermBalances,
            this.addShortTermTrackerInternal,
            1 * 60 * 1000,
        );
        this.checkBalanceCondition = checkBalanceCondition;
        this.envConfig = envConfig;
    }


    setup = async () => {
    }

    addShortTermTrackerInternal = async (nftCosts: NFTCosts) => {
    };

    scanShortTermBalances = async () => {
        console.log("scanning short term balances")
        const skyNode = await getSkyNode(this.envConfig); 

        const SUBNET_ID = this.envConfig.env.SUBNET_ID;

        const serverCostContract = new ethers.Contract("0x099B69911207bE7a2A18C2a2878F9b267838e388", ServerCostCalculator, skyNode.contractService.signer);

        const batchVal = 1000;
        const cursor = this.databaseService.getNFTCostCursor(
            batchVal,
        );
        // console.log("checking cursor: ", cursor.hasNext());

        const shortTermList: NFTCosts[] = [];
        while (await cursor.hasNext()) {
            const nftCosts = await cursor.next();
            if(nftCosts) {
                shortTermList.push(nftCosts);
            }
        }
        await cursor.close();

        console.log("short term list: ", shortTermList)

        const deleteList: string[] = [];

        for (let i = 0; i < shortTermList.length; i++) {
            const nftCosts = shortTermList[i];

            const balanceResp = await skyNode.contractService.callContractRead<{balanceList: string[]}, string>(skyNode.contractService.SubscriptionBalance.getSubnetNFTBalances(nftCosts.nftID, [SUBNET_ID]), (res) => res.balanceList[0])
            if(balanceResp.success == false) {
                console.log("error getting balance: ", balanceResp.data);
                continue;
            }

            const balance = ethers.BigNumber.from(balanceResp.data);

            const costResp =  await skyNode.contractService.callContractRead<ethers.BigNumber, string>(serverCostContract.getNFTCost(SUBNET_ID, nftCosts.nftID), (res) => res.toString())
            if(costResp.success == false) {
                console.log("error getting cost: ", costResp.data);
                continue;
            }

            let finalBalance = balance.sub(ethers.BigNumber.from(costResp.data))
            finalBalance = finalBalance.sub(ethers.BigNumber.from(nftCosts.costs));

            console.log("final balance: ", finalBalance.toString())
            console.log("checking costs", costResp.data.toString(), nftCosts.costs.toString(), balance.toString())

            if(finalBalance.lte(0)) {
                const resp = await this.checkBalanceCondition(nftCosts);
                if(resp.success) {
                    deleteList.push(nftCosts.nftID);
                }
            }
        }

        await this.databaseService.deleteNFTCosts(deleteList);
    };


    update = async () => {
        await this.shortTermDatabaseWriter.execute();
    }
}
