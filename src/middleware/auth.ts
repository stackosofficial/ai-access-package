import { Request, Response, NextFunction } from "express";
import { masterValidation } from '../auth/apiKeyService';
import { Pool } from "pg";
import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import { sessionService } from '../auth/sessionService';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      apiKeyId?: string;
      generatedSessionToken?: string;
    }
  }
}

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

    // Generate session token for API key requests
    if (req.apiKeyId && validationResult.walletAddress && validationResult.accountNFT) {
      // Map agentCollection structure to match session service expectations
      // The agentCollection from validationResult should have agentAddress and agentID
      const sessionAgentCollection = validationResult.agentCollection ? {
        agentAddress: (validationResult.agentCollection as any).agentAddress,
        agentID: (validationResult.agentCollection as any).agentID
      } : undefined;

      const sessionToken = sessionService.generateSessionToken(
        req.apiKeyId,
        validationResult.walletAddress,
        validationResult.accountNFT,
        sessionAgentCollection
      );
      
      // Attach session token to request for later use
      req.generatedSessionToken = sessionToken;
      console.log(`🔑 Generated session token for API key: ${req.apiKeyId}`);
    }

    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Internal server error during authentication",
    });
  }
};