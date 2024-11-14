import { APICallReturn } from '@decloudlabs/skynet/lib/types/types';
import { COService } from '@decloudlabs/sky-cluster-operator/lib/utils/service';
import { DatabaseWriterExecution } from '@decloudlabs/sky-cluster-operator/lib/utils/databaseWriterExecution';
interface NFTCosts {
    nftID: string;
    costs: string;
}
export default class balanceExtractService implements COService {
    databaseWriter: DatabaseWriterExecution<NFTCosts[]>;
    nftCostsToWriteList: NFTCosts[];
    constructor();
    addNFTCostsToWriteInternal: (nftCosts: NFTCosts[]) => void;
    addNFTCostsToWrite: (nftCosts: NFTCosts[]) => Promise<void>;
    setupDatabase: () => Promise<void>;
    scanNFTBalancesInternal: () => Promise<void>;
    setup: () => Promise<void>;
    update: () => Promise<void>;
}
export declare const addBalance: (nftID: string, price: string) => Promise<APICallReturn<number>>;
export {};
