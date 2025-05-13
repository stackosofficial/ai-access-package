import { Request, Response, NextFunction } from "express";
export declare const checkBalance: (req: Request, res: Response, next: NextFunction, SERVER_COST_CONTRACT_ADDRESS: string) => Promise<Response<any, Record<string, any>> | undefined>;
