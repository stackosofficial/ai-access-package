import { DatabaseWriterExecution } from '@decloudlabs/sky-cluster-operator/lib/utils/databaseWriterExecution';
import { NFTCosts } from './types/types';
import ENVConfig from './envConfig';
import ServerBalanceDatabaseService from './serverBalanceDatabaseService';
export default class balanceExtractService {
    databaseWriter: DatabaseWriterExecution<NFTCosts[]>;
    nftCostsToWriteList: NFTCosts[];
    envConfig: ENVConfig;
    databaseService: ServerBalanceDatabaseService;
    constructor(envConfig: ENVConfig, databaseService: ServerBalanceDatabaseService);
    addNFTCostsToWriteInternal: (nftCosts: NFTCosts[]) => void;
    addNFTCostsToWrite: (nftCosts: NFTCosts[]) => Promise<void>;
    scanNFTBalancesInternal: () => Promise<void>;
    setup: () => Promise<void>;
    update: () => Promise<void>;
}
