import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
import { APICallReturn } from '@decloudlabs/skynet/lib/types/types';
export declare const setupDatabase: () => Promise<void>;
export declare const addBalance: (nftID: string, price: string) => Promise<APICallReturn<number>>;
export declare const scanNFTBalances: (skyNode: SkyMainNodeJS) => Promise<never>;
