import { Request, Response, NextFunction } from "express";
import { sessionService } from '../auth/sessionService';

export const validateSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Extract session token from request
    const sessionToken = sessionService.extractSessionTokenFromRequest(req);
    
    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: "No valid session token provided"
      });
    }

    // Validate the session token
    const validationResult = sessionService.validateSessionToken(sessionToken);
    
    if (!validationResult.isValid) {
      console.log(`❌ Session validation failed: ${validationResult.error}`);
      return res.status(401).json({
        success: false,
        message: `Session validation failed: ${validationResult.error}`
      });
    }

    const sessionData = validationResult.data!;
    
    // Attach validated session data to request body
    // This replaces the data that would normally come from protect middleware
    const sessionBody = {
      prompt: req.body.prompt,
      systemPrompt: req.body.systemPrompt || req.body.system_prompt || req.body['systemPrompt'] || req.body['system_prompt'],
      agentCollection: sessionData.agentCollection,
      accountNFT: sessionData.accountNFT,
      walletAddress: sessionData.walletAddress,
      // Preserve original request data
      ...req.body
    };

    // Attach session metadata for logging/debugging
    req.body = sessionBody;
    req.sessionData = {
      sessionId: sessionData.sessionId,
      apiKeyId: sessionData.apiKeyId,
      issuedAt: sessionData.issuedAt,
      expiresAt: sessionData.expiresAt
    };

    console.log(`✅ Session validation successful for wallet: ${sessionData.walletAddress} (session: ${sessionData.sessionId})`);
    
    // Skip to the next middleware (which should be the main handler)
    next();
  } catch (error: any) {
    console.error('❌ Error in validateSession middleware:', error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during session validation"
    });
  }
};

// Extend Express Request interface to include session data
declare global {
  namespace Express {
    interface Request {
      sessionData?: {
        sessionId: string;
        apiKeyId: string;
        issuedAt: number;
        expiresAt: number;
      };
    }
  }
}
