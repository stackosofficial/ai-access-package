import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import BalanceRunMain from "./balanceRunMain";
import { ENVDefinition, ResponseHandler } from "./types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import express, { Request, Response } from "express";
import multer from "multer";
export declare const setupSkyNode: (skyNodeParam: SkyMainNodeJS) => Promise<void>;
export declare const getSkyNode: () => SkyMainNodeJS;
export declare class ResponseHandlerImpl implements ResponseHandler {
    private req;
    private res;
    private isStreaming;
    private hasStarted;
    private hasEnded;
    constructor(req: Request, res: Response);
    sendUpdate(data: any): void;
    sendFinalResponse(data: any): void;
    sendError(error: string | Error, statusCode?: number): void;
    isStreamingRequest(): boolean;
}
export type LegacyRunNaturalFunctionType = (req: Request, res: Response, balanceRunMain: BalanceRunMain) => Promise<void>;
export type RunNaturalFunctionType = (req: Request, res: Response, balanceRunMain: BalanceRunMain, responseHandler: ResponseHandler) => Promise<void>;
export declare function adaptLegacyFunction(legacyFn: LegacyRunNaturalFunctionType): RunNaturalFunctionType;
export declare const initAIAccessPoint: (env: ENVDefinition, skyNodeParam: SkyMainNodeJS, app: express.Application, runNaturalFunction: RunNaturalFunctionType | LegacyRunNaturalFunctionType, runUpdate: boolean, upload?: multer.Multer) => Promise<APICallReturn<BalanceRunMain>>;
