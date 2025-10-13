# Monitoring Dashboard Design - Part 3: Redis Admin Tools & API Endpoints

## Redis Cache Management Tools

### Redis Admin Panel Design

**Component:** `RedisAdminTools.tsx`

```
┌──────────────────────────────────────────────────────────────────┐
│  REDIS CACHE ADMIN TOOLS                                          │
├──────────────────────────────────────────────────────────────────┤
│  [TAB: Overview] [TAB: Key Inspector] [TAB: Admin Operations]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  TAB 1: OVERVIEW                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Connection Status: ● Connected                            │  │
│  │  Environment: bcos:prod:                                   │  │
│  │  Uptime: 14d 6h 23m                                       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Key Distribution by Pattern:                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  chart:data:*                                              │  │
│  │  ████████████████░░░░░░░░  1,234 keys (29%) • 45MB       │  │
│  │                                                            │  │
│  │  ratelimit:*                                               │  │
│  │  █████████░░░░░░░░░░░░░░░  892 keys (21%) • 2MB          │  │
│  │                                                            │  │
│  │  session:*                                                 │  │
│  │  ███░░░░░░░░░░░░░░░░░░░░░  142 keys (3%) • 5MB           │  │
│  │                                                            │  │
│  │  other                                                     │  │
│  │  ████████████████████████░  1,963 keys (47%) • 193MB      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Command Statistics (last 5 min):                                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  GET:     38,421  ████████████████████████                │  │
│  │  SET:      6,810  █████░                                  │  │
│  │  DEL:        234  ░                                       │  │
│  │  INCR:       892  ░░                                      │  │
│  │  EXPIRE:   6,810  █████░                                  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  TAB 2: KEY INSPECTOR                                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Search Keys:                                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  [bcos:prod:*_____________________]  [🔍 Search]  [Clear] │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Filter by Type:                                                  │
│  [All] [String] [Hash] [List] [Set] [Sorted Set]                │
│                                                                   │
│  Results (showing 50 of 1,234):                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Key                               │ Type   │ TTL    │ Size  │  │
│  ├───────────────────────────────────┼────────┼────────┼───────┤  │
│  │ bcos:prod:chart:data:abc123       │ string │ 4m 23s │ 12KB │  │
│  │ [Inspect] [Delete] [Set TTL]                              │  │
│  ├───────────────────────────────────┼────────┼────────┼───────┤  │
│  │ bcos:prod:chart:data:def456       │ string │ 2m 15s │ 8KB  │  │
│  │ [Inspect] [Delete] [Set TTL]                              │  │
│  ├───────────────────────────────────┼────────┼────────┼───────┤  │
│  │ bcos:prod:session:user:xyz789     │ string │ 30m    │ 2KB  │  │
│  │ [Inspect] [Delete] [Set TTL]                              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  [← Prev] [1] [2] [3] ... [25] [Next →]                         │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  TAB 3: ADMIN OPERATIONS                                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Quick Actions:                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  🧹 Purge Cache by Pattern                                 │  │
│  │  Pattern: [bcos:prod:chart:*____________]                  │  │
│  │  ⚠️ This will delete all matching keys                     │  │
│  │  [Preview Matches (123)] [Purge]                           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ⏰ Extend TTL for Pattern                                 │  │
│  │  Pattern: [bcos:prod:session:*____________]                │  │
│  │  New TTL: [3600______] seconds (1 hour)                    │  │
│  │  [Preview Matches (42)] [Update TTL]                       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  🔥 Clear All Cache                                         │  │
│  │  ⚠️ DANGER: This will delete ALL keys with prefix          │  │
│  │     bcos:prod:                                             │  │
│  │                                                             │  │
│  │  Type "CLEAR ALL CACHE" to confirm:                        │  │
│  │  [________________________________]                         │  │
│  │  [Clear All Cache (Disabled)]                              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Recent Operations:                                               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  14:32:15 • Purged chart:data:* (45 keys deleted)         │  │
│  │  14:28:03 • Extended TTL for session:* (12 keys updated)  │  │
│  │  14:15:42 • Inspected key: ratelimit:ip:203.0.113.42      │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints Design

### 1. Monitoring Metrics API

#### `GET /api/admin/monitoring/metrics`

**Description:** Real-time application metrics from in-memory collector

**RBAC:** `settings:read:all` (Super Admin only)

**Query Parameters:**
```typescript
{
  timeRange?: '5m' | '15m' | '1h' | '6h' | '24h',  // Default: '1h'
}
```

**Response:**
```typescript
{
  timestamp: string,
  timeRange: string,
  
  // System Health
  systemHealth: {
    status: 'healthy' | 'degraded' | 'unhealthy',
    score: number,  // 0-100
    factors: {
      uptime: 'healthy' | 'degraded' | 'unhealthy',
      errorRate: 'healthy' | 'degraded' | 'unhealthy',
      responseTime: 'healthy' | 'degraded' | 'unhealthy',
      cachePerformance: 'healthy' | 'degraded' | 'unhealthy',
      databaseLatency: 'healthy' | 'degraded' | 'unhealthy',
    },
  },
  
  // Performance Metrics
  performance: {
    requests: {
      total: number,
      perSecond: number,
      byEndpoint: Record<string, number>,
    },
    responseTime: {
      p50: number,
      p95: number,
      p99: number,
      avg: number,
      byEndpoint: Record<string, { p50: number, p95: number, p99: number }>,
    },
    errors: {
      total: number,
      rate: number,  // percentage
      byEndpoint: Record<string, number>,
      byType: Record<string, number>,
    },
    slowRequests: {
      count: number,
      threshold: number,
      endpoints: string[],
    },
  },
  
  // Cache Metrics
  cache: {
    hitRate: number,
    hits: number,
    misses: number,
    opsPerSec: number,
  },
  
  // Security Metrics
  security: {
    failedLogins: number,
    rateLimitBlocks: number,
    csrfBlocks: number,
    suspiciousUsers: number,
    lockedAccounts: number,
  },
  
  // Active Users
  activeUsers: {
    current: number,
    peak: number,
    peakTime: string,
  },
}
```

**Implementation:**
```typescript
// app/api/admin/monitoring/metrics/route.ts
import { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { metricsCollector } from '@/lib/monitoring/metrics-collector';
import { getRedisClient } from '@/lib/redis';
import { db } from '@/lib/db';
import { account_security } from '@/lib/db/schema';
import { eq, gt, sql } from 'drizzle-orm';

const metricsHandler = async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const timeRange = searchParams.get('timeRange') || '1h';
  
  // Get real-time metrics from in-memory collector
  const snapshot = metricsCollector.getSnapshot();
  
  // Get Redis cache stats
  const redis = getRedisClient();
  let cacheStats = { hitRate: 0, hits: 0, misses: 0, opsPerSec: 0 };
  if (redis) {
    const info = await redis.info('stats');
    // Parse info string and extract metrics
    cacheStats = parseRedisInfo(info);
  }
  
  // Get security metrics from database
  const now = new Date();
  const [securityMetrics] = await db
    .select({
      lockedAccounts: sql<number>`COUNT(*) FILTER (WHERE locked_until > ${now})`,
      suspiciousUsers: sql<number>`COUNT(*) FILTER (WHERE suspicious_activity_detected = true)`,
    })
    .from(account_security);
  
  // Calculate system health score
  const systemHealth = calculateHealthScore({
    errorRate: snapshot.errors.rate,
    responseTimeP95: snapshot.responseTime.p95,
    cacheHitRate: cacheStats.hitRate,
    dbLatencyP95: 0, // TODO: Add DB latency tracking
    securityIncidents: snapshot.security.failedLogins + snapshot.security.rateLimitBlocks,
  });
  
  return createSuccessResponse({
    timestamp: snapshot.timestamp,
    timeRange,
    systemHealth,
    performance: {
      requests: {
        total: snapshot.requests.total,
        perSecond: snapshot.requests.perSecond,
        byEndpoint: snapshot.requests.byEndpoint,
      },
      responseTime: snapshot.responseTime,
      errors: snapshot.errors,
      slowRequests: snapshot.slowRequests,
    },
    cache: cacheStats,
    security: {
      ...snapshot.security,
      suspiciousUsers: securityMetrics.suspiciousUsers,
      lockedAccounts: securityMetrics.lockedAccounts,
    },
    activeUsers: snapshot.activeUsers,
  });
};

