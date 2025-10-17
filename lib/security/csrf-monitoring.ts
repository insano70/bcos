/**
 * CSRF Security Monitoring and Alerting (Database-Backed)
 * Tracks CSRF validation failures and triggers alerts for suspicious activity
 * Refactored from static class to instance-based with database persistence
 */

import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { csrf_failure_events, type NewCSRFFailureEvent } from '@/lib/db/csrf-schema';
import { log } from '@/lib/logger';

/**
 * CSRF failure event severity levels
 */
export type CSRFSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * CSRF failure event data
 */
export interface CSRFFailureEvent {
  timestamp: Date;
  ip: string;
  userAgent: string;
  pathname: string;
  reason: string;
  severity: CSRFSeverity;
  userId?: string | undefined;
}

/**
 * Security alert data
 */
interface SecurityAlert {
  type: 'csrf_failure_threshold' | 'csrf_attack_pattern' | 'csrf_anomaly';
  severity: CSRFSeverity;
  message: string;
  eventCount: number;
  metadata: Record<string, unknown>;
  timestamp: number;
}

/**
 * Failure statistics
 */
export interface FailureStats {
  totalIPs: number;
  totalEvents: number;
  recentEvents: number;
  topIPs: Array<{ ip: string; count: number; latestFailure: Date }>;
}

/**
 * CSRF Security Monitor (Database-Backed)
 * Instance-based class that persists events to PostgreSQL
 */
export class CSRFSecurityMonitor {
  constructor(private db: typeof import('@/lib/db').db) {}

  /**
   * Record a CSRF validation failure
   */
  async recordFailure(
    request: NextRequest,
    reason: string,
    severity: CSRFSeverity = 'medium',
    userId?: string
  ): Promise<void> {
    try {
      const ip = this.extractIP(request);
      const userAgent = request.headers.get('user-agent') || 'unknown';
      const pathname = request.nextUrl.pathname;

      const timestamp = new Date();
      const event: NewCSRFFailureEvent = {
        timestamp,
        ip_address: ip,
        user_agent: userAgent.substring(0, 500), // Reasonable limit for TEXT field
        pathname,
        reason,
        severity,
        user_id: userId,
      };

      // Insert event into database
      await this.db.insert(csrf_failure_events).values(event);

      // Log the failure
      this.logFailure({
        timestamp,
        ip,
        userAgent,
        pathname,
        reason,
        severity,
        userId,
      });

      // Check for alert conditions (async - don't block)
      this.checkAlertConditions(ip).catch((error) => {
        log.error('csrf alert condition check failed', error, {
          ip,
          component: 'security',
          operation: 'csrf_alert_check',
        });
      });
    } catch (error) {
      // Don't throw - monitoring failures shouldn't break the app
      log.error('failed to record csrf failure', error, {
        pathname: request.nextUrl.pathname,
        reason,
        component: 'security',
        operation: 'record_csrf_failure',
      });
    }
  }

