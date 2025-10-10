import { Request, Response, NextFunction } from "express";
import { sessionService } from '../auth/sessionService';

/**
 * Session Middleware - Extracts API key from session token and adds to headers
 * This runs BEFORE parseAuth to allow session tokens to be treated like API keys
 */
export const sessionMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Try to extract session token from request
    const sessionToken = sessionService.extractSessionTokenFromRequest(req);
    
    if (!sessionToken) {
      // No session token, continue to parseAuth (will handle API key or signature)
      return next();
    }

    // Validate the session token
    const validationResult = sessionService.validateSessionToken(sessionToken);
    
    if (!validationResult.isValid) {
      // Invalid session token, log but continue to parseAuth (might have API key/signature)
      console.log(`⚠️ Invalid session token: ${validationResult.error}, continuing to parseAuth`);
      return next();
    }

    const sessionData = validationResult.data!;
    
    // Extract API key ID from session and add to headers
    // This allows the session to be treated like an API key request
    req.headers['x-api-key'] = sessionData.apiKeyId;
    
    // Mark this as a session request for logging/optimization
    (req as any).isSessionRequest = true;
    
    console.log(`🔑 Session token validated, extracted API key: ${sessionData.apiKeyId} (session: ${sessionData.sessionId})`);
    
    // Continue to parseAuth which will now process the API key
    next();
  } catch (error: any) {
    console.error('❌ Error in sessionMiddleware:', error);
    // Don't fail the request, just continue to parseAuth
    next();
  }
};

