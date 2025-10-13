# Application Status, Performance & Caching Monitoring Dashboard
## Admin Command Center - Technical Design Document

**Status:** Design & Investigation Phase  
**Created:** 2025-10-13  
**Version:** 1.0  
**Priority:** High  

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Data Sources & Instrumentation](#data-sources--instrumentation)
4. [Dashboard Architecture](#dashboard-architecture)
5. [Dashboard Views Design](#dashboard-views-design)
6. [Redis Cache Management Tools](#redis-cache-management-tools)
7. [API Endpoints Design](#api-endpoints-design)
8. [Implementation Recommendations](#implementation-recommendations)
9. [Integration with Existing Systems](#integration-with-existing-systems)
10. [Security & Access Control](#security--access-control)

---

## Executive Summary

### Purpose
Create a unified Application Status, Performance & Caching Monitoring Dashboard (Admin Command Center) that provides real-time insights into application health, performance metrics, security events, cache performance, and administrative tools for Redis cache management.

### Key Objectives
- **Single Source of Truth:** Unified command center for all application status and monitoring
- **Real-Time Insights:** Live performance metrics, error tracking, and security event monitoring
- **Cache Management:** Comprehensive Redis cache administration tools
- **At-Risk User Detection:** Proactive monitoring and flagging of suspicious activity
- **Performance Optimization:** Identify slow queries, cache misses, and performance bottlenecks
- **Security Monitoring:** Track failed logins, rate limiting, CSRF attacks, and security events

### Technology Stack
- **Frontend:** Existing Chart.js infrastructure with brand color #00AEEF (violet-500)
- **Backend:** Node.js/Next.js API routes with RBAC protection
- **Logging:** Universal logger with CloudWatch integration (already implemented)
- **Cache:** Redis/Valkey with ioredis client (already implemented)
- **Database:** PostgreSQL with Drizzle ORM
- **Monitoring:** CloudWatch Logs Insights with metric filters

---

## Current State Analysis

### ✅ Strong Foundations Already in Place

#### 1. Universal Logging System (100% Complete)
**Location:** `lib/logger/`

**Features:**
- Native console-based logging with CloudWatch integration
- Automatic context capture (file, line, function, correlation ID)
- AsyncLocalStorage for request correlation tracking
- HIPAA-compliant PII sanitization
- Production sampling (1% debug, 10% info, 100% errors)

**Key Components:**
```typescript
// SLOW_THRESHOLDS constants for consistent performance detection
SLOW_THRESHOLDS = {
  DB_QUERY: 500,        // Database query operations - 500ms
  API_OPERATION: 1000,  // Standard API operations - 1000ms
  AUTH_OPERATION: 2000  // Complex auth operations - 2000ms
}

// Logging methods available
log.info(message, context)
log.warn(message, context)
log.error(message, error, context)
log.debug(message, context)
log.auth(action, success, context)
log.security(event, severity, context)
log.api(message, request, statusCode, duration)
log.db(operation, table, duration, context)
log.timing(message, startTime, context)
```

**Usage Pattern in API Routes:**
```typescript
const startTime = Date.now();
// ... operation ...
const duration = Date.now() - startTime;

log.info('Operation completed', {
  operation: 'user_list',
  userId: userContext.user_id,
  duration,
  slow: duration > SLOW_THRESHOLDS.API_OPERATION,
  recordCount: users.length,
  component: 'api',
});
```

#### 2. Security Event Tracking (Comprehensive)
**Database Tables:**
- `account_security` - Failed login attempts, lockouts, suspicious activity flags
- `login_attempts` - Detailed login attempt records (email, IP, success, failure_reason)
- `csrf_failure_events` - CSRF attack tracking (IP, pathname, severity)
- `audit_logs` - Compliance audit trail (7-year retention)

**Tracking Points:**
- Failed login attempts with progressive lockout (3, 5, 10, 30 attempts)
- Account lockouts (tracked in `account_security.locked_until`)
- Suspicious activity detection (`suspicious_activity_detected` boolean)
- Rate limiting violations (logged to CloudWatch)
- CSRF validation failures (database + CloudWatch)
- Security events (injection attempts, SQL injection, XSS blocked)

**Code Locations:**
- `lib/auth/security.ts` - recordFailedAttempt(), isAccountLocked()
- `lib/security/csrf-monitoring.ts` - CSRF tracking with CSRFSecurityMonitor class
- `lib/api/middleware/rate-limit.ts` - Rate limiting with Redis
- `lib/api/services/audit.ts` - AuditLogger for compliance

#### 3. Performance Tracking (Pervasive)
**API Response Time Tracking:**
Every API route follows this pattern:
```typescript
const startTime = Date.now();
// ... API operation ...
const duration = Date.now() - startTime;

log.info('API request completed', {
  operation: 'users_list',
  duration,
  slow: duration > SLOW_THRESHOLDS.API_OPERATION,
  statusCode: 200,
  recordCount: results.length,
  component: 'api',
});
```

**Database Query Tracking:**
```typescript
const dbStartTime = Date.now();
const results = await db.select()...;
const dbDuration = Date.now() - dbStartTime;

log.db('SELECT', 'users', dbDuration, {
  recordCount: results.length,
  slow: dbDuration > SLOW_THRESHOLDS.DB_QUERY,
  filters: sanitizedFilters,
});
```

**Tracked Metrics:**
- API response times (per endpoint, with p50/p95/p99 via CloudWatch)
- Database query durations (flagged as slow > 500ms)
- Authentication operation times (flagged as slow > 2000ms)
- Cache operation latencies (Redis client tracking)
- Health check response times

#### 4. Redis Cache Infrastructure (Production-Ready)
**Location:** `lib/redis.ts`, `lib/cache/`

**Features:**
- Singleton Redis client with automatic reconnection
- Environment-based key prefixing (`bcos:dev:`, `bcos:staging:`, `bcos:prod:`)
- Graceful degradation (falls back to database if Redis unavailable)
- Command queuing during reconnection (enableOfflineQueue: true)

**Cache Services:**
```typescript
// Chart data caching
ChartDataCache (lib/cache/chart-data-cache.ts)
  - get(key): CachedChartDataResponse | null
  - set(key, data, ttl): void
  - invalidate(key): void
  - TTL: 5 minutes default

// Rate limiting cache
RateLimitCacheService (lib/cache/rate-limit-cache.ts)
  - checkRateLimit(type, identifier, limit, windowSeconds)
  - Atomic INCR operations for thread-safety

// RBAC cache (mentioned in docs but not implemented yet)
// Token blacklist cache (mentioned in docs but not implemented yet)
```

**Cache Hit/Miss Logging:**
```typescript
// From chart-data-cache.ts
if (!cached) {
  log.debug('Cache miss', { key });
  return null;
}

log.info('Cache hit', {
  key,
  chartType: data.metadata.chartType,
  cachedAt: data.metadata.cachedAt,
  recordCount: data.metadata.recordCount,
});
```

#### 5. Health Check Endpoints (Basic)
**Existing Endpoints:**
```
GET /api/health                  # Lightweight system health (memory, uptime, Node.js version)
GET /api/health/db               # Database connectivity, response times, pool status
GET /api/health/services         # External services (email, storage, auth)
```

**Health Check Data Structure:**
```typescript
{
  status: 'healthy' | 'degraded' | 'unhealthy',
  timestamp: string,
  version: string,
  environment: string,
  uptime: number,
  memory: {
    used: number,   // MB
    total: number,  // MB
    rss: number,    // MB
    external: number // MB
  },
  databases: {
    main: {
      connected: boolean,
      responseTime: string,
      latency: number,
      poolingEnabled: boolean
    },
    analytics: { ... }
  }
}
```

#### 6. CloudWatch Monitoring (Infrastructure)
**Location:** `infrastructure/lib/constructs/monitoring.ts`

**Metric Filters:**
```typescript
// Already configured in AWS CDK
BCOS/{environment}/ErrorCount              // level="ERROR"
BCOS/{environment}/SecurityEvents          // component="security"
BCOS/{environment}/AuthenticationFailures  // component="auth" AND success=false
BCOS/{environment}/DatabaseErrors          // component="database" AND level="ERROR"
BCOS/{environment}/PermissionDenials       // permission_denied, rbac_denial
BCOS/{environment}/HealthCheckFailures     // health check errors
```

**Alarms:**
- Error rate > 5 (prod) / 10 (staging) in 5 minutes
- Authentication failures > 10 (prod) / 20 (staging) in 5 minutes
- Security events > 1 (immediate alert)
- Health check failures > 3 in 5 minutes

---

## 2. Current Infrastructure Gaps

### ❌ Missing Components

1. **No Centralized Metrics Aggregation**
   - CloudWatch logs exist but no unified metrics API
   - No real-time metrics collection service
   - No in-memory metrics tracking (counters, gauges, histograms)

2. **No Redis Admin Tools**
   - No cache key inspection UI
   - No pattern-based cache purging
   - No cache statistics dashboard
   - No hot key identification
   - No memory usage breakdown

3. **No At-Risk Users Dashboard**
   - Account security data exists but no UI
   - No proactive alerting for suspicious patterns
   - No bulk user security management

4. **No Real-Time Monitoring**
   - All metrics are post-hoc (CloudWatch Logs Insights)
   - No websocket/SSE for live updates
   - No streaming event dashboard

5. **No Performance Metrics API**
   - Slow queries logged but not aggregated
   - No p50/p95/p99 calculation in-app
   - No endpoint performance comparison

6. **No Error Rate Tracking UI**
   - Errors logged but not visualized
   - No error grouping/categorization
   - No error trend analysis

---

## Data Sources & Instrumentation

### 1. CloudWatch Logs Insights Queries

All monitoring data comes from structured logs in CloudWatch. Here are the key queries we'll use:

#### A. Error Rate by Endpoint
```sql
-- Get error count and rate by API endpoint (last hour)
fields @timestamp, level, operation, statusCode, message
| filter level = "ERROR" 
| filter component = "api"
| filter @timestamp > ago(1h)
| stats count(*) as error_count by operation, bin(5m)
| sort error_count desc
```

#### B. Slow Queries
```sql
-- Find slow database queries (> 500ms)
fields @timestamp, operation, table, duration, recordCount, filters
| filter component = "database"
| filter duration > 500
| filter @timestamp > ago(1h)
| sort duration desc
| limit 100
```

#### C. API Response Times
```sql
-- p50, p95, p99 response times by operation
fields operation, duration
| filter component = "api"
| filter @timestamp > ago(1h)
| stats 
    count() as request_count,
    avg(duration) as avg_ms,
    pct(duration, 50) as p50_ms,
    pct(duration, 95) as p95_ms,
    pct(duration, 99) as p99_ms
  by operation
| sort request_count desc
```

#### D. Cache Hit/Miss Rates
```sql
-- Cache performance by key pattern
fields @timestamp, message, key, chartType, recordCount
| filter message like /Cache hit|Cache miss/
| filter @timestamp > ago(1h)
| stats 
    count(*) as total,
    sum(case message = "Cache hit" when 1 else 0 end) as hits,
    sum(case message = "Cache miss" when 1 else 0 end) as misses
  by bin(5m)
```

#### E. Security Events
```sql
-- Security events and threats
fields @timestamp, event, severity, action, threat, blocked, ipAddress
| filter component = "security" OR severity in ["high", "critical"]
| filter @timestamp > ago(24h)
| stats count(*) as event_count by event, severity
| sort event_count desc
```

#### F. Failed Login Attempts
```sql
-- Failed login attempts by email/IP
fields @timestamp, action, success, email, ipAddress, failureReason
| filter component = "auth"
| filter success = false
| filter @timestamp > ago(1h)
| stats count(*) as attempts by email, ipAddress
| sort attempts desc
```

#### G. Rate Limiting Blocks
```sql
-- Rate limit violations
fields @timestamp, event, action, threat, type, identifier, current, limit
| filter event = "rate_limit_exceeded"
| filter @timestamp > ago(1h)
| stats count(*) as blocks, max(current) as peak_requests by type, identifier
| sort blocks desc
```

### 2. Database Queries for At-Risk Users

```sql
-- Users with failed login attempts or locked accounts
SELECT 
  u.user_id,
  u.email,
  u.first_name,
  u.last_name,
  asec.failed_login_attempts,
  asec.last_failed_attempt,
  asec.locked_until,
  asec.suspicious_activity_detected,
  asec.lockout_reason,
  (
    SELECT COUNT(*)
    FROM login_attempts la
    WHERE la.user_id = u.user_id
      AND la.success = false
      AND la.attempted_at > NOW() - INTERVAL '24 hours'
  ) as failed_attempts_24h,
  (
    SELECT COUNT(DISTINCT ip_address)
    FROM login_attempts la
    WHERE la.user_id = u.user_id
      AND la.attempted_at > NOW() - INTERVAL '7 days'
  ) as unique_ips_7d
FROM users u
LEFT JOIN account_security asec ON u.user_id = asec.user_id
WHERE 
  asec.failed_login_attempts > 0
  OR asec.locked_until > NOW()
  OR asec.suspicious_activity_detected = true
ORDER BY asec.failed_login_attempts DESC, asec.last_failed_attempt DESC
LIMIT 100;
```

```sql
-- Recent login attempts with failure patterns
SELECT 
  la.email,
  la.ip_address,
  la.user_agent,
  la.success,
  la.failure_reason,
  la.attempted_at,
  COUNT(*) OVER (
    PARTITION BY la.email 
    ORDER BY la.attempted_at 
    RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW
  ) as attempts_last_hour
FROM login_attempts la
WHERE la.attempted_at > NOW() - INTERVAL '24 hours'
ORDER BY la.attempted_at DESC
LIMIT 500;
```

### 3. Redis Client Direct Queries

```typescript
// Get Redis INFO statistics
const redis = getRedisClient();
const info = await redis.info();
// Parsed sections: Server, Clients, Memory, Stats, Replication, CPU, Keyspace

// Key metrics from INFO:
// - used_memory_human
// - connected_clients
// - total_commands_processed
// - keyspace_hits
// - keyspace_misses
// - evicted_keys
// - expired_keys

// Get all keys by pattern
const keys = await redis.keys('bcos:*');

// Get key TTL
const ttl = await redis.ttl(key);

// Get key type
const type = await redis.type(key);

// Get key memory usage
const memory = await redis.memory('USAGE', key);

// Sample random keys
const sample = await redis.randomkey();
```

### 4. In-Memory Metrics Collection (NEW)

We'll need to implement a lightweight metrics collector:

```typescript
// lib/monitoring/metrics-collector.ts
class MetricsCollector {
  private metrics = {
    requests: new Map<string, number>(),     // endpoint -> count
    errors: new Map<string, number>(),       // endpoint -> error count
    durations: new Map<string, number[]>(),  // endpoint -> durations array
    cacheHits: 0,
    cacheMisses: 0,
    rateLimitBlocks: 0,
  };

  // Called from log.api() automatically
  recordRequest(operation: string, duration: number, statusCode: number) {
    this.metrics.requests.set(
      operation,
      (this.metrics.requests.get(operation) || 0) + 1
    );
    
    if (statusCode >= 400) {
      this.metrics.errors.set(
        operation,
        (this.metrics.errors.get(operation) || 0) + 1
      );
    }

    const durations = this.metrics.durations.get(operation) || [];
    durations.push(duration);
    // Keep only last 1000 samples
    if (durations.length > 1000) durations.shift();
    this.metrics.durations.set(operation, durations);
  }

  getSnapshot() {
    const snapshot = {
      timestamp: new Date().toISOString(),
      requests: Object.fromEntries(this.metrics.requests),
      errors: Object.fromEntries(this.metrics.errors),
      responseTimeP95: this.calculateP95(),
      cacheHitRate: this.getCacheHitRate(),
      rateLimitBlocks: this.metrics.rateLimitBlocks,
    };
    
    // Reset counters after snapshot
    this.reset();
    return snapshot;
  }

  private calculateP95() {
    const result: Record<string, number> = {};
    for (const [operation, durations] of this.metrics.durations.entries()) {
      if (durations.length === 0) continue;
      const sorted = [...durations].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      result[operation] = sorted[p95Index] || 0;
    }
    return result;
  }

  private getCacheHitRate() {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    if (total === 0) return 0;
    return (this.metrics.cacheHits / total) * 100;
  }

  private reset() {
    // Reset counters but keep structure
    this.metrics.requests.clear();
    this.metrics.errors.clear();
    this.metrics.cacheHits = 0;
    this.metrics.cacheMisses = 0;
    this.metrics.rateLimitBlocks = 0;
  }
}

export const metricsCollector = new MetricsCollector();
```

---

## Dashboard Architecture

### Component Structure

```
app/(default)/admin/command-center/
  ├── page.tsx                        # Main command center page
  ├── layout.tsx                      # Admin layout with navigation
  └── components/
      ├── system-health-kpi.tsx       # Top KPI cards
      ├── performance-charts.tsx      # Performance metrics charts
      ├── security-events-panel.tsx   # Security event feed
      ├── at-risk-users-panel.tsx     # At-risk users table
      ├── redis-stats-panel.tsx       # Redis cache statistics
      ├── redis-admin-tools.tsx       # Cache management tools
      ├── error-log-panel.tsx         # Recent errors
      ├── slow-queries-panel.tsx      # Slow query table
      └── live-metrics-chart.tsx      # Real-time metrics (websocket)

app/api/admin/monitoring/
  ├── metrics/
  │   └── route.ts                    # GET /api/admin/monitoring/metrics
  ├── security-events/
  │   └── route.ts                    # GET /api/admin/monitoring/security-events
  ├── at-risk-users/
  │   └── route.ts                    # GET /api/admin/monitoring/at-risk-users
  ├── slow-queries/
  │   └── route.ts                    # GET /api/admin/monitoring/slow-queries
  └── errors/
      └── route.ts                    # GET /api/admin/monitoring/errors

app/api/admin/redis/
  ├── stats/
  │   └── route.ts                    # GET /api/admin/redis/stats
  ├── keys/
  │   └── route.ts                    # GET /api/admin/redis/keys?pattern=*
  ├── purge/
  │   └── route.ts                    # POST /api/admin/redis/purge { pattern }
  └── inspect/
      └── route.ts                    # GET /api/admin/redis/inspect?key=...

lib/monitoring/
  ├── metrics-collector.ts            # In-memory metrics collection
  ├── cloudwatch-queries.ts           # CloudWatch Logs Insights helpers
  └── redis-admin.ts                  # Redis admin operations
```

### Data Flow

```
┌─────────────────┐
│  Application    │
│   (API Routes)  │──┐
└─────────────────┘  │
                     │ Logs events via log.*()
                     ▼
┌─────────────────────────────────────────┐
│        Universal Logger                  │
│  (lib/logger/)                           │
│  - Structured JSON logs                  │
│  - Correlation IDs                       │
│  - PII sanitization                      │
└───────────┬─────────────────────────────┘
            │
            ├─────▶ CloudWatch Logs
            │       (Persistent storage, queries)
            │
            └─────▶ MetricsCollector
                    (In-memory, real-time)
                    
┌─────────────────────────────────────────┐
│   Admin Command Center Dashboard        │
│   (React/Next.js)                        │
└───────────┬─────────────────────────────┘
            │
            ├─────▶ /api/admin/monitoring/metrics
            │       (Real-time from MetricsCollector)
            │
            ├─────▶ /api/admin/monitoring/security-events
            │       (CloudWatch Logs Insights)
            │
            ├─────▶ /api/admin/monitoring/at-risk-users
            │       (Database: account_security, login_attempts)
            │
            ├─────▶ /api/admin/redis/stats
            │       (Redis INFO command)
            │
            └─────▶ /api/admin/redis/keys
                    (Redis KEYS/SCAN commands)
```

---

(Continued in Part 2...)

