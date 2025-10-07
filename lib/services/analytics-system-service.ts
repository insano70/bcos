import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { audit_logs, db } from '@/lib/db';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * System Analytics Service with RBAC
 * Provides system health, performance, and security analytics
 */

export interface SystemHealthMetrics {
  uptime: {
    seconds: number;
    formatted: string;
  };
  memory: {
    used: number;
    total: number;
    rss: number;
    external: number;
  };
  node: {
    version: string;
    platform: string;
    arch: string;
  };
  environment: string;
  timestamp: string;
}

export interface SecurityEvent {
  eventType: string;
  action: string;
  severity: string;
  count: number;
}

export interface AuthEvent {
  action: string;
  count: number;
}

export interface ErrorEvent {
  severity: string;
  count: number;
}

export interface ActivityTimelineEntry {
  hour: string;
  eventType: string;
  count: number;
}

export interface CriticalEvent {
  id: string;
  eventType: string;
  action: string;
  severity: string;
  userId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface SystemAnalytics {
  systemHealth: SystemHealthMetrics;
  security: {
    events: SecurityEvent[];
    totalSecurityEvents: number;
    criticalEvents: number;
    securityScore: number;
  };
  authentication: {
    events: AuthEvent[];
    totalAuthEvents: number;
    failureRate: number;
  };
  errors: {
    events: ErrorEvent[];
    totalErrors: number;
  };
  activity: {
    timeline: ActivityTimelineEntry[];
    totalEvents: number;
    eventsPerHour: number;
  };
  recent: {
    criticalEvents: CriticalEvent[];
  };
  metadata: {
    timeframe: string;
    startDate: string;
    generatedAt: string;
  };
}

export class AnalyticsSystemService extends BaseRBACService {
  /**
   * Get comprehensive system analytics
   */
  async getSystemAnalytics(timeframe: string = '24h'): Promise<SystemAnalytics> {
    this.requirePermission('analytics:read:all', undefined);

    const startDate = this.getStartDate(timeframe);

    // Get system health metrics
    const systemHealth = this.getSystemHealth();

    // Get security events
    const securityEvents = await db
      .select({
        eventType: audit_logs.event_type,
        action: audit_logs.action,
        severity: audit_logs.severity,
        count: sql<number>`count(*)`,
      })
      .from(audit_logs)
      .where(and(gte(audit_logs.created_at, startDate), eq(audit_logs.event_type, 'security')))
      .groupBy(audit_logs.event_type, audit_logs.action, audit_logs.severity)
      .orderBy(desc(sql`count(*)`));

    // Get authentication events
    const authEvents = await db
      .select({
        action: audit_logs.action,
        count: sql<number>`count(*)`,
      })
      .from(audit_logs)
      .where(and(gte(audit_logs.created_at, startDate), eq(audit_logs.event_type, 'auth')))
      .groupBy(audit_logs.action)
      .orderBy(desc(sql`count(*)`));

    // Get error events by severity
    const errorEvents = await db
      .select({
        severity: audit_logs.severity,
        count: sql<number>`count(*)`,
      })
      .from(audit_logs)
      .where(and(gte(audit_logs.created_at, startDate), sql`severity in ('high', 'critical')`))
      .groupBy(audit_logs.severity)
      .orderBy(desc(sql`count(*)`));

    // Get activity timeline
    const activityTimeline = await db
      .select({
        hour: sql<string>`date_trunc('hour', created_at)`,
        eventType: audit_logs.event_type,
        count: sql<number>`count(*)`,
      })
      .from(audit_logs)
      .where(gte(audit_logs.created_at, startDate))
      .groupBy(sql`date_trunc('hour', created_at)`, audit_logs.event_type)
      .orderBy(sql`date_trunc('hour', created_at)`);

    // Get recent critical events
    const criticalEventsRaw = await db
      .select({
        id: audit_logs.audit_log_id,
        eventType: audit_logs.event_type,
        action: audit_logs.action,
        severity: audit_logs.severity,
        userId: audit_logs.user_id,
        ipAddress: audit_logs.ip_address,
        metadata: audit_logs.metadata,
        createdAt: audit_logs.created_at,
      })
      .from(audit_logs)
      .where(and(gte(audit_logs.created_at, startDate), eq(audit_logs.severity, 'critical')))
      .orderBy(desc(audit_logs.created_at))
      .limit(10);

    const recentCriticalEvents: CriticalEvent[] = criticalEventsRaw.map((event) => ({
      ...event,
      metadata: event.metadata as Record<string, unknown> | null,
    }));

    // Calculate metrics
    const totalEvents = await db
      .select({ count: sql<number>`count(*)` })
      .from(audit_logs)
      .where(gte(audit_logs.created_at, startDate));

    const analytics: SystemAnalytics = {
      systemHealth,
      security: {
        events: securityEvents,
        totalSecurityEvents: securityEvents.reduce((sum, event) => sum + event.count, 0),
        criticalEvents: recentCriticalEvents.length,
        securityScore: this.calculateSecurityScore(securityEvents),
      },
      authentication: {
        events: authEvents,
        totalAuthEvents: authEvents.reduce((sum, event) => sum + event.count, 0),
        failureRate: this.calculateAuthFailureRate(authEvents),
      },
      errors: {
        events: errorEvents,
        totalErrors: errorEvents.reduce((sum, event) => sum + event.count, 0),
      },
      activity: {
        timeline: activityTimeline,
        totalEvents: totalEvents[0]?.count || 0,
        eventsPerHour: this.calculateEventsPerHour(totalEvents[0]?.count || 0, timeframe),
      },
      recent: {
        criticalEvents: recentCriticalEvents,
      },
      metadata: {
        timeframe,
        startDate: startDate.toISOString(),
        generatedAt: new Date().toISOString(),
      },
    };

    return analytics;
  }