export const GET = rbacRoute(metricsHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});
```

---

### 2. Security Events API

#### `GET /api/admin/monitoring/security-events`

**Description:** Recent security events from CloudWatch Logs

**RBAC:** `settings:read:all` (Super Admin only)

**Query Parameters:**
```typescript
{
  limit?: number,        // Default: 50, Max: 500
  severity?: string[],   // ['critical', 'high', 'medium', 'low']
  timeRange?: string,    // '1h', '6h', '24h', '7d'
}
```

**Response:**
```typescript
{
  events: [
    {
      id: string,
      timestamp: string,
      event: string,
      severity: 'critical' | 'high' | 'medium' | 'low',
      action: string,
      threat?: string,
      blocked: boolean,
      details: Record<string, any>,
      message: string,
    }
  ],
  totalCount: number,
  summary: {
    critical: number,
    high: number,
    medium: number,
    low: number,
  },
}
```

**Implementation:**
```typescript
// app/api/admin/monitoring/security-events/route.ts
import { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { queryCloudWatchLogs } from '@/lib/monitoring/cloudwatch-queries';

const securityEventsHandler = async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const timeRange = searchParams.get('timeRange') || '1h';
  const severityFilter = searchParams.getAll('severity');
  
  // Query CloudWatch Logs for security events
  const query = `
    fields @timestamp, event, severity, action, threat, blocked, message
    | filter component = "security" OR severity in ["high", "critical"]
    | filter @timestamp > ago(${timeRange})
    ${severityFilter.length > 0 ? `| filter severity in [${severityFilter.map(s => `"${s}"`).join(', ')}]` : ''}
    | sort @timestamp desc
    | limit ${limit}
  `;
  
  const results = await queryCloudWatchLogs(query, timeRange);
  
  // Transform results
  const events = results.map((result: any) => ({
    id: `evt_${result['@ptr']}`,  // CloudWatch record pointer
    timestamp: result['@timestamp'],
    event: result.event,
    severity: result.severity,
    action: result.action,
    threat: result.threat,
    blocked: result.blocked === 'true' || result.blocked === true,
    details: {
      ipAddress: result.ipAddress,
      userId: result.userId,
      ...result,
    },
    message: result.message,
  }));
  
  // Calculate summary
  const summary = events.reduce((acc, event) => {
    acc[event.severity] = (acc[event.severity] || 0) + 1;
    return acc;
  }, { critical: 0, high: 0, medium: 0, low: 0 });
  
  return createSuccessResponse({
    events,
    totalCount: events.length,
    summary,
  });
};

