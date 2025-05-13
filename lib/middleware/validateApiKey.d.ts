import { Request, Response, NextFunction } from 'express';
import { ApiKeyService } from '../apiKeyService';
export declare const validateApiKey: (apiKeyService: ApiKeyService) => (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
/**
 * Middleware for service-specific API key validation and logging
 * This uses the simplified service management approach
 */
export declare const validateServiceApiKey: (apiKeyService: ApiKeyService, serviceId: string, serviceUrl: string) => (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
