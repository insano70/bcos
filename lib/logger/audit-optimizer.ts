/**
 * Audit Logging Optimizer
 * Buffers non-critical audit events for better performance
 */

import { AuditLogger } from '@/lib/api/services/audit';
import { createAppLogger } from './factory';

// Define LogData locally for audit optimizer
type LogData = Record<string, unknown>;

// Audit data interfaces for better type safety
interface BaseAuditData extends LogData {
  userId?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  [key: string]: unknown;
}

// Specific audit data types matching the AuditLogger method signatures
interface AuthAuditData extends BaseAuditData {
  action: 'login' | 'logout' | 'login_failed' | 'password_reset' | 'account_locked';
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

interface UserActionAuditData extends BaseAuditData {
  action: string;
  userId: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

interface SystemAuditData extends BaseAuditData {
  action: string;
  metadata?: Record<string, unknown>;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

interface SecurityAuditData extends BaseAuditData {
  action: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

interface DataChangeAuditData extends BaseAuditData {
  action: 'create' | 'update' | 'delete';
  userId: string;
  resourceType: string;
  resourceId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

type AuditData =
  | AuthAuditData
  | UserActionAuditData
  | SystemAuditData
  | SecurityAuditData
  | DataChangeAuditData;

// Lazy audit logger creation to prevent initialization issues
let auditLogger: ReturnType<typeof createAppLogger> | null = null;

function getAuditLogger(): ReturnType<typeof createAppLogger> {
  if (!auditLogger) {
    try {
      auditLogger = createAppLogger('audit');
    } catch (error) {
      // Fallback to console logger if universal logger fails
      auditLogger = {
        info: (message: string, data?: Record<string, unknown>) =>
          console.log(`[AUDIT] ${message}`, data),
        warn: (message: string, data?: Record<string, unknown>) =>
          console.warn(`[AUDIT] ${message}`, data),
        error: (message: string, error?: Error, data?: Record<string, unknown>) =>
          console.error(`[AUDIT] ${message}`, error, data),
        debug: (message: string, data?: Record<string, unknown>) =>
          console.debug(`[AUDIT] ${message}`, data),
        // Context management methods
        child: (context: Record<string, unknown>, module?: string) =>
          auditLogger as ReturnType<typeof createAppLogger>,
        withRequest: (request: Request | { headers: Headers; url: string; method: string }) =>
          auditLogger as ReturnType<typeof createAppLogger>,
        withUser: (userId: string, organizationId?: string) =>
          auditLogger as ReturnType<typeof createAppLogger>,
        // Specialized logging methods (fallback implementations)
        timing: (message: string, startTime: number, data?: Record<string, unknown>) =>
          console.log(`[AUDIT:TIMING] ${message} (${Date.now() - startTime}ms)`, data),
        http: (
          message: string,
          statusCode: number,
          duration?: number,
          data?: Record<string, unknown>
        ) =>
          console.log(
            `[AUDIT:HTTP] ${message} ${statusCode}${duration ? ` (${duration}ms)` : ''}`,
            data
          ),
        db: (operation: string, table: string, duration?: number, data?: Record<string, unknown>) =>
          console.log(
            `[AUDIT:DB] ${operation} on ${table}${duration ? ` (${duration}ms)` : ''}`,
            data
          ),
        auth: (action: string, success: boolean, data?: Record<string, unknown>) =>
          console.log(`[AUDIT:AUTH] ${action} ${success ? 'SUCCESS' : 'FAILED'}`, data),
        security: (
          event: string,
          severity: 'low' | 'medium' | 'high' | 'critical',
          data?: Record<string, unknown>
        ) => console.warn(`[AUDIT:SECURITY:${severity.toUpperCase()}] ${event}`, data),
      };
    }
  }
  if (!auditLogger) {
    throw new Error('Audit logger initialization failed');
  }
  return auditLogger;
}

interface BufferedAuditEntry {
  type: 'auth' | 'user_action' | 'system' | 'security' | 'data_change';
  data: AuditData;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
}

/**
 * Optimized Audit Logger with Buffering
 */
class OptimizedAuditLogger {
  private buffer: BufferedAuditEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly bufferSize = 50; // Flush when buffer reaches this size
  private readonly flushIntervalMs = 5000; // Flush every 5 seconds

  constructor() {
    this.startFlushTimer();
  }

  /**
   * Log audit event with intelligent buffering
   */
  async logEvent(
    type: BufferedAuditEntry['type'],
    data: AuditData,
    severity: BufferedAuditEntry['severity']
  ): Promise<void> {
    const entry: BufferedAuditEntry = {
      type,
      data,
      severity,
      timestamp: new Date(),
    };

    // Always log to Winston immediately
    getAuditLogger().info(`Audit event: ${type}/${data.action}`, {
      type,
      severity,
      userId: data.userId,
      action: data.action,
    });

    // Critical events bypass buffering
    if (severity === 'critical') {
      await this.flushImmediately(entry);
      return;
    }

    // High severity events have shorter buffer time
    if (severity === 'high') {
      this.buffer.push(entry);
      if (this.buffer.length >= Math.floor(this.bufferSize / 2)) {
        await this.flushBuffer();
      }
      return;
    }

    // Medium and low severity events use full buffering
    this.buffer.push(entry);
    if (this.buffer.length >= this.bufferSize) {
      await this.flushBuffer();
    }
  }