export const GET = rbacRoute(securityEventsHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});
```

---

### 3. At-Risk Users API

#### `GET /api/admin/monitoring/at-risk-users`

**Description:** Users with failed logins, locked accounts, or suspicious activity

**RBAC:** `settings:read:all` (Super Admin only)

**Query Parameters:**
```typescript
{
  limit?: number,           // Default: 50
  minRiskScore?: number,    // Filter by risk score (0-100)
  status?: string[],        // ['locked', 'suspicious', 'failed_attempts']
}
```

**Response:**
```typescript
{
  users: [
    {
      userId: string,
      email: string,
      firstName: string,
      lastName: string,
      failedAttempts: number,
      lastFailedAttempt: string,
      lockedUntil: string | null,
      suspiciousActivity: boolean,
      lockoutReason: string | null,
      riskScore: number,  // 0-100
      riskFactors: string[],
      recentAttempts24h: number,
      uniqueIPs7d: number,
    }
  ],
  totalCount: number,
  summary: {
    locked: number,
    suspicious: number,
    failedAttempts: number,
  },
}
```

**Implementation:**
```typescript
// app/api/admin/monitoring/at-risk-users/route.ts
import { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { db } from '@/lib/db';
import { users, account_security, login_attempts } from '@/lib/db/schema';
import { eq, gt, sql, and } from 'drizzle-orm';

const atRiskUsersHandler = async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const minRiskScore = parseInt(searchParams.get('minRiskScore') || '0');
  
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Query users with security issues
  const atRiskUsers = await db
    .select({
      userId: users.user_id,
      email: users.email,
      firstName: users.first_name,
      lastName: users.last_name,
      failedAttempts: account_security.failed_login_attempts,
      lastFailedAttempt: account_security.last_failed_attempt,
      lockedUntil: account_security.locked_until,
      suspiciousActivity: account_security.suspicious_activity_detected,
      lockoutReason: account_security.lockout_reason,
    })
    .from(users)
    .leftJoin(account_security, eq(users.user_id, account_security.user_id))
    .where(
      and(
        sql`(
          ${account_security.failed_login_attempts} > 0 OR
          ${account_security.locked_until} > ${now} OR
          ${account_security.suspicious_activity_detected} = true
        )`
      )
    )
    .orderBy(sql`${account_security.failed_login_attempts} DESC, ${account_security.last_failed_attempt} DESC`)
    .limit(limit);
  
  // Enrich with recent activity stats
  const enrichedUsers = await Promise.all(
    atRiskUsers.map(async (user) => {
      // Count recent login attempts
      const [recentStats] = await db
        .select({
          attempts24h: sql<number>`COUNT(*) FILTER (WHERE attempted_at > ${twentyFourHoursAgo})`,
          uniqueIPs7d: sql<number>`COUNT(DISTINCT ip_address) FILTER (WHERE attempted_at > ${sevenDaysAgo})`,
        })
        .from(login_attempts)
        .where(eq(login_attempts.user_id, user.userId));
      
      // Calculate risk score
      const riskScore = calculateRiskScore({
        failedAttempts: user.failedAttempts || 0,
        lockedUntil: user.lockedUntil,
        suspiciousActivity: user.suspiciousActivity || false,
        recentAttempts24h: recentStats.attempts24h || 0,
        uniqueIPs7d: recentStats.uniqueIPs7d || 0,
      });
      
      // Determine risk factors
      const riskFactors: string[] = [];
      if (user.failedAttempts && user.failedAttempts >= 5) {
        riskFactors.push('Multiple failed login attempts');
      }
      if (user.lockedUntil && user.lockedUntil > now) {
        riskFactors.push('Account currently locked');
      }
      if (user.suspiciousActivity) {
        riskFactors.push('Suspicious activity detected');
      }
      if (recentStats.uniqueIPs7d && recentStats.uniqueIPs7d >= 5) {
        riskFactors.push(`Unusual IP addresses (${recentStats.uniqueIPs7d} different IPs in 7 days)`);
      }
      if (recentStats.attempts24h && recentStats.attempts24h >= 10) {
        riskFactors.push(`High frequency attempts (${recentStats.attempts24h} attempts in 24 hours)`);
      }
      
      return {
        ...user,
        riskScore,
        riskFactors,
        recentAttempts24h: recentStats.attempts24h || 0,
        uniqueIPs7d: recentStats.uniqueIPs7d || 0,
      };
    })
  );
  
  // Filter by risk score if specified
  const filteredUsers = enrichedUsers.filter(user => user.riskScore >= minRiskScore);
  
  // Calculate summary
  const summary = {
    locked: filteredUsers.filter(u => u.lockedUntil && u.lockedUntil > now).length,
    suspicious: filteredUsers.filter(u => u.suspiciousActivity).length,
    failedAttempts: filteredUsers.filter(u => u.failedAttempts && u.failedAttempts > 0).length,
  };
  
  return createSuccessResponse({
    users: filteredUsers,
    totalCount: filteredUsers.length,
    summary,
  });
};

