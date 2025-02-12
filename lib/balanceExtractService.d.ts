import ENVConfig from "./envConfig";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
export default class BalanceExtractService {
    private databaseWriter;
    private nftCostsToWriteList;
    private envConfig;
    private databaseService;
    constructor(envConfig: ENVConfig, databaseService: ServerBalanceDatabaseService);
    private delay;
    private retryOperation;
    private addNFTCostsToWriteInternal;
    private addNFTCostsToWrite;
    private processBatch;
    private scanNFTBalancesInternal;
    setup: () => Promise<void>;
    update: () => Promise<void>;
}
