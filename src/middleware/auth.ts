import { Request, Response, NextFunction } from "express";
import { masterValidation } from '../auth/apiKeyService';
import { Pool } from "pg";
import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";

export const protect = async (req: Request, res: Response, next: NextFunction, skyNode: SkyMainNodeJS, pool: Pool) => {
  try {
    
    if (!skyNode) {
      return res.status(401).json({
        success: false,
        message: "Failed to initialize SkyNode",
      });
    }

    const validationResult = await masterValidation(req, skyNode, pool);
    
    if (!validationResult.isValid) {
      return res.status(401).json({
        success: false,
        message: validationResult.error || "Authentication failed",
      });
    }

    const newBody = {
      prompt: req.body.prompt,
      systemPrompt: req.body.systemPrompt || req.body.system_prompt || req.body['systemPrompt'] || req.body['system_prompt'],
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