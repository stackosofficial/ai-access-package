import { Request, Response } from 'express';
import { z } from 'zod';

import type { AuthRepository } from '../data-access/authRepository';
import type { AuthService } from '../types';

const authRequestSchema = z.object({
  userAgentId: z.string().uuid('userAgentId must be a valid UUID').optional(),
});

const saveAuthRequestSchema = z.object({
  userAgentId: z.string().uuid('userAgentId must be a valid UUID').optional(),
  authData: z.record(z.string(), z.unknown()),
});

const updateAuthRequestSchema = z.object({
  userAgentId: z.string().uuid('userAgentId must be a valid UUID').optional(),
  authData: z.record(z.string(), z.unknown()),
});

export function createAuthEndpoints(repository: AuthRepository, authService: AuthService, appName: string) {
  return {
    checkAuth: (req: Request, res: Response): void => {
      void (async () => {
        try {
          if (!req.organisationId) {
            res.status(401).json({
              success: false,
              error: 'Organisation ID not found',
            });
            return;
          }

          // Validate request body
          const validation = authRequestSchema.safeParse(req.body);
          if (!validation.success) {
            const errorMessages = validation.error.issues
              .map(issue => `${issue.path.join('.')}: ${issue.message}`)
              .join(', ');
            res.status(400).json({
              success: false,
              error: `Validation failed: ${errorMessages}`,
            });
            return;
          }

          const userAgentId = validation.data.userAgentId ?? null;

          // Validate userAgentId belongs to organisation if provided
          if (userAgentId) {
            // This validation should be done by the SDK middleware before reaching here
            // But we'll add a safety check
          }

          // Check auth in database
          const findResult = await repository.findAuth(req.organisationId, userAgentId, appName)();

          if (findResult._tag === 'Left') {
            res.status(500).json({
              success: false,
              error: 'Failed to check auth',
            });
            return;
          }

          const authRecord = findResult.right;

          if (!authRecord) {
            res.status(200).json({
              success: true,
              exists: false,
            });
            return;
          }

          // Also check with service's checkAuth function (optional validation)
          // This checks if the auth is still valid with the third-party service
          let serviceCheck: boolean | undefined;
          try {
            serviceCheck = await authService.checkAuth(userAgentId, req.organisationId, appName);
          } catch (error) {
            // If service check fails, we still return the auth data
            // The service check is optional validation
            console.warn('Service auth check failed:', error);
          }

          res.status(200).json({
            success: true,
            exists: true, // Auth exists in database
            authData: authRecord.authData,
            ...(serviceCheck !== undefined && { isValid: serviceCheck }), // Optional: include service validation result
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({
            success: false,
            error: errorMessage,
          });
        }
      })();
    },

    generateAuth: (req: Request, res: Response): void => {
      void (async () => {
        try {
          if (!req.organisationId) {
            res.status(401).json({
              success: false,
              error: 'Organisation ID not found',
            });
            return;
          }

          // Validate request body
          const validation = authRequestSchema.safeParse(req.body);
          if (!validation.success) {
            const errorMessages = validation.error.issues
              .map(issue => `${issue.path.join('.')}: ${issue.message}`)
              .join(', ');
            res.status(400).json({
              success: false,
              error: `Validation failed: ${errorMessages}`,
            });
            return;
          }

          const userAgentId = validation.data.userAgentId ?? null;

          // Validate userAgentId belongs to organisation if provided
          if (userAgentId) {
            // This validation should be done by the SDK middleware before reaching here
          }

          // Call service's generateAuth function
          const authLink = await authService.generateAuth(userAgentId, req.organisationId, appName);

          res.status(200).json({
            success: true,
            authLink: authLink.authLink,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({
            success: false,
            error: errorMessage,
          });
        }
      })();
    },

    revokeAuth: (req: Request, res: Response): void => {
      void (async () => {
        try {
          if (!req.organisationId) {
            res.status(401).json({
              success: false,
              error: 'Organisation ID not found',
            });
            return;
          }

          // Validate request body
          const validation = authRequestSchema.safeParse(req.body);
          if (!validation.success) {
            const errorMessages = validation.error.issues
              .map(issue => `${issue.path.join('.')}: ${issue.message}`)
              .join(', ');
            res.status(400).json({
              success: false,
              error: `Validation failed: ${errorMessages}`,
            });
            return;
          }

          const userAgentId = validation.data.userAgentId ?? null;

          // Validate userAgentId belongs to organisation if provided
          if (userAgentId) {
            // This validation should be done by the SDK middleware before reaching here
          }

          // Delete auth from database
          const deleteResult = await repository.deleteAuth(req.organisationId, userAgentId, appName)();

          if (deleteResult._tag === 'Left') {
            res.status(500).json({
              success: false,
              error: 'Failed to revoke auth',
            });
            return;
          }

          res.status(200).json({
            success: true,
            message: 'Auth revoked successfully',
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({
            success: false,
            error: errorMessage,
          });
        }
      })();
    },

    saveAuth: (req: Request, res: Response): void => {
      void (async () => {
        try {
          if (!req.organisationId) {
            res.status(401).json({
              success: false,
              error: 'Organisation ID not found',
            });
            return;
          }

          // Validate request body
          const validation = saveAuthRequestSchema.safeParse(req.body);
          if (!validation.success) {
            const errorMessages = validation.error.issues
              .map(issue => `${issue.path.join('.')}: ${issue.message}`)
              .join(', ');
            res.status(400).json({
              success: false,
              error: `Validation failed: ${errorMessages}`,
            });
            return;
          }

          const userAgentId = validation.data.userAgentId ?? null;
          const authData = validation.data.authData;

          // Validate userAgentId belongs to organisation if provided
          if (userAgentId) {
            // This validation should be done by the SDK middleware before reaching here
          }

          // Save auth data using service's saveAuth function
          await authService.saveAuth(userAgentId, req.organisationId, appName, authData);

          // Also save to database
          const saveResult = await repository.saveAuth(req.organisationId, userAgentId, appName, authData)();

          if (saveResult._tag === 'Left') {
            res.status(500).json({
              success: false,
              error: 'Failed to save auth',
            });
            return;
          }

          res.status(200).json({
            success: true,
            message: 'Auth saved successfully',
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({
            success: false,
            error: errorMessage,
          });
        }
      })();
    },

    updateAuth: (req: Request, res: Response): void => {
      void (async () => {
        try {
          if (!req.organisationId) {
            res.status(401).json({
              success: false,
              error: 'Organisation ID not found',
            });
            return;
          }

          // Validate request body
          const validation = updateAuthRequestSchema.safeParse(req.body);
          if (!validation.success) {
            const errorMessages = validation.error.issues
              .map(issue => `${issue.path.join('.')}: ${issue.message}`)
              .join(', ');
            res.status(400).json({
              success: false,
              error: `Validation failed: ${errorMessages}`,
            });
            return;
          }

          const userAgentId = validation.data.userAgentId ?? null;
          const authData = validation.data.authData;

          // Validate userAgentId belongs to organisation if provided
          if (userAgentId) {
            // This validation should be done by the SDK middleware before reaching here
          }

          // Update auth data using service's updateAuth function
          await authService.updateAuth(userAgentId, req.organisationId, appName, authData);

          // Also update in database
          const updateResult = await repository.updateAuth(req.organisationId, userAgentId, appName, authData)();

          if (updateResult._tag === 'Left') {
            res.status(500).json({
              success: false,
              error: updateResult.left.message || 'Failed to update auth',
            });
            return;
          }

          res.status(200).json({
            success: true,
            message: 'Auth updated successfully',
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({
            success: false,
            error: errorMessage,
          });
        }
      })();
    },
  };
}
