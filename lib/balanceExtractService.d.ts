import { APICallReturn } from '@decloudlabs/skynet/lib/types/types';
import { DatabaseWriterExecution } from '@decloudlabs/sky-cluster-operator/lib/utils/databaseWriterExecution';
import { NFTCosts } from './types/types';
import ENVConfig from './envConfig';
export default class balanceExtractService {
    databaseWriter: DatabaseWriterExecution<NFTCosts[]>;
    nftCostsToWriteList: NFTCosts[];
    envConfig: ENVConfig;
    constructor(envConfig: ENVConfig);
    addNFTCostsToWriteInternal: (nftCosts: NFTCosts[]) => void;
    addNFTCostsToWrite: (nftCosts: NFTCosts[]) => Promise<void>;
    setupDatabase: () => Promise<void>;
    scanNFTBalancesInternal: () => Promise<void>;
    setup: () => Promise<void>;
    update: () => Promise<void>;
}
export declare const addBalance: (nftID: string, price: string) => Promise<APICallReturn<number>>;
