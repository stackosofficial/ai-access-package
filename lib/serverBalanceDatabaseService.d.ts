import { AccountNFT, APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import ENVConfig from "./envConfig";
import { NFTCosts } from "./types/types";
export default class ServerBalanceDatabaseService {
    private envConfig;
    private pool;
    private costsTable;
    private historyTable;
    constructor(envConfig: ENVConfig);
    setup: () => Promise<void>;
    private getNFTId;
    private createTables;
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
    getUnappliedCosts: () => Promise<APICallReturn<NFTCosts[]>>;
    markCostsAsApplied: (docIds: string[]) => Promise<APICallReturn<number>>;
}
