
import { ethers } from "ethers";
import { getSkyNode } from "./init";
import { DatabaseWriterExecution } from '@decloudlabs/sky-cluster-operator/lib/utils/databaseWriterExecution';
import ENVConfig from "./envConfig"
import ServerCostCalculator from "./ABI/ServerCostCalculator";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import { NFTCosts } from "./types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";

export default class CostApplierService {
    databaseService: ServerBalanceDatabaseService;
    shortTermDatabaseWriter: DatabaseWriterExecution<NFTCosts>;
    envConfig: ENVConfig;
    serverCostCalculator: ethers.Contract;
    applyCosts: (nftCosts: NFTCosts) => Promise<APICallReturn<NFTCosts>>;


    constructor(databaseService: ServerBalanceDatabaseService, envConfig: ENVConfig, signer: ethers.Wallet, applyCosts: (nftCosts: NFTCosts) => Promise<APICallReturn<NFTCosts>>, extractCostTime: number) {
        this.databaseService = databaseService;
        this.envConfig = envConfig;
        this.serverCostCalculator = new ethers.Contract(signer.address, ServerCostCalculator, signer);
        this.shortTermDatabaseWriter = new DatabaseWriterExecution<NFTCosts>(
            "CostApplierService",
            this.scanShortTermBalances,
            this.addShortTermTrackerInternal,
            extractCostTime,
        );
        this.applyCosts = applyCosts;
    }


    setup = async () => {
    }

    addShortTermTrackerInternal = async (nftCosts: NFTCosts) => {
    };

    scanShortTermBalances = async () => {
        console.log("scanning short term balances")
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

        const newCostList: NFTCosts[] = [];

        for (let i = 0; i < shortTermList.length; i++) {
            const nftCosts = shortTermList[i];

            const result = await this.applyCosts(nftCosts);
            if(result.success) {
                newCostList.push(result.data);
            }
        }

        for(let i = 0; i < newCostList.length; i++) {
            const nftCosts = newCostList[i];
            await this.databaseService.setBalance(nftCosts.nftID, nftCosts.costs);
        }
    };


    update = async () => {
        await this.shortTermDatabaseWriter.execute();
    }
}
