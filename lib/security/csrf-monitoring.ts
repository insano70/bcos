/**
 * CSRF Security Monitoring and Alerting
 * Tracks CSRF validation failures and triggers alerts for suspicious activity
 */

import type { NextRequest } from 'next/server';

// Edge Runtime compatible logger interface
interface EdgeLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Create Edge Runtime compatible logger
 * Falls back to console logging in Edge Runtime where winston is not available
 */
function createEdgeLogger(): EdgeLogger {
  // Detect if we're in Edge Runtime
  const isEdgeRuntime = typeof process === 'undefined' || 
                       (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime !== undefined ||
                       typeof process.nextTick === 'undefined';
  
  if (isEdgeRuntime) {
    // Edge Runtime compatible console logger
    return {
      info: (message: string, meta?: Record<string, unknown>) => {
        console.log('[CSRF-MONITOR]', message, meta ? JSON.stringify(meta) : '');
      },
      warn: (message: string, meta?: Record<string, unknown>) => {
        console.warn('[CSRF-MONITOR]', message, meta ? JSON.stringify(meta) : '');
      },
      error: (message: string, meta?: Record<string, unknown>) => {
        console.error('[CSRF-MONITOR]', message, meta ? JSON.stringify(meta) : '');
      },
      debug: (message: string, meta?: Record<string, unknown>) => {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[CSRF-MONITOR]', message, meta ? JSON.stringify(meta) : '');
        }
      },
    };
  } else {
    // Node.js runtime - use full logger (lazy loaded to avoid Edge Runtime issues)
    try {
      const { createAPILogger } = require('@/lib/logger');
      const mockRequest = {
        url: 'http://localhost:3000/security/csrf',
        headers: new Headers(),
        nextUrl: { pathname: '/security/csrf' }
      } as NextRequest;
      const fullLogger = createAPILogger(mockRequest);
      
      return {
        info: (message: string, meta?: Record<string, unknown>) => fullLogger.info(message, meta),
        warn: (message: string, meta?: Record<string, unknown>) => fullLogger.warn(message, meta),
        error: (message: string, meta?: Record<string, unknown>) => fullLogger.error(message, meta),
        debug: (message: string, meta?: Record<string, unknown>) => fullLogger.debug(message, meta),
      };
    } catch (error) {
      // Fallback to console if logger import fails
      return {
        info: (message: string, meta?: Record<string, unknown>) => {
          console.log('[CSRF-MONITOR]', message, meta ? JSON.stringify(meta) : '');
        },
        warn: (message: string, meta?: Record<string, unknown>) => {
          console.warn('[CSRF-MONITOR]', message, meta ? JSON.stringify(meta) : '');
        },
        error: (message: string, meta?: Record<string, unknown>) => {
          console.error('[CSRF-MONITOR]', message, meta ? JSON.stringify(meta) : '');
        },
        debug: (message: string, meta?: Record<string, unknown>) => {
          if (process.env.NODE_ENV === 'development') {
            console.debug('[CSRF-MONITOR]', message, meta ? JSON.stringify(meta) : '');
          }
        },
      };
    }
  }
}

/**
 * CSRF failure event data
 */
interface CSRFFailureEvent {
  timestamp: number;
  ip: string;
  userAgent: string;
  pathname: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId: string | undefined;
}

/**
 * Security alert data
 */
interface SecurityAlert {
  type: 'csrf_failure_threshold' | 'csrf_attack_pattern' | 'csrf_anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  events: CSRFFailureEvent[];
  metadata: Record<string, unknown>;
  timestamp: number;
}

/**
 * CSRF Security Monitor
 * Tracks patterns and anomalies in CSRF validation failures
 */
export class CSRFSecurityMonitor {
  private static failures = new Map<string, CSRFFailureEvent[]>();
  private static readonly MAX_EVENTS_PER_IP = 100;
  private static readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  private static lastCleanup = 0;

  /**
   * Record a CSRF validation failure
   */
  static recordFailure(
    request: NextRequest,
    reason: string,
    severity: CSRFFailureEvent['severity'] = 'medium',
    userId?: string
  ): void {
    const ip = CSRFSecurityMonitor.extractIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const pathname = request.nextUrl.pathname;

    const event: CSRFFailureEvent = {
      timestamp: Date.now(),
      ip,
      userAgent: userAgent.substring(0, 200), // Limit length
      pathname,
      reason,
      severity,
      userId
    };

    // Store event by IP
    if (!CSRFSecurityMonitor.failures.has(ip)) {
      CSRFSecurityMonitor.failures.set(ip, []);
    }

    const ipEvents = CSRFSecurityMonitor.failures.get(ip);
    if (!ipEvents) {
      // This should never happen since we just set it above, but TypeScript safety
      return;
    }

    ipEvents.push(event);

    // Limit events per IP to prevent memory exhaustion
    if (ipEvents.length > CSRFSecurityMonitor.MAX_EVENTS_PER_IP) {
      ipEvents.shift(); // Remove oldest event
    }

    // Log the failure
    CSRFSecurityMonitor.logFailure(event);

    // Check for alert conditions
    CSRFSecurityMonitor.checkAlertConditions(ip, ipEvents);

    // Periodic cleanup
    CSRFSecurityMonitor.cleanupOldEvents();
  }

