import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
export declare const setupSkyNode: (skyNodeParam: SkyMainNodeJS) => Promise<void>;
export declare const getSkyNode: () => SkyMainNodeJS;
export declare const initAIAccessPoint: (skyNodeParam: SkyMainNodeJS) => Promise<void>;
