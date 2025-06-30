// Export core functionality
export { ApiKeyService } from './apiKeyService';
export { ServiceManagement } from './serviceManagement';
export { validateApiKey } from './middleware/validateApiKey';
export { protect } from './middleware/auth';

// Export auth service
export { AuthService, createAuthService } from './services/authService';

// Export types
export type { 
  ApiKeyConfig,
  ApiKeyResponse
} from './types/types';

export type { ServiceDetails } from './serviceManagement';

// Export initialization
export { initAIAccessPoint, getAuthService } from './init';
export type { AIAccessPointConfig } from './init';

export { 
  setupSkyNode,
  getSkyNode
} from './init'; 