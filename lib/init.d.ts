import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import BalanceRunMain from "./balanceRunMain";
import { ENVDefinition } from "./types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import express, { Request, Response } from "express";
import multer from "multer";
export declare const setupSkyNode: (skyNodeParam: SkyMainNodeJS) => Promise<void>;
export declare const getSkyNode: () => SkyMainNodeJS;
export declare const initAIAccessPoint: (env: ENVDefinition, skyNodeParam: SkyMainNodeJS, app: express.Application, runNaturalFunction: (req: Request, res: Response, balanceRunMain: BalanceRunMain) => Promise<void>, runUpdate: boolean, upload?: multer.Multer) => Promise<APICallReturn<BalanceRunMain>>;
