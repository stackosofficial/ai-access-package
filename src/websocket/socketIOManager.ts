import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { TaskManager } from './taskManager';
import BalanceRunMain from '../balanceRunMain';
import { ResponseHandler } from '../types/types';

export interface SocketIOMessage {
  type: string;
  data: any;
  timestamp: number;
  correlationId?: string;
  taskId?: string;
}

export interface TaskUpdate {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  data?: any;
  error?: string;
}

export interface SocketIOConfig {
  path?: string;
  cors?: {
    origin: string | string[];
    methods: string[];
  };
}

export class SocketIOManager {
  private io: SocketIOServer | null = null;
  private taskManager: TaskManager;
  private balanceRunMain: BalanceRunMain;
  private config: SocketIOConfig;
  private connectedClients: Map<string, Socket> = new Map();
  private runNaturalFunction: any = null;

  constructor(balanceRunMain: BalanceRunMain, config?: SocketIOConfig) {
    this.balanceRunMain = balanceRunMain;
    this.config = {
      path: '/socket.io',
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      },
      ...config
    };
    this.taskManager = new TaskManager();
  }

  /**
   * Set the natural request function for processing
   */
  setNaturalRequestFunction(runNaturalFunction: any): void {
    this.runNaturalFunction = runNaturalFunction;
  }

  /**
   * Initialize Socket.IO server
   */
  async initialize(server: HTTPServer): Promise<void> {
    try {
      this.io = new SocketIOServer(server, {
        path: this.config.path,
        cors: this.config.cors,
        transports: ['websocket', 'polling'],
        allowEIO3: true
      });

      this.setupEventHandlers();
      console.log(`Socket.IO server initialized on path: ${this.config.path}`);
    } catch (error) {
      console.error('Failed to initialize Socket.IO server:', error);
      throw error;
    }
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    this.io.on('error', (error: Error) => {
      console.error('Socket.IO server error:', error);
    });
  }

  /**
   * Handle new Socket.IO connections
   */
  private handleConnection(socket: Socket): void {
    const clientId = socket.id;
    this.connectedClients.set(clientId, socket);

    console.log(`Socket.IO client connected: ${clientId}`);

    // Send welcome message
    socket.emit('auth', {
      type: 'auth',
      data: { status: 'connected', clientId },
      timestamp: Date.now()
    });

    // Handle natural_request event
    socket.on('natural_request', async (payload: any) => {
      try {
        await this.handleNaturalRequest(clientId, payload);
      } catch (error) {
        console.error(`Error handling natural_request from ${clientId}:`, error);
        socket.emit('error', {
          type: 'error',
          data: { error: 'Failed to process request' },
          timestamp: Date.now(),
          correlationId: payload.correlationId
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason: string) => {
      this.handleDisconnection(clientId, reason);
    });
  }

  /**
   * Handle natural language requests using the same response handler pattern
   */
  private async handleNaturalRequest(clientId: string, payload: any): Promise<void> {
    const taskId = this.generateTaskId();
    const socket = this.connectedClients.get(clientId);

    if (!socket) {
      console.warn(`Socket not found for client: ${clientId}`);
      return;
    }

    // Create Socket.IO response handler
    const responseHandler = new SocketIOResponseHandlerImpl(clientId, taskId, this);

    // Register task for tracking
    this.taskManager.registerTask(taskId, clientId, payload);

    try {
      // Use the same natural request processing as REST API
      if (this.runNaturalFunction) {
        // Create mock request and response objects for the natural function
        const mockReq = {
          body: payload,
          query: {},
          headers: {},
          user: payload.userAuthPayload?.userAddress ? { 
            id: payload.userAuthPayload.userAddress,
            wallet: payload.userAuthPayload.userAddress 
          } : undefined
        };

        const mockRes = {
          status: () => ({ json: () => {} }),
          json: () => {},
          write: () => {},
          end: () => {}
        };

        // Call the natural function with Socket.IO response handler
        await this.runNaturalFunction(mockReq, mockRes, this.balanceRunMain, responseHandler);
      } else {
        // Fallback to simulation if no natural function is set
        await this.simulateProcessing(responseHandler, payload);
      }
    } catch (error) {
      console.error(`Error processing natural request for ${clientId}:`, error);
      responseHandler.sendError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Handle client disconnections
   */
  private handleDisconnection(clientId: string, reason: string): void {
    this.connectedClients.delete(clientId);
    this.taskManager.cancelTasksForClient(clientId);
    
    console.log(`Socket.IO client disconnected: ${clientId} (${reason})`);
  }

  /**
   * Send task update to specific client
   */
  sendTaskUpdate(clientId: string, update: TaskUpdate): void {
    const socket = this.connectedClients.get(clientId);
    if (socket && socket.connected) {
      socket.emit('update', {
        type: 'update',
        data: update,
        timestamp: Date.now(),
        taskId: update.taskId
      });
    } else {
      console.warn(`Cannot send message to disconnected client: ${clientId}`);
    }
  }

  /**
   * Simulate AI processing (fallback when no natural function is available)
   */
  private async simulateProcessing(
    responseHandler: SocketIOResponseHandlerImpl,
    payload: any
  ): Promise<void> {
    // Send initial update
    responseHandler.sendUpdate({
      message: 'Processing your request...',
      step: 'initializing'
    });

    // Simulate processing steps
    await this.delay(1000);
    responseHandler.sendUpdate({
      message: 'Analyzing request...',
      step: 'analysis',
      progress: 25
    });

    await this.delay(1000);
    responseHandler.sendUpdate({
      message: 'Generating response...',
      step: 'generation',
      progress: 50
    });

    await this.delay(1000);
    responseHandler.sendUpdate({
      message: 'Finalizing...',
      step: 'finalization',
      progress: 75
    });

    await this.delay(500);
    
    // Send final response
    responseHandler.sendFinalResponse({
      message: 'Request completed successfully',
      result: {
        prompt: payload.prompt || 'No prompt provided',
        response: 'This is a simulated AI response via Socket.IO',
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    totalTasks: number;
    activeTasks: number;
  } {
    return {
      totalConnections: this.connectedClients.size,
      activeConnections: Array.from(this.connectedClients.values()).filter(socket => socket.connected).length,
      totalTasks: this.taskManager.getTotalTasks(),
      activeTasks: this.taskManager.getActiveTasks()
    };
  }

  /**
   * Stop Socket.IO server
   */
  async stop(): Promise<void> {
    if (this.io) {
      this.io.close();
      this.io = null;
    }
    this.connectedClients.clear();
    console.log('Socket.IO server stopped');
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Socket.IO-specific response handler that implements the same interface as REST/HTTP streaming
 */
export class SocketIOResponseHandlerImpl implements ResponseHandler {
  private clientId: string;
  private taskId: string;
  private socketManager: SocketIOManager;
  private hasStarted: boolean;
  private hasEnded: boolean;

  constructor(clientId: string, taskId: string, socketManager: SocketIOManager) {
    this.clientId = clientId;
    this.taskId = taskId;
    this.socketManager = socketManager;
    this.hasStarted = false;
    this.hasEnded = false;
  }

  // Send partial update (Socket.IO streaming) - same as HTTP streaming
  sendUpdate(data: any): void {
    if (this.hasEnded) return;
    
    this.hasStarted = true;
    this.socketManager.sendTaskUpdate(this.clientId, {
      taskId: this.taskId,
      status: 'processing',
      progress: 50,
      data
    });
  }

  // Send final response and end - same as REST API final response
  sendFinalResponse(data: any): void {
    if (this.hasEnded) return;
    this.hasEnded = true;
    
    this.socketManager.sendTaskUpdate(this.clientId, {
      taskId: this.taskId,
      status: 'completed',
      progress: 100,
      data
    });
  }

  // Send an error response - same as REST API error response
  sendError(error: string | Error, statusCode: number = 500): void {
    if (this.hasEnded) return;
    this.hasEnded = true;
    
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    this.socketManager.sendTaskUpdate(this.clientId, {
      taskId: this.taskId,
      status: 'failed',
      error: errorMessage
    });
  }

  // Check if this is a streaming request (always true for Socket.IO)
  isStreamingRequest(): boolean {
    return true;
  }
}

/**
 * Factory function to create Socket.IO integration
 */
export function createSocketIOIntegration(
  balanceRunMain: BalanceRunMain,
  config?: SocketIOConfig
): SocketIOManager {
  return new SocketIOManager(balanceRunMain, config);
} 