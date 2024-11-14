import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import BalanceRunMain from "./balanceRunMain";
import { NFTCosts } from "./types/types";
import { APICallReturn, AppParam, DeleteAppParam, DeployedApp, } from "@decloudlabs/sky-cluster-operator/lib/types/types";
import AppFunctions from "@decloudlabs/sky-cluster-operator/lib/services/appFunctions";
import ListenerMain from "@decloudlabs/sky-cluster-operator/lib/listenerMain";
import { SkyV2Handler } from "@decloudlabs/sky-cluster-operator/lib/services/SKY/SkyV2Handler";
import { ENVConfig } from "@decloudlabs/sky-cluster-operator/lib/config/envConfig";
import { DatabaseService } from "@decloudlabs/sky-cluster-operator/lib/services/databaseService";
import { EncryptedPayload, EncryptedPayloadWithKeys, AppModifier } from "sky-v2_0_3/lib/types/types";
import { checkBalance } from "./middleware/checkBalance";
import { protect } from "./middleware/auth";
import express, { Request, Response, NextFunction } from 'express';
let skyNode: SkyMainNodeJS;

export const setupSkyNode = async (skyNodeParam: SkyMainNodeJS) => {
    skyNode = skyNodeParam;
}

export const getSkyNode = () => {
    return skyNode;
}

class PodAppFunction implements AppFunctions {

    constructor() {
    }
    
    updateApp = async (encryptedPayload: EncryptedPayloadWithKeys, encryptedAppModifier: EncryptedPayload, appPayload: any, appModifier: AppModifier, appParam: AppParam, skyV2Handler: SkyV2Handler, updateFlag: boolean): Promise<APICallReturn<void>> => {
        return { success: true, data: undefined };
    }
    deleteApp = async (deleteParam: DeleteAppParam): Promise<APICallReturn<void>> => {
        return { success: true, data: undefined };
    }
    scaleApp = async (nftID: string, deployedApp: DeployedApp): Promise<APICallReturn<void>> => {
        return { success: true, data: undefined };
    }
    getDeployedAppList = async (nftID: string): Promise<APICallReturn<DeployedApp[]>>  => {
        return { success: true, data: [] };
    }

}


export const initAIAccessPoint = async (skyNodeParam: SkyMainNodeJS, checkBalanceCondition: (nftCosts: NFTCosts) => Promise<APICallReturn<boolean>>, applyCosts: (nftCosts: NFTCosts) => Promise<APICallReturn<NFTCosts>>, app: express.Application, runNaturalFunction: (req: Request, res: Response, balanceRunMain: BalanceRunMain) => Promise<void>) => {
    await setupSkyNode(skyNodeParam);
    const appFunctions = new PodAppFunction();
    const balanceRunMain = new BalanceRunMain(appFunctions, checkBalanceCondition, applyCosts, 60  * 1000);
    balanceRunMain.envConfig.SHOULD_ADD_BALANCE_TRACKER = false;
    await balanceRunMain.setup();
    balanceRunMain.update();

    app.post('/natural-request', protect, checkBalance, (req: Request, res: Response, next: NextFunction) => runNaturalFunction(req, res, balanceRunMain).catch(next));
    return balanceRunMain;
}