  /**
   * Extract IP address from request
   */
  private extractIP(request: NextRequest): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      const firstIP = forwardedFor.split(',')[0];
      return firstIP ? firstIP.trim() : 'unknown';
    }

    return request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || 'unknown';
  }

  /**
   * Log CSRF failure with appropriate severity
   */
  private logFailure(event: CSRFFailureEvent): void {
    // Security logging for CSRF validation failures
    log.security('csrf_validation_failure', event.severity, {
      ip: event.ip,
      pathname: event.pathname,
      reason: event.reason,
      userAgent: event.userAgent.substring(0, 100),
      userId: event.userId,
      timestamp: event.timestamp.toISOString(),
      component: 'security',
    });
  }

  /**
   * Check for alert conditions and trigger alerts if necessary
   */
  private async checkAlertConditions(ip: string): Promise<void> {
    const now = new Date();
    const oneHour = new Date(now.getTime() - 60 * 60 * 1000);
    const fiveMinutes = new Date(now.getTime() - 5 * 60 * 1000);
    const oneMinute = new Date(now.getTime() - 60 * 1000);

    try {
      // Get recent event counts for this IP
      const [lastMinute, lastFiveMinutes, lastHour] = await Promise.all([
        this.db
          .select({ count: count() })
          .from(csrf_failure_events)
          .where(
            and(
              eq(csrf_failure_events.ip_address, ip),
              gt(csrf_failure_events.timestamp, oneMinute)
            )
          )
          .then((r) => r[0]?.count || 0),

        this.db
          .select({ count: count() })
          .from(csrf_failure_events)
          .where(
            and(
              eq(csrf_failure_events.ip_address, ip),
              gt(csrf_failure_events.timestamp, fiveMinutes)
            )
          )
          .then((r) => r[0]?.count || 0),

        this.db
          .select({ count: count() })
          .from(csrf_failure_events)
          .where(
            and(eq(csrf_failure_events.ip_address, ip), gt(csrf_failure_events.timestamp, oneHour))
          )
          .then((r) => r[0]?.count || 0),
      ]);

      // Alert Condition 1: High frequency of failures from single IP
      if (lastMinute >= 10) {
        await this.sendAlert({
          type: 'csrf_attack_pattern',
          severity: 'critical',
          message: `${lastMinute} CSRF failures from IP ${ip} in the last minute - possible attack`,
          eventCount: lastMinute,
          metadata: { ip, window: '1minute', count: lastMinute },
          timestamp: now.getTime(),
        });
      } else if (lastFiveMinutes >= 20) {
        await this.sendAlert({
          type: 'csrf_failure_threshold',
          severity: 'high',
          message: `${lastFiveMinutes} CSRF failures from IP ${ip} in 5 minutes - investigate`,
          eventCount: lastFiveMinutes,
          metadata: { ip, window: '5minutes', count: lastFiveMinutes },
          timestamp: now.getTime(),
        });
      } else if (lastHour >= 50) {
        await this.sendAlert({
          type: 'csrf_failure_threshold',
          severity: 'medium',
          message: `${lastHour} CSRF failures from IP ${ip} in the last hour`,
          eventCount: lastHour,
          metadata: { ip, window: '1hour', count: lastHour },
          timestamp: now.getTime(),
        });
      }

      // Alert Condition 2: Multiple endpoints from same IP
      const uniqueEndpoints = await this.db
        .selectDistinct({ pathname: csrf_failure_events.pathname })
        .from(csrf_failure_events)
        .where(
          and(
            eq(csrf_failure_events.ip_address, ip),
            gt(csrf_failure_events.timestamp, fiveMinutes)
          )
        );

      if (uniqueEndpoints.length >= 5 && lastFiveMinutes >= 10) {
        await this.sendAlert({
          type: 'csrf_attack_pattern',
          severity: 'high',
          message: `CSRF failures across ${uniqueEndpoints.length} endpoints from IP ${ip} - possible scanning`,
          eventCount: lastFiveMinutes,
          metadata: {
            ip,
            endpoints: uniqueEndpoints.map((e) => e.pathname),
            endpointCount: uniqueEndpoints.length,
            totalFailures: lastFiveMinutes,
          },
          timestamp: now.getTime(),
        });
      }

      // Alert Condition 3: Anomalous patterns (mixed token types)
      const recentEvents = await this.db
        .select({ reason: csrf_failure_events.reason })
        .from(csrf_failure_events)
        .where(
          and(
            eq(csrf_failure_events.ip_address, ip),
            gt(csrf_failure_events.timestamp, fiveMinutes)
          )
        )
        .limit(100);

      const anonymousFailures = recentEvents.filter((e) => e.reason.includes('anonymous')).length;
      const authenticatedFailures = recentEvents.filter((e) =>
        e.reason.includes('authenticated')
      ).length;

      if (anonymousFailures >= 5 && authenticatedFailures >= 5) {
        await this.sendAlert({
          type: 'csrf_anomaly',
          severity: 'medium',
          message: `Mixed anonymous and authenticated CSRF failures from IP ${ip} - unusual pattern`,
          eventCount: recentEvents.length,
          metadata: {
            ip,
            anonymousCount: anonymousFailures,
            authenticatedCount: authenticatedFailures,
          },
          timestamp: now.getTime(),
        });
      }
    } catch (error) {
      log.error('failed to check csrf alert conditions', error, {
        ip,
        component: 'security',
        operation: 'check_alert_conditions',
      });
    }
  }

  /**
   * Send security alert
   */
  private async sendAlert(alert: SecurityAlert): Promise<void> {
    const isDevelopment = process.env.NODE_ENV === 'development';

    // Security logging for alerts
    log.security('csrf_security_alert', alert.severity, {
      type: alert.type,
      message: alert.message,
      eventCount: alert.eventCount,
      metadata: alert.metadata,
      timestamp: new Date(alert.timestamp).toISOString(),
      component: 'security',
      blocked: true,
    });

    // In production, send to monitoring service
    if (!isDevelopment) {
      try {
        await this.sendToMonitoringService(alert);
      } catch (error) {
        log.error('failed to send csrf alert to monitoring service', error, {
          alertType: alert.type,
          severity: alert.severity,
          component: 'security',
          operation: 'send_alert',
        });
      }
    }
  }

  /**
   * Send alert to external monitoring service
   */
  private async sendToMonitoringService(alert: SecurityAlert): Promise<void> {
    const webhookUrl = process.env.SECURITY_ALERT_WEBHOOK_URL;
    if (!webhookUrl) {
      return; // No monitoring webhook configured
    }

    const payload = {
      source: 'csrf-monitor',
      alert_type: alert.type,
      severity: alert.severity,
      message: alert.message,
      event_count: alert.eventCount,
      metadata: alert.metadata,
      timestamp: alert.timestamp,
      environment: process.env.NODE_ENV || 'unknown',
      service: 'bcos-api',
    };

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'BCOS-CSRF-Monitor/1.0',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // Don't throw - monitoring failures shouldn't break the app
      log.error('failed to send security alert to webhook', error, {
        component: 'security',
        operation: 'send_webhook_alert',
      });
    }
  }

  /**
   * Get current failure statistics
   */
  async getFailureStats(): Promise<FailureStats> {
    try {
      const now = new Date();
      const oneHour = new Date(now.getTime() - 60 * 60 * 1000);

      // Get total unique IPs
      const uniqueIPs = await this.db
        .selectDistinct({ ip: csrf_failure_events.ip_address })
        .from(csrf_failure_events);

      // Get total event count
      const totalEventsResult = await this.db.select({ count: count() }).from(csrf_failure_events);

      // Get recent event count (last hour)
      const recentEventsResult = await this.db
        .select({ count: count() })
        .from(csrf_failure_events)
        .where(gt(csrf_failure_events.timestamp, oneHour));

      // Get top IPs by failure count
      const topIPs = await this.db
        .select({
          ip: csrf_failure_events.ip_address,
          count: sql<number>`count(*)`,
          latestFailure: sql<Date>`max(${csrf_failure_events.timestamp})`,
        })
        .from(csrf_failure_events)
        .groupBy(csrf_failure_events.ip_address)
        .orderBy(desc(sql`count(*)`))
        .limit(10);

      return {
        totalIPs: uniqueIPs.length,
        totalEvents: totalEventsResult[0]?.count || 0,
        recentEvents: recentEventsResult[0]?.count || 0,
        topIPs: topIPs.map((row) => ({
          ip: row.ip,
          count: Number(row.count),
          latestFailure: row.latestFailure,
        })),
      };
    } catch (error) {
      log.error('failed to get csrf failure stats', error, {
        component: 'security',
        operation: 'get_failure_stats',
      });

      // Return empty stats on error
      return {
        totalIPs: 0,
        totalEvents: 0,
        recentEvents: 0,
        topIPs: [],
      };
    }
  }

  /**
   * Clean up old events (older than specified retention period)
   */
  async cleanupOldEvents(retentionHours: number = 24): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);

      const result = await this.db
        .delete(csrf_failure_events)
        .where(sql`${csrf_failure_events.timestamp} < ${cutoff}`)
        .returning({ id: csrf_failure_events.event_id });

      const deletedCount = result.length;

      log.info('csrf events cleanup completed', {
        deletedCount,
        retentionHours,
        cutoffDate: cutoff.toISOString(),
        component: 'security',
        operation: 'cleanup_old_events',
      });

      return deletedCount;
    } catch (error) {
      log.error('failed to cleanup old csrf events', error, {
        retentionHours,
        component: 'security',
        operation: 'cleanup_old_events',
      });
      return 0;
    }
  }

  /**
   * Clear all failure data (for testing or reset)
   */
  async clearAllEvents(): Promise<number> {
    try {
      const result = await this.db
        .delete(csrf_failure_events)
        .returning({ id: csrf_failure_events.event_id });

      log.warn('all csrf events cleared', {
        deletedCount: result.length,
        component: 'security',
        operation: 'clear_all_events',
      });

      return result.length;
    } catch (error) {
      log.error('failed to clear csrf events', error, {
        component: 'security',
        operation: 'clear_all_events',
      });
      return 0;
    }
  }
}
