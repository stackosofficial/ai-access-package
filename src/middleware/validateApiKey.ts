import { Request, Response, NextFunction } from 'express';
import { ApiKeyService } from '../apiKeyService';

export const validateApiKey = (apiKeyService: ApiKeyService) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = req.headers['x-api-key'];

      if (!apiKey || typeof apiKey !== 'string') {
        return res.status(401).json({ error: 'API key is required' });
      }

      const isValid = await apiKeyService.validateApiKey(apiKey);
      console.trace("Called apiKeyService.validateApiKey");
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      // Get API key details and attach to request
      const keyDetails = await apiKeyService.getApiKeyDetails(apiKey);
      if (!keyDetails) {
        return res.status(401).json({ error: 'Could not retrieve API key details' });
      }

      // Attach accountNFT to request body if not present
      if (!req.body.accountNFT) {
        req.body.accountNFT = {
          collectionID: keyDetails.nft_collection_id,
          nftID: keyDetails.nft_id 
        };
      }

      next();
    } catch (error) {
      console.error('API key validation error:', error);
      return res.status(500).json({ error: 'Error validating API key' });
    }
  };
};