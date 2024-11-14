import { APICallReturn } from '@decloudlabs/skynet/lib/types/types';
import { FindCursor } from 'mongodb';
import { COService } from '@decloudlabs/sky-cluster-operator/lib/utils/service';
interface NFTCosts {
    nftID: string;
    costs: string;
}
export default class ServerBalanceDatabaseService implements COService {
    constructor();
    setup: () => Promise<void>;
    setBalance: (nftID: string, price: string) => Promise<APICallReturn<number>>;
    getBalance: (nftID: string) => Promise<APICallReturn<NFTCosts | null>>;
    addBalance: (nftID: string, price: string) => Promise<APICallReturn<number>>;
    getNFTCostCursor: (batchSize?: number) => FindCursor<NFTCosts>;
    deleteNFTCosts: (nftIDs: string[]) => Promise<APICallReturn<number, Error>>;
    setupDatabase: () => Promise<void>;
    update: () => Promise<void>;
}
export {};
