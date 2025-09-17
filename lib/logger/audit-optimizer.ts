/**
 * Audit Logging Optimizer
 * Buffers non-critical audit events for better performance
 */

import { AuditLogger } from '@/lib/api/services/audit'
import { createAppLogger } from './winston-logger'

const auditLogger = createAppLogger('audit')

interface BufferedAuditEntry {
  type: 'auth' | 'user_action' | 'system' | 'security' | 'data_change'
  data: any
  severity: 'low' | 'medium' | 'high' | 'critical'
  timestamp: Date
}

/**
 * Optimized Audit Logger with Buffering
 */
class OptimizedAuditLogger {
  private buffer: BufferedAuditEntry[] = []
  private flushInterval: NodeJS.Timeout | null = null
  private readonly bufferSize = 50 // Flush when buffer reaches this size
  private readonly flushIntervalMs = 5000 // Flush every 5 seconds

  constructor() {
    this.startFlushTimer()
  }

  /**
   * Log audit event with intelligent buffering
   */
  async logEvent(
    type: BufferedAuditEntry['type'],
    data: any,
    severity: BufferedAuditEntry['severity']
  ): Promise<void> {
    const entry: BufferedAuditEntry = {
      type,
      data,
      severity,
      timestamp: new Date()
    }

    // Always log to Winston immediately
    auditLogger.info(`Audit event: ${type}/${data.action}`, {
      type,
      severity,
      userId: data.userId,
      action: data.action
    })

    // Critical events bypass buffering
    if (severity === 'critical') {
      await this.flushImmediately(entry)
      return
    }

    // High severity events have shorter buffer time
    if (severity === 'high') {
      this.buffer.push(entry)
      if (this.buffer.length >= Math.floor(this.bufferSize / 2)) {
        await this.flushBuffer()
      }
      return
    }

    // Medium and low severity events use full buffering
    this.buffer.push(entry)
    if (this.buffer.length >= this.bufferSize) {
      await this.flushBuffer()
    }
  }

  /**
   * Flush single critical event immediately
   */
  private async flushImmediately(entry: BufferedAuditEntry): Promise<void> {
    try {
      await this.processAuditEntry(entry)
      auditLogger.debug('Critical audit event flushed immediately', {
        type: entry.type,
        severity: entry.severity
      })
    } catch (error) {
      auditLogger.error('Failed to flush critical audit event', error, {
        type: entry.type,
        severity: entry.severity
      })
    }
  }

  /**
   * Flush buffered events to database
   */
  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return

    const entriesToFlush = [...this.buffer]
    this.buffer = []

    try {
      const startTime = Date.now()
      
      // Process all buffered entries
      await Promise.all(
        entriesToFlush.map(entry => this.processAuditEntry(entry))
      )

      const duration = Date.now() - startTime
      auditLogger.info('Audit buffer flushed successfully', {
        entriesCount: entriesToFlush.length,
        duration,
        avgTimePerEntry: Math.round(duration / entriesToFlush.length)
      })

    } catch (error) {
      auditLogger.error('Failed to flush audit buffer', error, {
        entriesCount: entriesToFlush.length,
        lostEntries: entriesToFlush.map(e => ({ type: e.type, severity: e.severity }))
      })

      // Re-add critical and high severity entries back to buffer for retry
      const criticalEntries = entriesToFlush.filter(e => 
        e.severity === 'critical' || e.severity === 'high'
      )
      this.buffer.unshift(...criticalEntries)
    }
  }

  /**
   * Process individual audit entry
   */
  private async processAuditEntry(entry: BufferedAuditEntry): Promise<void> {
    switch (entry.type) {
      case 'auth':
        await AuditLogger.logAuth(entry.data)
        break
      case 'user_action':
        await AuditLogger.logUserAction(entry.data)
        break
      case 'system':
        await AuditLogger.logSystem(entry.data)
        break
      case 'security':
        await AuditLogger.logSecurity(entry.data)
        break
      case 'data_change':
        await AuditLogger.logDataChange(entry.data)
        break
      default:
        auditLogger.warn('Unknown audit entry type', { type: entry.type })
    }
  }

  /**
   * Start automatic flush timer
   */
  private startFlushTimer(): void {
    this.flushInterval = setInterval(() => {
      void this.flushBuffer()
    }, this.flushIntervalMs)

    auditLogger.debug('Audit buffer flush timer started', {
      intervalMs: this.flushIntervalMs,
      bufferSize: this.bufferSize
    })
  }

  /**
   * Stop flush timer and flush remaining entries
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }

    // Flush any remaining entries
    await this.flushBuffer()
    
    auditLogger.info('Optimized audit logger shutdown complete')
  }

  /**
   * Get buffer status for monitoring
   */
  getBufferStatus(): {
    bufferSize: number
    bufferCapacity: number
    oldestEntry?: Date
    newestEntry?: Date
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
}

// Singleton instance
const optimizedAuditLogger = new OptimizedAuditLogger()

/**
 * Enhanced audit logging functions with buffering
 */
export const BufferedAuditLogger = {
  logAuth: (data: any) => optimizedAuditLogger.logEvent('auth', data, data.severity || 'medium'),
  logUserAction: (data: any) => optimizedAuditLogger.logEvent('user_action', data, data.severity || 'low'),
  logSystem: (data: any) => optimizedAuditLogger.logEvent('system', data, data.severity || 'medium'),
  logSecurity: (data: any) => optimizedAuditLogger.logEvent('security', data, data.severity || 'high'),
  logDataChange: (data: any) => optimizedAuditLogger.logEvent('data_change', data, data.severity || 'low'),
  
  // Utility functions
  getBufferStatus: () => optimizedAuditLogger.getBufferStatus(),
  flushNow: () => optimizedAuditLogger['flushBuffer'](),
  shutdown: () => optimizedAuditLogger.shutdown()
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
  void optimizedAuditLogger.shutdown()
})

process.on('SIGINT', () => {
  void optimizedAuditLogger.shutdown()
})

export default BufferedAuditLogger