  /**
   * Flush single critical event immediately
   */
  private async flushImmediately(entry: BufferedAuditEntry): Promise<void> {
    try {
      await this.processAuditEntry(entry);
      getAuditLogger().debug('Critical audit event flushed immediately', {
        type: entry.type,
        severity: entry.severity,
      });
    } catch (error) {
      getAuditLogger().error('Failed to flush critical audit event', error, {
        type: entry.type,
        severity: entry.severity,
      });
    }
  }

  /**
   * Flush buffered events to database
   */
  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entriesToFlush = [...this.buffer];
    this.buffer = [];

    try {
      const startTime = Date.now();

      // Process all buffered entries
      await Promise.all(entriesToFlush.map((entry) => this.processAuditEntry(entry)));

      const duration = Date.now() - startTime;
      getAuditLogger().info('Audit buffer flushed successfully', {
        entriesCount: entriesToFlush.length,
        duration,
        avgTimePerEntry: Math.round(duration / entriesToFlush.length),
      });
    } catch (error) {
      getAuditLogger().error('Failed to flush audit buffer', error, {
        entriesCount: entriesToFlush.length,
        lostEntries: entriesToFlush.map((e) => ({ type: e.type, severity: e.severity })),
      });

      // Re-add critical and high severity entries back to buffer for retry
      const criticalEntries = entriesToFlush.filter(
        (e) => e.severity === 'critical' || e.severity === 'high'
      );
      this.buffer.unshift(...criticalEntries);
    }
  }

  /**
   * Process individual audit entry
   */
  private async processAuditEntry(entry: BufferedAuditEntry): Promise<void> {
    switch (entry.type) {
      case 'auth':
        await AuditLogger.logAuth(entry.data as AuthAuditData);
        break;
      case 'user_action':
        await AuditLogger.logUserAction(entry.data as UserActionAuditData);
        break;
      case 'system':
        await AuditLogger.logSystem(entry.data as SystemAuditData);
        break;
      case 'security':
        await AuditLogger.logSecurity(entry.data as SecurityAuditData);
        break;
      case 'data_change':
        await AuditLogger.logDataChange(entry.data as DataChangeAuditData);
        break;
      default:
        getAuditLogger().warn('Unknown audit entry type', { type: entry.type });
    }
  }

  /**
   * Start automatic flush timer
   */
  private startFlushTimer(): void {
    this.flushInterval = setInterval(() => {
      void this.flushBuffer();
    }, this.flushIntervalMs);

    getAuditLogger().debug('Audit buffer flush timer started', {
      intervalMs: this.flushIntervalMs,
      bufferSize: this.bufferSize,
    });
  }

  /**
   * Stop flush timer and flush remaining entries
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush any remaining entries
    await this.flushBuffer();

    getAuditLogger().info('Optimized audit logger shutdown complete');
  }

  /**
   * Get buffer status for monitoring
   */
  getBufferStatus(): {
    bufferSize: number;
    bufferCapacity: number;
    oldestEntry?: Date;
    newestEntry?: Date;
  } {
    const result: {
      bufferSize: number;
      bufferCapacity: number;
      oldestEntry?: Date;
      newestEntry?: Date;
    } = {
      bufferSize: this.buffer.length,
      bufferCapacity: this.bufferSize,
    };

    if (this.buffer.length > 0) {
      const oldestTimestamp = this.buffer[0]?.timestamp;
      const newestTimestamp = this.buffer[this.buffer.length - 1]?.timestamp;
      if (oldestTimestamp) result.oldestEntry = oldestTimestamp;
      if (newestTimestamp) result.newestEntry = newestTimestamp;
    }

    return result;
  }

  /**
   * Public method to flush buffer on demand
   */
  async flush(): Promise<void> {
    await this.flushBuffer();
  }
}

// Singleton instance - lazy initialization to prevent startup issues
let optimizedAuditLoggerInstance: OptimizedAuditLogger | null = null;

function getOptimizedAuditLogger(): OptimizedAuditLogger {
  if (!optimizedAuditLoggerInstance) {
    optimizedAuditLoggerInstance = new OptimizedAuditLogger();
  }
  return optimizedAuditLoggerInstance;
}

/**
 * Enhanced audit logging functions with buffering
 */
export const BufferedAuditLogger = {
  logAuth: (data: AuditData) =>
    getOptimizedAuditLogger().logEvent('auth', data, data.severity || 'medium'),
  logUserAction: (data: AuditData) =>
    getOptimizedAuditLogger().logEvent('user_action', data, data.severity || 'low'),
  logSystem: (data: AuditData) =>
    getOptimizedAuditLogger().logEvent('system', data, data.severity || 'medium'),
  logSecurity: (data: AuditData) =>
    getOptimizedAuditLogger().logEvent('security', data, data.severity || 'high'),
  logDataChange: (data: AuditData) =>
    getOptimizedAuditLogger().logEvent('data_change', data, data.severity || 'low'),

  // Utility functions
  getBufferStatus: () => getOptimizedAuditLogger().getBufferStatus(),
  flushNow: () => getOptimizedAuditLogger().flush(),
  shutdown: () => getOptimizedAuditLogger().shutdown(),
};

// Graceful shutdown handling
process.on('SIGTERM', () => {
  void getOptimizedAuditLogger().shutdown();
});

process.on('SIGINT', () => {
  void getOptimizedAuditLogger().shutdown();
});

export default BufferedAuditLogger;
