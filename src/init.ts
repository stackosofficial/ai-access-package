import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import BalanceRunMain from "./balanceRunMain";
import { ENVDefinition, NFTCosts } from "./types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
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



export const initAIAccessPoint = async (env: ENVDefinition, skyNodeParam: SkyMainNodeJS, checkBalanceCondition: (nftCosts: NFTCosts) => Promise<APICallReturn<boolean>>, applyCosts: (nftCosts: NFTCosts) => Promise<APICallReturn<NFTCosts>>, app: express.Application, runNaturalFunction: (req: Request, res: Response, balanceRunMain: BalanceRunMain) => Promise<void>) => {
    await setupSkyNode(skyNodeParam);
    const balanceRunMain = new BalanceRunMain(env, checkBalanceCondition, applyCosts, 60  * 1000);
    await balanceRunMain.setup();
    balanceRunMain.update();

    app.post('/natural-request', protect, checkBalance, (req: Request, res: Response, next: NextFunction) => runNaturalFunction(req, res, balanceRunMain).catch(next));
    return balanceRunMain;
}