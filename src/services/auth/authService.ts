import { Pool } from 'pg';

import { createAuthRepository } from './data-access/authRepository';
import type { AuthRecord } from './types';

/**
 * Auth Data Service - SDK functions for managing authentication data
 * Use these functions directly in your service code to get, save, update, or delete auth data
 */
export function createAuthDataService(pool: Pool, appName: string) {
  const repository = createAuthRepository(pool);

  return {
    /**
     * Get authentication data
     * @param organisationId - Organisation ID
     * @param userAgentId - Optional user agent ID (null for org-level auth)
     * @returns Promise resolving to AuthRecord or null if not found
     */
    async getAuth(organisationId: string, userAgentId?: string | null): Promise<AuthRecord | null> {
      const result = await repository.findAuth(organisationId, userAgentId ?? null, appName)();
      if (result._tag === 'Left') {
        throw result.left;
      }
      return result.right;
    },

    /**
     * Save authentication data (creates new or updates existing)
     * @param organisationId - Organisation ID
     * @param authData - Authentication data to save
     * @param userAgentId - Optional user agent ID (null for org-level auth)
     * @returns Promise resolving to the auth record ID
     */
    async saveAuth(
      organisationId: string,
      authData: Record<string, unknown>,
      userAgentId?: string | null
    ): Promise<string> {
      const result = await repository.saveAuth(organisationId, userAgentId ?? null, appName, authData)();
      if (result._tag === 'Left') {
        throw result.left;
      }
      return result.right;
    },

    /**
     * Update existing authentication data
     * @param organisationId - Organisation ID
     * @param authData - Updated authentication data
     * @param userAgentId - Optional user agent ID (null for org-level auth)
     * @returns Promise resolving when update is complete
     */
    async updateAuth(
      organisationId: string,
      authData: Record<string, unknown>,
      userAgentId?: string | null
    ): Promise<void> {
      const result = await repository.updateAuth(organisationId, userAgentId ?? null, appName, authData)();
      if (result._tag === 'Left') {
        throw result.left;
      }
    },

    /**
     * Delete/revoke authentication
     * @param organisationId - Organisation ID
     * @param userAgentId - Optional user agent ID (null for org-level auth)
     * @returns Promise resolving when deletion is complete
     */
    async deleteAuth(organisationId: string, userAgentId?: string | null): Promise<void> {
      const result = await repository.deleteAuth(organisationId, userAgentId ?? null, appName)();
      if (result._tag === 'Left') {
        throw result.left;
      }
    },
  };
}

export type AuthDataService = ReturnType<typeof createAuthDataService>;
