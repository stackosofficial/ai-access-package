import { AccountNFT, APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import ENVConfig from "./envConfig";
import { NFTCosts } from "./types/types";
import * as admin from "firebase-admin";
export default class ServerBalanceDatabaseService {
    private envConfig;
    private db;
    constructor(envConfig: ENVConfig);
    setup: () => Promise<void>;
    private getCollectionRef;
    private runTransaction;
    private getNFTId;
    setExtractBalance: (accountNFT: AccountNFT, price: string) => Promise<APICallReturn<number>>;
    getExtractBalance: (accountNFT: AccountNFT) => Promise<APICallReturn<NFTCosts | null>>;
    getNFTExtractCursor(): AsyncGenerator<NFTCosts, void, unknown>;
    deleteNFTExtract: (accountNFTs: AccountNFT[]) => Promise<{
        success: boolean;
        data: number;
    } | {
        success: boolean;
        data: Error;
    }>;
    setupDatabase: () => Promise<void>;
    update: () => Promise<void>;
    getClient: () => Promise<admin.firestore.Firestore>;
}
