// Export core functionality
export { ServiceManagement } from '../database/serviceManagement';
export { protect } from '../middleware/auth';

// Export auth service
export { AuthService, createAuthService } from '../auth/authService';

// Export types
export type { 
  ApiKeyConfig,
  ApiKeyResponse
} from '../types/types';

export type { ServiceDetails } from '../database/serviceManagement';

// Export initialization
export { initAIAccessPoint, getAuthService } from './init';
export type { AIAccessPointConfig } from './init';

export { 
  setupSkyNode,
  getSkyNode
} from './init'; 