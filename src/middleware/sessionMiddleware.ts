import { Request, Response, NextFunction } from "express";
import { sessionService } from '../auth/sessionService';

/**
 * Session Middleware - Fast path for session tokens
 * Validates session and sets all required data, skipping blockchain verification
 */
export const sessionMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Try to extract session token from request
    const sessionToken = sessionService.extractSessionTokenFromRequest(req);
    
    if (!sessionToken) {
      // No session token, continue to normal auth flow
      return next();
    }

    // Validate the session token
    const validationResult = sessionService.validateSessionToken(sessionToken);
    
    if (!validationResult.isValid) {
      // Invalid session token, log but continue to normal auth flow
      console.log(`⚠️ Invalid session token: ${validationResult.error}, falling back to normal auth`);
      return next();
    }

    const sessionData = validationResult.data!;
    
    // FAST PATH: Extract all data from session and set directly
    // This skips parseAuth and protect middleware entirely
    req.body = {
      ...req.body,
      walletAddress: sessionData.walletAddress,
      accountNFT: sessionData.accountNFT,
      agentCollection: sessionData.agentCollection
    };
    
    // Set apiKeyId for checkBalance middleware
    (req as any).apiKeyId = sessionData.apiKeyId;
    
    // Mark as session request for logging
    (req as any).isSessionRequest = true;
    (req as any).sessionValidated = true;
    
    console.log(`🚀 Session fast path: Validated session ${sessionData.sessionId} for wallet ${sessionData.walletAddress} (skipping blockchain verification)`);
    
    // Continue to next middleware (skip parseAuth and protect)
    next();
  } catch (error: any) {
    console.error('❌ Error in sessionMiddleware:', error);
    // Don't fail the request, just continue to normal auth flow
    next();
  }
};