  /**
   * Extract IP address from request
   */
  private static extractIP(request: NextRequest): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      const firstIP = forwardedFor.split(',')[0];
      return firstIP ? firstIP.trim() : 'unknown';
    }
    
    return request.headers.get('x-real-ip') || 
           request.headers.get('cf-connecting-ip') || 
           'unknown';
  }

  /**
   * Log CSRF failure with appropriate severity
   */
  private static logFailure(event: CSRFFailureEvent): void {
    const logger = createEdgeLogger();

    const logData = {
      event_type: 'csrf_validation_failure',
      ip: event.ip,
      pathname: event.pathname,
      reason: event.reason,
      severity: event.severity,
      user_agent: event.userAgent.substring(0, 100),
      user_id: event.userId,
      timestamp: new Date(event.timestamp).toISOString()
    };

    switch (event.severity) {
      case 'critical':
        logger.error('Critical CSRF validation failure', logData);
        break;
      case 'high':
        logger.error('High severity CSRF validation failure', logData);
        break;
      case 'medium':
        logger.warn('CSRF validation failure', logData);
        break;
      case 'low':
        logger.info('CSRF validation failure', logData);
        break;
    }
  }

  /**
   * Check for alert conditions and trigger alerts if necessary
   */
  private static checkAlertConditions(ip: string, events: CSRFFailureEvent[]): void {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const fiveMinutes = 5 * 60 * 1000;
    const oneMinute = 60 * 1000;

    // Recent events within time windows
    const eventsLastHour = events.filter(e => now - e.timestamp <= oneHour);
    const eventsLast5Minutes = events.filter(e => now - e.timestamp <= fiveMinutes);
    const eventsLastMinute = events.filter(e => now - e.timestamp <= oneMinute);

    // Alert Condition 1: High frequency of failures from single IP
    if (eventsLastMinute.length >= 10) {
      CSRFSecurityMonitor.sendAlert({
        type: 'csrf_attack_pattern',
        severity: 'critical',
        message: `${eventsLastMinute.length} CSRF failures from IP ${ip} in the last minute - possible attack`,
        events: eventsLastMinute,
        metadata: { ip, window: '1minute', count: eventsLastMinute.length },
        timestamp: now
      });
    } else if (eventsLast5Minutes.length >= 20) {
      CSRFSecurityMonitor.sendAlert({
        type: 'csrf_failure_threshold',
        severity: 'high',
        message: `${eventsLast5Minutes.length} CSRF failures from IP ${ip} in 5 minutes - investigate`,
        events: eventsLast5Minutes,
        metadata: { ip, window: '5minutes', count: eventsLast5Minutes.length },
        timestamp: now
      });
    } else if (eventsLastHour.length >= 50) {
      CSRFSecurityMonitor.sendAlert({
        type: 'csrf_failure_threshold',
        severity: 'medium',
        message: `${eventsLastHour.length} CSRF failures from IP ${ip} in the last hour`,
        events: eventsLastHour,
        metadata: { ip, window: '1hour', count: eventsLastHour.length },
        timestamp: now
      });
    }

    // Alert Condition 2: Multiple endpoints from same IP
    const uniqueEndpoints = new Set(eventsLast5Minutes.map(e => e.pathname));
    if (uniqueEndpoints.size >= 5 && eventsLast5Minutes.length >= 10) {
      CSRFSecurityMonitor.sendAlert({
        type: 'csrf_attack_pattern',
        severity: 'high',
        message: `CSRF failures across ${uniqueEndpoints.size} endpoints from IP ${ip} - possible scanning`,
        events: eventsLast5Minutes,
        metadata: { 
          ip, 
          endpoints: Array.from(uniqueEndpoints),
          endpointCount: uniqueEndpoints.size,
          totalFailures: eventsLast5Minutes.length
        },
        timestamp: now
      });
    }

    // Alert Condition 3: Anomalous patterns
    const anonymousFailures = eventsLast5Minutes.filter(e => e.reason.includes('anonymous'));
    const authenticatedFailures = eventsLast5Minutes.filter(e => e.reason.includes('authenticated'));
    
    if (anonymousFailures.length >= 5 && authenticatedFailures.length >= 5) {
      CSRFSecurityMonitor.sendAlert({
        type: 'csrf_anomaly',
        severity: 'medium',
        message: `Mixed anonymous and authenticated CSRF failures from IP ${ip} - unusual pattern`,
        events: eventsLast5Minutes,
        metadata: { 
          ip,
          anonymousCount: anonymousFailures.length,
          authenticatedCount: authenticatedFailures.length
        },
        timestamp: now
      });
    }
  }

  /**
   * Send security alert
   */
  private static async sendAlert(alert: SecurityAlert): Promise<void> {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Always log the alert
    const logger = createEdgeLogger();

    logger.error('CSRF Security Alert', {
      alert_type: alert.type,
      severity: alert.severity,
      message: alert.message,
      event_count: alert.events.length,
      metadata: alert.metadata,
      timestamp: new Date(alert.timestamp).toISOString()
    });

    // In development, also log to console for immediate visibility
    if (isDevelopment) {
      console.error('🚨 CSRF Security Alert:', {
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        eventCount: alert.events.length,
        metadata: alert.metadata
      });
    }

    // In production, send to monitoring service
    if (!isDevelopment) {
      try {
        await CSRFSecurityMonitor.sendToMonitoringService(alert);
      } catch (error) {
        logger.error('Failed to send CSRF alert to monitoring service', { error });
      }
    }
  }

  /**
   * Send alert to external monitoring service
   */
  private static async sendToMonitoringService(alert: SecurityAlert): Promise<void> {
    // This would integrate with your monitoring service (DataDog, New Relic, etc.)
    // For now, we'll create a webhook-style alert that can be configured
    
    const webhookUrl = process.env.SECURITY_ALERT_WEBHOOK_URL;
    if (!webhookUrl) {
      return; // No monitoring webhook configured
    }

    const payload = {
      source: 'csrf-monitor',
      alert_type: alert.type,
      severity: alert.severity,
      message: alert.message,
      event_count: alert.events.length,
      metadata: alert.metadata,
      timestamp: alert.timestamp,
      environment: process.env.NODE_ENV || 'unknown',
      service: 'bcos-api'
    };

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'BCOS-CSRF-Monitor/1.0'
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      // Don't throw - monitoring failures shouldn't break the app
      console.error('Failed to send security alert to webhook:', error);
    }
  }

  /**
   * Clean up old events to prevent memory leaks
   */
  private static cleanupOldEvents(): void {
    const now = Date.now();
    
    // Only cleanup every hour
    if (now - CSRFSecurityMonitor.lastCleanup < CSRFSecurityMonitor.CLEANUP_INTERVAL) {
      return;
    }

    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const cutoff = now - maxAge;

    for (const [ip, events] of Array.from(CSRFSecurityMonitor.failures)) {
      // Remove events older than 24 hours
      const recentEvents = events.filter((e: CSRFFailureEvent) => e.timestamp > cutoff);
      
      if (recentEvents.length === 0) {
        CSRFSecurityMonitor.failures.delete(ip);
      } else {
        CSRFSecurityMonitor.failures.set(ip, recentEvents);
      }
    }

    CSRFSecurityMonitor.lastCleanup = now;
  }

  /**
   * Get current failure statistics
   */
  static getFailureStats(): {
    totalIPs: number;
    totalEvents: number;
    recentEvents: number;
    topIPs: Array<{ ip: string; count: number; latestFailure: number }>;
  } {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    let totalEvents = 0;
    let recentEvents = 0;

    const ipStats: Array<{ ip: string; count: number; latestFailure: number }> = [];

    for (const [ip, events] of Array.from(CSRFSecurityMonitor.failures)) {
      totalEvents += events.length;
      
      const recentEventCount = events.filter((e: CSRFFailureEvent) => now - e.timestamp <= oneHour).length;
      recentEvents += recentEventCount;

      const latestEvent = Math.max(...events.map((e: CSRFFailureEvent) => e.timestamp));
      ipStats.push({ ip, count: events.length, latestFailure: latestEvent });
    }

    // Sort by event count descending
    ipStats.sort((a, b) => b.count - a.count);

    return {
      totalIPs: CSRFSecurityMonitor.failures.size,
      totalEvents,
      recentEvents,
      topIPs: ipStats.slice(0, 10) // Top 10 IPs by failure count
    };
  }

  /**
   * Clear all failure data (for testing or reset)
   */
  static clearFailureData(): void {
    CSRFSecurityMonitor.failures.clear();
    CSRFSecurityMonitor.lastCleanup = 0;
  }
}
