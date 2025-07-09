import { Request, Response, NextFunction } from "express";
import { masterValidation } from '../auth/apiKeyService';

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skyNode = (global as any).skyNode;
    
    if (!skyNode) {
      return res.status(401).json({
        success: false,
        message: "Failed to initialize SkyNode",
      });
    }

    const validationResult = await masterValidation(req, skyNode);
    
    if (!validationResult.isValid) {
      return res.status(401).json({
        success: false,
        message: validationResult.error || "Authentication failed",
      });
    }

    const newBody = {
      prompt: req.body.prompt,
      agentCollection: validationResult.agentCollection,
      accountNFT: validationResult.accountNFT,
      walletAddress: validationResult.walletAddress,
    }
    req.body = {...req.body, ...newBody};
    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Internal server error during authentication",
    });
  }
};