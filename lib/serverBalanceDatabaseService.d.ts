import { APICallReturn } from '@decloudlabs/skynet/lib/types/types';
import { FindCursor } from 'mongodb';
import { COService } from '@decloudlabs/sky-cluster-operator/lib/utils/service';
import ENVConfig from './envConfig';
interface NFTCosts {
    nftID: string;
    costs: string;
}
export default class ServerBalanceDatabaseService implements COService {
    envConfig: ENVConfig;
    private client;
    constructor(envConfig: ENVConfig);
    setup: () => Promise<void>;
    setTrackerBalance: (nftID: string, price: string) => Promise<APICallReturn<number>>;
    getTrackerBalance: (nftID: string) => Promise<APICallReturn<NFTCosts | null>>;
    addTrackerBalance: (nftID: string, price: string) => Promise<APICallReturn<number>>;
    getNFTTrackerCursor: (batchSize?: number) => FindCursor<NFTCosts>;
    deleteNFTTracker: (nftIDs: string[]) => Promise<APICallReturn<number, Error>>;
    setExtractBalance: (nftID: string, price: string) => Promise<APICallReturn<number>>;
    getExtractBalance: (nftID: string) => Promise<APICallReturn<NFTCosts | null>>;
    addExtractBalance: (nftID: string, price: string) => Promise<APICallReturn<number>>;
    getNFTExtractCursor: (batchSize?: number) => FindCursor<NFTCosts>;
    deleteNFTExtract: (nftIDs: string[]) => Promise<APICallReturn<number, Error>>;
    setupDatabase: () => Promise<void>;
    update: () => Promise<void>;
    setTrackerAndExtractBalance: (nftID: string, price: string) => Promise<APICallReturn<boolean>>;
}
export {};
