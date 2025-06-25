import { TaskUpdate } from './socketIOManager';

export interface TaskInfo {
  id: string;
  clientId: string;
  data: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  createdAt: Date;
  updatedAt: Date;
  result?: any;
  error?: string;
}

export class TaskManager {
  private tasks: Map<string, TaskInfo> = new Map();
  private clientTasks: Map<string, Set<string>> = new Map();

  /**
   * Register a new task
   */
  registerTask(taskId: string, clientId: string, data: any): void {
    const taskInfo: TaskInfo = {
      id: taskId,
      clientId,
      data,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.tasks.set(taskId, taskInfo);

    // Track tasks per client
    if (!this.clientTasks.has(clientId)) {
      this.clientTasks.set(clientId, new Set());
    }
    this.clientTasks.get(clientId)!.add(taskId);

    console.log(`Task registered: ${taskId} for client: ${clientId}`);
  }

  /**
   * Update task status and progress
   */
  updateTask(taskId: string, update: Partial<TaskUpdate>): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`Task not found: ${taskId}`);
      return false;
    }

    // Update task info
    if (update.status) task.status = update.status;
    if (update.progress !== undefined) task.progress = update.progress;
    if (update.data) task.result = update.data;
    if (update.error) task.error = update.error;
    
    task.updatedAt = new Date();

    console.log(`Task updated: ${taskId} - ${task.status} (${task.progress}%)`);
    return true;
  }

  /**
   * Complete a task
   */
  completeTask(taskId: string, result: any): boolean {
    return this.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      data: result
    });
  }

  /**
   * Fail a task
   */
  failTask(taskId: string, error: string): boolean {
    return this.updateTask(taskId, {
      status: 'failed',
      error
    });
  }

  /**
   * Get task information
   */
  getTask(taskId: string): TaskInfo | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks for a client
   */
  getClientTasks(clientId: string): TaskInfo[] {
    const taskIds = this.clientTasks.get(clientId);
    if (!taskIds) return [];

    return Array.from(taskIds)
      .map(taskId => this.tasks.get(taskId))
      .filter((task): task is TaskInfo => task !== undefined);
  }

  /**
   * Cancel all tasks for a client
   */
  cancelTasksForClient(clientId: string): void {
    const taskIds = this.clientTasks.get(clientId);
    if (!taskIds) return;

    taskIds.forEach(taskId => {
      this.updateTask(taskId, {
        status: 'failed',
        error: 'Client disconnected'
      });
    });

    this.clientTasks.delete(clientId);
    console.log(`Cancelled ${taskIds.size} tasks for client: ${clientId}`);
  }

  /**
   * Remove completed tasks (cleanup)
   */
  cleanupCompletedTasks(maxAge: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      const taskAge = now - task.updatedAt.getTime();
      
      if ((task.status === 'completed' || task.status === 'failed') && taskAge > maxAge) {
        this.tasks.delete(taskId);
        
        // Remove from client tracking
        const clientTasks = this.clientTasks.get(task.clientId);
        if (clientTasks) {
          clientTasks.delete(taskId);
          if (clientTasks.size === 0) {
            this.clientTasks.delete(task.clientId);
          }
        }
        
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} completed tasks`);
    }

    return cleanedCount;
  }

  /**
   * Get task statistics
   */
  getStats(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    const stats = {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    };

    for (const task of this.tasks.values()) {
      stats.total++;
      stats[task.status]++;
    }

    return stats;
  }

  /**
   * Get total number of tasks
   */
  getTotalTasks(): number {
    return this.tasks.size;
  }

  /**
   * Get number of active tasks
   */
  getActiveTasks(): number {
    let activeCount = 0;
    for (const task of this.tasks.values()) {
      if (task.status === 'pending' || task.status === 'processing') {
        activeCount++;
      }
    }
    return activeCount;
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: TaskInfo['status']): TaskInfo[] {
    return Array.from(this.tasks.values()).filter(task => task.status === status);
  }

  /**
   * Get recent tasks
   */
  getRecentTasks(limit: number = 10): TaskInfo[] {
    return Array.from(this.tasks.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
} 