import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import { scanNFTBalances, setupDatabase } from "./balanceSettler";

let skyNode: SkyMainNodeJS;

export const setupSkyNode = async (skyNodeParam: SkyMainNodeJS) => {
    skyNode = skyNodeParam;
}

export const getSkyNode = () => {
    return skyNode;
}

export const initAIAccessPoint = async (skyNodeParam: SkyMainNodeJS) => {
    await setupSkyNode(skyNodeParam);
    await setupDatabase();
    scanNFTBalances(skyNode);

}