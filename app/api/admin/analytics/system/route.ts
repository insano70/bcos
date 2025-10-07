import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { audit_logs, db } from '@/lib/db';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Admin Analytics - System Metrics
 * Provides system health, performance, and security analytics
 */
const analyticsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  let timeframe: string | undefined;

  log.info('System analytics request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin,
  });

  try {
    const rateLimitStart = Date.now();
    await applyRateLimit(request, 'api');
    log.info('Rate limit check completed', { duration: Date.now() - rateLimitStart });

    const { searchParams } = new URL(request.url);
    timeframe = searchParams.get('timeframe') || '24h'; // 1h, 24h, 7d, 30d
    const startDate = getStartDate(timeframe);

    log.info('Analytics parameters parsed', {
      timeframe,
      startDate: startDate.toISOString(),
    });

    // Get system health metrics
    const healthStart = Date.now();
    const systemHealth = await getSystemHealth();
    log.info('System health check completed', { duration: Date.now() - healthStart });

    // Get security events
    const _securityStart = Date.now();
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
    const recentCriticalEvents = await db
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

    // Calculate metrics
    const totalEvents = await db
      .select({ count: sql<number>`count(*)` })
      .from(audit_logs)
      .where(gte(audit_logs.created_at, startDate));

    const analytics = {
      systemHealth,
      security: {
        events: securityEvents,
        totalSecurityEvents: securityEvents.reduce((sum, event) => sum + event.count, 0),
        criticalEvents: recentCriticalEvents.length,
        securityScore: calculateSecurityScore(securityEvents),
      },
      authentication: {
        events: authEvents,
        totalAuthEvents: authEvents.reduce((sum, event) => sum + event.count, 0),
        failureRate: calculateAuthFailureRate(authEvents),
      },
      errors: {
        events: errorEvents,
        totalErrors: errorEvents.reduce((sum, event) => sum + event.count, 0),
      },
      activity: {
        timeline: activityTimeline,
        totalEvents: totalEvents[0]?.count || 0,
        eventsPerHour: calculateEventsPerHour(totalEvents[0]?.count || 0, timeframe),
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

    return createSuccessResponse(analytics, 'System analytics retrieved successfully');
  } catch (error) {
    log.error('System analytics error', error, {
      timeframe,
      requestingUserId: userContext.user_id,
    });

    log.info('Analytics request failed', { duration: Date.now() - startTime });
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  } finally {
    log.info('System analytics total', { duration: Date.now() - startTime });
  }
};

async function getSystemHealth() {
  const uptime = process.uptime();
  const memory = process.memoryUsage();

  return {
    uptime: {
      seconds: Math.floor(uptime),
      formatted: formatUptime(uptime),
    },
    memory: {
      used: Math.round(memory.heapUsed / 1024 / 1024), // MB
      total: Math.round(memory.heapTotal / 1024 / 1024), // MB
      rss: Math.round(memory.rss / 1024 / 1024), // MB
      external: Math.round(memory.external / 1024 / 1024), // MB
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

interface SecurityEvent {
  severity: string;
  count: number;
}

interface AuthEvent {
  action: string;
  count: number;
}

function calculateSecurityScore(securityEvents: SecurityEvent[]): number {
  // Simple security score calculation
  // Higher score = better security (fewer critical events)
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

function calculateAuthFailureRate(authEvents: AuthEvent[]): number {
  const failedLogins = authEvents.find((e) => e.action === 'login_failed')?.count || 0;
  const totalLogins = authEvents.reduce((sum, event) => {
    if (['login', 'login_failed'].includes(event.action)) {
      return sum + event.count;
    }
    return sum;
  }, 0);

  return totalLogins > 0 ? Math.round((failedLogins / totalLogins) * 100) : 0;
}

function calculateEventsPerHour(totalEvents: number, timeframe: string): number {
  const hours = getHoursFromTimeframe(timeframe);
  return hours > 0 ? Math.round(totalEvents / hours) : 0;
}

function getHoursFromTimeframe(timeframe: string): number {
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

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getStartDate(timeframe: string): Date {
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

// Export as permission-based protected route
// Uses analytics:read:all permission (granted via roles)
// Super admins bypass permission checks automatically
export const GET = rbacRoute(analyticsHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});