export const GET = rbacRoute(atRiskUsersHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});
```

---

### 4. Redis Stats API

#### `GET /api/admin/redis/stats`

**Description:** Redis cache statistics and performance metrics

**RBAC:** `settings:read:all` (Super Admin only)

**Response:**
```typescript
{
  connected: boolean,
  memory: {
    used: number,       // MB
    total: number,      // MB
    percentage: number,
    fragmentation: number,
  },
  keys: {
    total: number,
    byPattern: Record<string, number>,
  },
  stats: {
    hitRate: number,
    totalHits: number,
    totalMisses: number,
    opsPerSec: number,
    connectedClients: number,
    evictedKeys: number,
    expiredKeys: number,
  },
  commandStats: Record<string, number>,
}
```

**Implementation:**
```typescript
// app/api/admin/redis/stats/route.ts
import { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { getRedisClient, isRedisAvailable } from '@/lib/redis';
import { log } from '@/lib/logger';

const redisStatsHandler = async (request: NextRequest) => {
  const redis = getRedisClient();
  
  if (!redis || !isRedisAvailable()) {
    return createErrorResponse('Redis not available', 503, request);
  }
  
  try {
    // Get Redis INFO
    const info = await redis.info();
    const parsedInfo = parseRedisInfo(info);
    
    // Get key count by pattern
    const keyPrefix = process.env.NODE_ENV === 'production' ? 'bcos:prod:' : 'bcos:dev:';
    const patterns = [
      'chart:data:*',
      'ratelimit:*',
      'session:*',
      'user:*',
      'role:*',
    ];
    
    const keysByPattern: Record<string, number> = {};
    for (const pattern of patterns) {
      const fullPattern = `${keyPrefix}${pattern}`;
      const keys = await redis.keys(fullPattern);
      keysByPattern[pattern] = keys.length;
    }
    
    // Get all keys to calculate total
    const allKeys = await redis.keys(`${keyPrefix}*`);
    const totalKeys = allKeys.length;
    
    const response = {
      connected: true,
      memory: {
        used: Math.round(parsedInfo.used_memory / 1024 / 1024),  // Convert to MB
        total: Math.round(parsedInfo.maxmemory / 1024 / 1024),
        percentage: (parsedInfo.used_memory / parsedInfo.maxmemory) * 100,
        fragmentation: parsedInfo.mem_fragmentation_ratio,
      },
      keys: {
        total: totalKeys,
        byPattern: keysByPattern,
      },
      stats: {
        hitRate: parsedInfo.keyspace_hit_rate,
        totalHits: parsedInfo.keyspace_hits,
        totalMisses: parsedInfo.keyspace_misses,
        opsPerSec: parsedInfo.instantaneous_ops_per_sec,
        connectedClients: parsedInfo.connected_clients,
        evictedKeys: parsedInfo.evicted_keys,
        expiredKeys: parsedInfo.expired_keys,
      },
      commandStats: parsedInfo.commandstats,
    };
    
    log.info('Redis stats retrieved', {
      operation: 'redis_stats',
      totalKeys,
      memoryUsed: response.memory.used,
      hitRate: response.stats.hitRate,
    });
    
    return createSuccessResponse(response);
  } catch (error) {
    log.error('Failed to get Redis stats', error instanceof Error ? error : new Error(String(error)));
    return createErrorResponse(error, 500, request);
  }
};

export const GET = rbacRoute(redisStatsHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});