  /**
   * Get system health metrics
   */
  private getSystemHealth(): SystemHealthMetrics {
    const uptime = process.uptime();
    const memory = process.memoryUsage();

    return {
      uptime: {
        seconds: Math.floor(uptime),
        formatted: this.formatUptime(uptime),
      },
      memory: {
        used: Math.round(memory.heapUsed / 1024 / 1024),
        total: Math.round(memory.heapTotal / 1024 / 1024),
        rss: Math.round(memory.rss / 1024 / 1024),
        external: Math.round(memory.external / 1024 / 1024),
      },
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      environment: process.env.NODE_ENV || 'unknown',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate security score based on events
   */
  private calculateSecurityScore(securityEvents: SecurityEvent[]): number {
    const criticalEvents = securityEvents
      .filter((e) => e.severity === 'critical')
      .reduce((sum, e) => sum + e.count, 0);
    const highEvents = securityEvents
      .filter((e) => e.severity === 'high')
      .reduce((sum, e) => sum + e.count, 0);

    const totalSeverityScore = criticalEvents * 10 + highEvents * 5;
    const maxScore = 100;

    return Math.max(0, maxScore - totalSeverityScore);
  }

  /**
   * Calculate authentication failure rate
   */
  private calculateAuthFailureRate(authEvents: AuthEvent[]): number {
    const failedLogins = authEvents.find((e) => e.action === 'login_failed')?.count || 0;
    const totalLogins = authEvents.reduce((sum, event) => {
      if (['login', 'login_failed'].includes(event.action)) {
        return sum + event.count;
      }
      return sum;
    }, 0);

    return totalLogins > 0 ? Math.round((failedLogins / totalLogins) * 100) : 0;
  }

  /**
   * Calculate events per hour
   */
  private calculateEventsPerHour(totalEvents: number, timeframe: string): number {
    const hours = this.getHoursFromTimeframe(timeframe);
    return hours > 0 ? Math.round(totalEvents / hours) : 0;
  }

  /**
   * Get hours from timeframe string
   */
  private getHoursFromTimeframe(timeframe: string): number {
    switch (timeframe) {
      case '1h':
        return 1;
      case '24h':
        return 24;
      case '7d':
        return 24 * 7;
      case '30d':
        return 24 * 30;
      default:
        return 24;
    }
  }

  /**
   * Format uptime duration
   */
  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  /**
   * Get start date from timeframe
   */
  private getStartDate(timeframe: string): Date {
    const now = new Date();

    switch (timeframe) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }
}

/**
 * Create analytics system service instance
 */
export function createAnalyticsSystemService(userContext: UserContext): AnalyticsSystemService {
  return new AnalyticsSystemService(userContext);
}
