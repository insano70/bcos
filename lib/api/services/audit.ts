import { nanoid } from 'nanoid';
import { audit_logs, db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createAppLogger } from '@/lib/logger/factory';

/**
 * Audit Logging Service
 * Tracks security events, user actions, and system changes for compliance
 */

export interface AuditLogEntry {
  id?: string;
  event_type: 'auth' | 'user_action' | 'system' | 'security' | 'data_change';
  action: string;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  resource_type?: string;
  resource_id?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp?: Date;
}

class AuditLoggerService {
  private universalLogger = createAppLogger('audit-service', {
    component: 'audit-system',
    feature: 'compliance-logging',
  });
  /**
   * Log authentication events
   */
  async logAuth(data: {
    action: 'login' | 'logout' | 'login_failed' | 'password_reset' | 'account_locked';
    userId?: string;
    email?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const severity =
      data.action === 'login_failed' || data.action === 'account_locked' ? 'high' : 'medium';

    // Enhanced audit logging with universal logger - permanently enabled
    this.universalLogger.auth(
      data.action,
      data.action !== 'login_failed' && data.action !== 'account_locked',
      {
        userId: data.userId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        email: data.email,
        ...data.metadata,
      }
    );

    // Business intelligence for audit operations
    this.universalLogger.info('Audit event processed', {
      eventType: 'auth',
      action: data.action,
      severity,
      complianceFramework: 'HIPAA',
      retentionPeriod: '7_years',
    });

    // Always maintain database audit trail for compliance
    await this.log({
      event_type: 'auth',
      action: data.action,
      user_id: data.userId || '',
      ip_address: data.ipAddress || '',
      user_agent: data.userAgent || '',
      metadata: {
        email: data.email,
        ...data.metadata,
      },
      severity,
    });
  }

  /**
   * Log user actions
   */
  async logUserAction(data: {
    action: string;
    userId: string;
    resourceType?: string;
    resourceId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    // Enhanced user action logging - permanently enabled
    this.universalLogger.info('User action audit', {
      action: data.action,
      userId: data.userId,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      complianceFramework: 'HIPAA',
      dataClassification: 'audit_trail',
      retentionPeriod: '7_years',
      ...data.metadata,
    });

    // Business intelligence for user behavior
    this.universalLogger.debug('User behavior analytics', {
      userActionType: data.action,
      resourceAccessed: data.resourceType,
      sessionMetadata: data.metadata,
    });

    // Always maintain database audit trail for compliance
    await this.log({
      event_type: 'user_action',
      action: data.action,
      user_id: data.userId,
      resource_type: data.resourceType || '',
      resource_id: data.resourceId || '',
      ip_address: data.ipAddress || '',
      user_agent: data.userAgent || '',
      metadata: data.metadata || {},
      severity: 'low',
    });
  }

  /**
   * Log data changes (CRUD operations)
   */
  async logDataChange(data: {
    action: 'create' | 'update' | 'delete';
    userId: string;
    resourceType: string;
    resourceId: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      event_type: 'data_change',
      action: data.action,
      user_id: data.userId,
      resource_type: data.resourceType,
      resource_id: data.resourceId,
      old_values: data.oldValues || {},
      new_values: data.newValues || {},
      ip_address: data.ipAddress || '',
      user_agent: data.userAgent || '',
      metadata: data.metadata || {},
      severity: data.action === 'delete' ? 'medium' : 'low',
    });
  }

  /**
   * Log security events
   */
  async logSecurity(data: {
    action: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
    severity?: 'low' | 'medium' | 'high' | 'critical';
  }): Promise<void> {
    await this.log({
      event_type: 'security',
      action: data.action,
      user_id: data.userId || '',
      ip_address: data.ipAddress || '',
      user_agent: data.userAgent || '',
      metadata: data.metadata || {},
      severity: data.severity || 'high',
    });
  }

  /**
   * Log system events
   */
  async logSystem(data: {
    action: string;
    metadata?: Record<string, unknown>;
    severity?: 'low' | 'medium' | 'high' | 'critical';
  }): Promise<void> {
    await this.log({
      event_type: 'system',
      action: data.action,
      metadata: data.metadata || {},
      severity: data.severity || 'medium',
    });
  }

  /**
   * Core logging method
   */
  private async log(entry: AuditLogEntry): Promise<void> {
    try {
      const logEntry = {
        audit_log_id: nanoid(),
        event_type: entry.event_type,
        action: entry.action,
        user_id: entry.user_id || null,
        ip_address: entry.ip_address || null,
        user_agent: entry.user_agent || null,
        resource_type: entry.resource_type || null,
        resource_id: entry.resource_id || null,
        old_values: entry.old_values ? JSON.stringify(entry.old_values) : null,
        new_values: entry.new_values ? JSON.stringify(entry.new_values) : null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        severity: entry.severity,
        created_at: new Date(),
      };

      await db.insert(audit_logs).values(logEntry);

      // For critical events, also send system notifications
      if (entry.severity === 'critical') {
        await this.sendCriticalAlert(entry);
      }

      logger.debug('Audit log created', {
        eventType: entry.event_type,
        action: entry.action,
        userId: entry.user_id,
        severity: entry.severity,
        operation: 'createAuditLog',
      });
    } catch (error) {
      // Never let audit logging failures break the main application
      logger.error('Audit logging failed', {
        eventType: entry.event_type,
        action: entry.action,
        userId: entry.user_id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        operation: 'createAuditLog',
      });
    }
  }

  /**
   * Send critical alerts to system administrators
   */
  private async sendCriticalAlert(entry: AuditLogEntry): Promise<void> {
    try {
      // Dynamic import to avoid circular dependencies
      const { EmailService } = await import('./email');

      await EmailService.sendSystemNotification(
        `Critical Security Event: ${entry.action}`,
        `A critical security event has been detected in the system.`,
        {
          eventType: entry.event_type,
          action: entry.action,
          userId: entry.user_id,
          ipAddress: entry.ip_address,
          timestamp: new Date().toISOString(),
          metadata: entry.metadata,
        }
      );
    } catch (error) {
      logger.error('Failed to send critical alert', {
        eventType: entry.event_type,
        action: entry.action,
        severity: entry.severity,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        operation: 'sendCriticalAlert',
      });
    }
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async getLogs(_options: {
    eventType?: string;
    userId?: string;
    resourceType?: string;
    severity?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    try {
      // This would be implemented with proper Drizzle queries
      // For now, return a placeholder structure
      return {
        logs: [],
        total: 0,
        hasMore: false,
      };
    } catch (error) {
      logger.error('Failed to retrieve audit logs', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        operation: 'getAuditLogs',
      });
      throw error;
    }
  }

  /**
   * Extract request information for logging
   */
  extractRequestInfo(request: Request): {
    ipAddress: string;
    userAgent: string;
  } {
    return {
      ipAddress:
        request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    };
  }
}

export const AuditLogger = new AuditLoggerService();
