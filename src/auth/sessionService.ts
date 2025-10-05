import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface SessionTokenData {
  apiKeyId: string;
  walletAddress: string;
  accountNFT: {
    collectionID: string;
    nftID: string;
  };
  agentCollection?: {
    agentAddress: string;
    agentID?: string;
  };
  issuedAt: number;
  expiresAt: number;
  sessionId: string;
}

export interface SessionToken {
  data: SessionTokenData;
  signature: string;
}

export class SessionService {
  private expirationHours: number;

  constructor() {
    this.expirationHours = parseInt(process.env.SESSION_EXPIRATION_HOURS || '24');
  }

  /**
   * Generate a deterministic secret based on wallet, NFT, and agent data
   * This ensures cross-service compatibility for the same user/NFT/agent combination
   */
  private generateDeterministicSecret(
    walletAddress: string,
    accountNFT: { collectionID: string; nftID: string },
    agentCollection?: { agentAddress: string; agentID?: string }
  ): string {
    const components = [
      walletAddress.toLowerCase(),
      accountNFT.collectionID,
      accountNFT.nftID,
      agentCollection ? agentCollection.agentAddress.toLowerCase() : 'no-agent',
      agentCollection ? (agentCollection.agentID || 'no-agent-id') : 'no-agent-id'
    ];
    
    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }

  /**
   * Generate a session token from validated API key data
   */
  generateSessionToken(
    apiKeyId: string,
    walletAddress: string,
    accountNFT: { collectionID: string; nftID: string },
    agentCollection?: { agentAddress: string; agentID?: string }
  ): string {
    const now = Date.now();
    const expiresAt = now + (this.expirationHours * 60 * 60 * 1000);

    const sessionData: SessionTokenData = {
      apiKeyId,
      walletAddress,
      accountNFT,
      agentCollection,
      issuedAt: now,
      expiresAt,
      sessionId: uuidv4()
    };

    // Use deterministic secret for cross-service compatibility
    const secret = this.generateDeterministicSecret(walletAddress, accountNFT, agentCollection);
    const signature = this.signSessionDataWithSecret(sessionData, secret);
    
    const sessionToken: SessionToken = {
      data: sessionData,
      signature
    };

    // Encode as base64 for easy transport
    return Buffer.from(JSON.stringify(sessionToken)).toString('base64');
  }

  /**
   * Validate and parse a session token
   */
  validateSessionToken(token: string): { isValid: boolean; data?: SessionTokenData; error?: string } {
    try {
      // Decode from base64
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const sessionToken: SessionToken = JSON.parse(decoded);

      // Generate the same deterministic secret used for signing
      const secret = this.generateDeterministicSecret(
        sessionToken.data.walletAddress,
        sessionToken.data.accountNFT,
        sessionToken.data.agentCollection
      );

      // Verify signature using the deterministic secret
      const expectedSignature = this.signSessionDataWithSecret(sessionToken.data, secret);
      if (sessionToken.signature !== expectedSignature) {
        return {
          isValid: false,
          error: 'Invalid session token signature'
        };
      }

      // Check expiration
      if (Date.now() > sessionToken.data.expiresAt) {
        return {
          isValid: false,
          error: 'Session token has expired'
        };
      }

      return {
        isValid: true,
        data: sessionToken.data
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Invalid session token format: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Create HMAC signature for session data with a specific secret
   */
  private signSessionDataWithSecret(data: SessionTokenData, secret: string): string {
    const dataString = JSON.stringify(data);
    return crypto
      .createHmac('sha256', secret)
      .update(dataString)
      .digest('hex');
  }

  /**
   * Extract session token from request headers
   */
  extractSessionTokenFromRequest(req: any): string | null {
    // Check for session token in headers
    const sessionToken = req.headers['x-session-token'] || req.headers['authorization']?.replace('Bearer ', '');
    
    // Validate that it looks like a session token (base64 encoded JSON)
    if (sessionToken && this.isValidSessionTokenFormat(sessionToken)) {
      return sessionToken;
    }
    
    return null;
  }

  /**
   * Check if a token looks like a session token (basic format validation)
   */
  private isValidSessionTokenFormat(token: string): boolean {
    try {
      // Try to decode and parse to see if it's a valid session token
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      
      // Check if it has the expected structure
      return parsed.data && parsed.signature && 
             parsed.data.apiKeyId && parsed.data.walletAddress && 
             parsed.data.accountNFT && parsed.data.sessionId;
    } catch {
      return false;
    }
  }

  /**
   * Get session configuration info
   */
  getSessionConfig() {
    return {
      expirationHours: this.expirationHours,
      secretType: 'deterministic', // Uses deterministic secret based on wallet/NFT/agent data
      crossServiceCompatible: true // Any service using this SDK can validate tokens
    };
  }
}

// Export singleton instance
export const sessionService = new SessionService();