// Helper function to parse Redis INFO string
function parseRedisInfo(infoString: string): Record<string, any> {
  const lines = infoString.split('\r\n');
  const info: Record<string, any> = {};
  
  for (const line of lines) {
    if (line && !line.startsWith('#')) {
      const [key, value] = line.split(':');
      if (key && value) {
        // Try to parse as number
        const numValue = parseFloat(value);
        info[key] = isNaN(numValue) ? value : numValue;
      }
    }
  }
  
  // Calculate hit rate
  if (info.keyspace_hits && info.keyspace_misses) {
    const total = info.keyspace_hits + info.keyspace_misses;
    info.keyspace_hit_rate = total > 0 ? (info.keyspace_hits / total) * 100 : 0;
  }
  
  return info;
}
```

---

### 5. Redis Key Management API

#### `GET /api/admin/redis/keys`

**Description:** Search and list Redis keys by pattern

**RBAC:** `settings:read:all` (Super Admin only)

**Query Parameters:**
```typescript
{
  pattern?: string,  // Default: '*'
  page?: number,     // Default: 1
  limit?: number,    // Default: 50, Max: 500
}
```

**Response:**
```typescript
{
  keys: [
    {
      key: string,
      type: string,    // 'string', 'hash', 'list', 'set', 'zset'
      ttl: number,     // seconds, -1 = no expiry
      size: number,    // bytes
      value?: any,     // Only for inspect requests
    }
  ],
  totalCount: number,
  page: number,
  limit: number,
}
```

---

#### `POST /api/admin/redis/purge`

**Description:** Purge cache keys by pattern

**RBAC:** `settings:write:all` (Super Admin only)

**Request Body:**
```typescript
{
  pattern: string,
  confirm?: boolean,  // Must be true to execute
  preview?: boolean,  // If true, only return count without deleting
}
```

**Response:**
```typescript
{
  success: boolean,
  keysDeleted: number,
  pattern: string,
  preview: boolean,
}
```

---

## Implementation Recommendations

### 1. Phased Rollout

**Phase 1: Foundation (Week 1)**
- Implement MetricsCollector for in-memory tracking
- Create `/api/admin/monitoring/metrics` endpoint
- Build basic dashboard layout with KPI cards
- Add health score calculation

**Phase 2: Security Monitoring (Week 2)**
- Implement `/api/admin/monitoring/security-events` with CloudWatch integration
- Implement `/api/admin/monitoring/at-risk-users` with database queries
- Build SecurityEventsFeed component
- Build AtRiskUsersPanel component

**Phase 3: Redis Management (Week 3)**
- Implement `/api/admin/redis/stats`, `/keys`, `/purge` endpoints
- Build RedisStatsPanel component
- Build RedisAdminTools component with tabs
- Add key inspection and management UI

**Phase 4: Performance Visualization (Week 4)**
- Build PerformanceCharts component with Chart.js
- Add slow query tracking and visualization
- Add error rate trending charts
- Implement real-time updates with polling or SSE

**Phase 5: Polish & Optimization (Week 5)**
- Add auto-refresh controls
- Add export functionality (CSV, JSON)
- Add filtering and search capabilities
- Performance optimization and caching
- Comprehensive testing

### 2. Data Collection Strategy

**Option A: Hybrid (Recommended)**
- Use in-memory MetricsCollector for real-time metrics (5-minute rolling window)
- Use CloudWatch Logs Insights for historical queries (1h+)
- Use direct database queries for at-risk users and security tables
- Use Redis INFO for cache statistics

**Benefits:**
- Fast response times for dashboard (in-memory data)
- Historical analysis available via CloudWatch
- No additional infrastructure required

**Option B: Time-Series Database**
- Store metrics in TimescaleDB or InfluxDB
- More complex but better for long-term trending
- Consider if you need >7 days of high-resolution metrics

### 3. Performance Considerations

**Caching Strategy:**
```typescript
// Cache dashboard data for 30 seconds
const DASHBOARD_CACHE_TTL = 30;

