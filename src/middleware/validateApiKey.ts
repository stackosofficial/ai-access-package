import { Request, Response, NextFunction } from 'express';
import { ApiKeyService } from '../apiKeyService';

export const validateApiKey = (apiKeyService: ApiKeyService) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      
      // If API key is not provided, continue with normal auth flow
      if (!apiKey) {
        return next();
      }

      const isValid = await apiKeyService.validateApiKey(apiKey, req);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid or revoked API key' });
      }

      next();
    } catch (error) {
      res.status(500).json({ error: 'Error validating API key' });
    }
  };
};

/**
 * Middleware for service-specific API key validation and logging
 * This uses the simplified service management approach
 */
export const validateServiceApiKey = (apiKeyService: ApiKeyService, serviceId: string, serviceUrl: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      
      // If API key is not provided, return error
      if (!apiKey) {
        return res.status(401).json({ error: 'API key is required for this service' });
      }

      // Use the combined validation and logging method
      const isValid = await apiKeyService.validateApiKeyForService(apiKey, serviceId, serviceUrl);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid or revoked API key' });
      }

      next();
    } catch (error) {
      res.status(500).json({ error: 'Error validating API key for service' });
    }
  };
}; 