/**
 * Auth Service Interface
 * Services using the SDK must implement these functions for third-party authentication
 */
export interface AuthService {
  /**
   * Check if authentication exists for the given parameters
   * @param userAgentId - Optional user agent ID (null for org-level auth)
   * @param organisationId - Organisation ID
   * @param authService - Service name (appName)
   * @returns Promise resolving to boolean indicating if auth exists
   */
  checkAuth(userAgentId: string | null, organisationId: string, authService: string): Promise<boolean>;

  /**
   * Save authentication data after successful authentication
   * @param userAgentId - Optional user agent ID (null for org-level auth)
   * @param organisationId - Organisation ID
   * @param authService - Service name (appName)
   * @param authData - Authentication data to save (tokens, credentials, etc.)
   * @returns Promise resolving when save is complete
   */
  saveAuth(
    userAgentId: string | null,
    organisationId: string,
    authService: string,
    authData: Record<string, unknown>
  ): Promise<void>;

  /**
   * Generate authentication link/URL for the user to authenticate
   * @param userAgentId - Optional user agent ID (null for org-level auth)
   * @param organisationId - Organisation ID
   * @param authService - Service name (appName)
   * @returns Promise resolving to auth link/URL
   */
  generateAuth(userAgentId: string | null, organisationId: string, authService: string): Promise<{ authLink: string }>;
}

/**
 * Auth data stored in database
 */
export interface AuthRecord {
  id: string;
  organisationId: string;
  userAgentId: string | null;
  authService: string;
  authData: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