async function getDashboardMetrics() {
  const cacheKey = 'dashboard:metrics';
  
  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Generate fresh data
  const metrics = await generateMetrics();
  
  // Cache for 30 seconds
  await redis.setex(cacheKey, DASHBOARD_CACHE_TTL, JSON.stringify(metrics));
  
  return metrics;
}
```

**Query Optimization:**
- Use CloudWatch Logs Insights query result caching
- Paginate large result sets
- Use database indexes on timestamp columns
- Limit real-time metrics to last 5-15 minutes

### 4. Security Considerations

**Access Control:**
- All endpoints protected with `settings:read:all` or `settings:write:all`
- Audit log all Redis purge operations
- Rate limit admin endpoints (10 req/min per user)

**Data Sanitization:**
- Redact PII in logs (email → first 3 chars + ***@domain)
- Redact IP addresses in security events for non-super-admins
- Mask sensitive Redis key values

**Dangerous Operations:**
- Require confirmation modal for "Clear All Cache"
- Log all cache purge operations to audit log
- Implement undo/rollback for accidental purges (keep deleted keys for 5 minutes)

---

## Integration with Existing Systems

### 1. Universal Logger Integration

The monitoring dashboard will leverage the existing universal logger:

```typescript
// Automatic metrics collection in logger
// lib/logger/logger.ts
log.api = (message, request, statusCode, duration) => {
  // Existing logging...
  
  // NEW: Also record in metrics collector
  metricsCollector.recordRequest(
    request.nextUrl.pathname,
    duration,
    statusCode
  );
};
```

### 2. Chart.js Theme Integration

Use existing chart configuration:

```typescript
// Import existing chart colors and config
import { chartColors } from '@/components/charts/chartjs-config';
import { useTheme } from 'next-themes';

// Apply brand colors
const brandColor = '#00AEEF';  // violet-500 in Tailwind theme

const chartData = {
  datasets: [{
    borderColor: brandColor,
    backgroundColor: `${brandColor}20`,  // 20% opacity
    ...
  }]
};
```

### 3. RBAC Integration

All endpoints use existing RBAC:

```typescript
export const GET = rbacRoute(handler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});
```

### 4. CloudWatch Integration

Use existing monitoring infrastructure:

```typescript
// Query existing metric filters
const errorRate = await cloudwatch.getMetricStatistics({
  Namespace: `BCOS/${environment}`,
  MetricName: 'ErrorCount',
  ...
});
```

---

## Success Metrics

**Operational Efficiency:**
- Reduce mean time to detect (MTTD) issues by 50%
- Reduce mean time to resolve (MTTR) performance issues by 40%
- Identify at-risk users before account compromise (proactive vs reactive)

**System Health:**
- Maintain 95%+ system health score
- Keep p95 response times < 500ms
- Maintain cache hit rate > 90%

**Security:**
- Detect and block 100% of rate limit violations
- Identify suspicious activity patterns within 5 minutes
- Zero false negatives for account lockouts

---

**End of Design Document**

