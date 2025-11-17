import { Request, Response, NextFunction } from "express";

// Legacy middleware placeholder kept for backward compatibility.
// New code should use the creditsService helpers directly instead of this.
export const checkBalance = async (
  _req: Request,
  _res: Response,
  next: NextFunction,
  _pool: any
) => {
  // No-op: balance checking is now handled by the web3 credits service.
  return next();
};
