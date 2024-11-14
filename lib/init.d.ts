import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import BalanceRunMain from "./balanceRunMain";
import { NFTCosts } from "./types/types";
import { APICallReturn } from "@decloudlabs/sky-cluster-operator/lib/types/types";
import express, { Request, Response } from 'express';
export declare const setupSkyNode: (skyNodeParam: SkyMainNodeJS) => Promise<void>;
export declare const getSkyNode: () => SkyMainNodeJS;
export declare const initAIAccessPoint: (skyNodeParam: SkyMainNodeJS, checkBalanceCondition: (nftCosts: NFTCosts) => Promise<APICallReturn<boolean>>, applyCosts: (nftCosts: NFTCosts) => Promise<APICallReturn<NFTCosts>>, app: express.Application, runNaturalFunction: (req: Request, res: Response, balanceRunMain: BalanceRunMain) => Promise<void>) => Promise<BalanceRunMain>;
