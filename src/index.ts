// Export core functionality
export { ApiKeyService } from './apiKeyService';
export { ServiceManagement } from './serviceManagement';
export { validateApiKey } from './middleware/validateApiKey';
export { protect } from './middleware/auth';

// Export Socket.IO functionality
export { 
  SocketIOManager,
  createSocketIOIntegration
} from './websocket/socketIOManager';

// Export types
export type { 
  ApiKeyConfig,
  ApiKeyResponse
} from './types/types';

export type { ServiceDetails } from './serviceManagement';

// Export Socket.IO types
export type {
  SocketIOConfig,
  SocketIOMessage,
  TaskUpdate
} from './websocket/socketIOManager';

// Export initialization
export { initAIAccessPoint, getSocketIOIntegration } from './init';
export type { AIAccessPointConfig } from './init';

export { 
  setupSkyNode,
  getSkyNode
} from './init'; 