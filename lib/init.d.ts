import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import BalanceRunMain from "./balanceRunMain";
import { ENVDefinition, ResponseHandler, ApiKeyConfig } from "./types/types";
import { ApiKeyService } from "./apiKeyService";
import { Request, Response } from "express";
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
export interface AIAccessPointConfig {
    apiKeyConfig?: ApiKeyConfig;
}
export declare const initAIAccessPoint: (env: ENVDefinition, skyNodeParam: SkyMainNodeJS, config?: AIAccessPointConfig) => Promise<{
    balanceRunMain: BalanceRunMain;
    apiKeyService?: ApiKeyService;
}>;
