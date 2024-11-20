import { MessageTypes, TypedMessage } from "@metamask/eth-sig-util";


export interface ENVDefinition {
    JSON_RPC_PROVIDER: string;
    WALLET_PRIVATE_KEY: string;
    SUBNET_ID: string;
    MONGODB_URL: string;
    MONGODB_DBNAME: string;
    MONGODB_COLLECTION_NAME: string;
    STORAGE_API: {
        LIGHTHOUSE?: {
            LIGHTHOUSE_API_KEY: string;
        };
        IPFS?: {
            PROJECT_ID: string;
            PROJECT_SECRET: string;
        };
        CLOUD: {
            BUCKET_NAME: string;
            ACCESS_KEY_ID: string;
            SECRET_ACCESS_KEY: string;
            REGION: string;
        };
    };

}

export interface NFTCosts  {
    nftID: string;
    costs: string;
}
