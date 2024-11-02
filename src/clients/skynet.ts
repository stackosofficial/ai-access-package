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
        initializedAppCrypto.appManager.contractCall.createApp = async (
            nftID: string,
            appName: string,
            path: [string, string],
            subnetList: string[],
            appSubnetConfig: AppSubnetConfig[],
            subnetBalances: string[],
            cidLock: boolean
        ) => {
            const result = await initializedAppCrypto.contractService.callContractWrite(
                initializedAppCrypto.contractService.AppDeployment.createApp(
                    nftID,
                    appName,
                    path,
                    subnetList,
                    appSubnetConfig,
                    subnetBalances,
                    cidLock
                )
            );
            console.log("createApp Result", result);

            return result;
        }

        initializedAppCrypto.appManager.contractCall.subscribeAndCreateApp = async (
            nftID: string,
            rlsAddresses: [string, string, string, string],
            licenseFactor: [number, number],
            appName: string,
            path: [string, string],
            subnetList: string[],
            appSubnetConfig: AppSubnetConfig[],
            subnetBalances: string[],
            cidLock: boolean
        ) => {
            const result = await initializedAppCrypto.contractService.callContractWrite(
                initializedAppCrypto.contractService.AppDeployment.subscribeAndCreateApp(
                    nftID,
                    rlsAddresses,
                    licenseFactor,
                    appName,
                    path,
                    subnetList,
                    appSubnetConfig,
                    subnetBalances,
                    cidLock
                )
            );
            console.log("subscribeAndCreateApp Result", result);
            return result;
        }
    }
    return initializedAppCrypto;
};

export const getSkyNode = async (): Promise<SkyMainNodeJS> => {
    return await initializeSkyNodeCrypto();
};