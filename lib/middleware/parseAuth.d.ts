import { Request, Response, NextFunction } from "express";
export declare const parseAuth: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
