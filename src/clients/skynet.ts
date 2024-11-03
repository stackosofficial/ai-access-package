import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
import SkyEnvConfigNodeJS, { AppSubnetConfig } from '@decloudlabs/skynet/lib/types/types';

let initializedAppCrypto: SkyMainNodeJS;

const initializeSkyNodeCrypto = async (): Promise<SkyMainNodeJS> => {
    if (!initializedAppCrypto) {
        const envConfig: SkyEnvConfigNodeJS = {
            JRPC_PROVIDER: process.env.PROVIDER_RPC!,
            WALLET_PRIVATE_KEY: process.env.OPERATOR_PRIVATE_KEY!,
            STORAGE_API: {
                LIGHTHOUSE: {
                    LIGHTHOUSE_API_KEY: process.env.LIGHTHOUSE_API_KEY!
                },
                IPFS: {
                    PROJECT_ID: process.env.IPFS_PROJECT_ID!,
                    PROJECT_SECRET: process.env.IPFS_PROJECT_SECRET!
                }
            }
        };
        initializedAppCrypto = new SkyMainNodeJS(envConfig);
        await initializedAppCrypto.init(true);
    }
    return initializedAppCrypto;
};

export const getSkyNode = async (): Promise<SkyMainNodeJS> => {
    return await initializeSkyNodeCrypto();
};