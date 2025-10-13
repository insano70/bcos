# Current Application Tracking - Quick Reference Guide

**Purpose:** Comprehensive inventory of all existing performance, security, and status tracking in the BendCare OS application  
**Status:** Investigation Complete  
**Date:** 2025-10-13  

---

## Table of Contents

1. [Performance Tracking](#performance-tracking)
2. [Security Event Tracking](#security-event-tracking)
3. [Cache Tracking](#cache-tracking)
4. [Database Tracking](#database-tracking)
5. [At-Risk User Detection](#at-risk-user-detection)
6. [Health Check Endpoints](#health-check-endpoints)
7. [CloudWatch Integration](#cloudwatch-integration)
8. [Logging Patterns](#logging-patterns)

---

## Performance Tracking

### API Response Time Tracking

**Location:** Every API route in `app/api/`

**Pattern:**
```typescript
const startTime = Date.now();
// ... operation ...
const duration = Date.now() - startTime;

log.info('Operation completed', {
  operation: 'operation_name',
  userId: userContext.user_id,
  duration,
  slow: duration > SLOW_THRESHOLDS.API_OPERATION,  // 1000ms
  recordCount: results.length,
  component: 'api',
});
```

**Example Files:**
- `app/api/users/route.ts` - Line 16-114
- `app/api/practices/route.ts`
- `app/api/admin/analytics/dashboards/route.ts`
- All 88 API routes follow this pattern

**Logged Fields:**
- `operation` - Operation name (e.g., "users_list", "practice_create")
- `duration` - Time in milliseconds
- `slow` - Boolean flag if > threshold
- `statusCode` - HTTP response code
- `recordCount` - Number of results returned
- `component` - Always "api"
- `correlationId` - Automatic from AsyncLocalStorage
- `userId` - Current user ID
- `organizationId` - Current organization ID

### Database Query Tracking

**Location:** `lib/logger/message-templates.ts` - Line 368-401

**Pattern:**
```typescript
const dbStartTime = Date.now();
const results = await db.select()...;
const dbDuration = Date.now() - dbStartTime;

log.db('SELECT', 'users', dbDuration, {
  recordCount: results.length,
  slow: dbDuration > SLOW_THRESHOLDS.DB_QUERY,  // 500ms
  filters: sanitizedFilters,
});
```

**Logged Fields:**
- `operation` - SQL operation type ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
- `table` - Table name
- `duration` - Query time in milliseconds
- `rowCount` - Number of rows affected
- `slow` - Boolean flag if > 500ms
- `slowThreshold` - Threshold used (500ms)
- `filters` - Sanitized filter context
- `component` - Always "database"

**Example Usage:**
- `app/api/users/route.ts` - Database query logging
- `lib/services/rbac-users-service.ts` - User queries with timing

### Slow Thresholds

**Location:** `lib/logger/constants.ts`

```typescript
export const SLOW_THRESHOLDS = {
  DB_QUERY: 500,        // Database query operations - 500ms
  API_OPERATION: 1000,  // Standard API operations - 1000ms
  AUTH_OPERATION: 2000  // Complex auth operations - 2000ms
}
```

**Rationale:**
- **DB_QUERY (500ms):** Indicates missing indexes, complex joins, large result sets, or network latency
- **API_OPERATION (1000ms):** User experience threshold for simple operations
- **AUTH_OPERATION (2000ms):** Tolerance for password hashing, token generation, MFA, multiple DB queries

**CloudWatch Query for Slow Operations:**
```sql
fields @timestamp, operation, duration, slow
| filter component = "api" OR component = "database"
| filter slow = true OR duration > 1000
| filter @timestamp > ago(1h)
| sort duration desc
| limit 100
```

---

## Security Event Tracking

### Failed Login Attempts

**Database Table:** `account_security`

**Location:** `lib/db/refresh-token-schema.ts` - Line 16-51

**Schema:**
```sql
CREATE TABLE "account_security" (
  "user_id" uuid PRIMARY KEY,
  "failed_login_attempts" integer DEFAULT 0 NOT NULL,
  "last_failed_attempt" timestamp with time zone,
  "locked_until" timestamp with time zone,
  "lockout_reason" varchar(50),
  "suspicious_activity_detected" boolean DEFAULT false NOT NULL,
  ...
);
```

**Tracking Code:** `lib/auth/security.ts`

**Functions:**
- `recordFailedAttempt(identifier: string)` - Line 218-275
  - Increments failed attempt counter
  - Applies progressive lockout (3, 5, 10, 30+ attempts)
  - Sets `suspicious_activity_detected` flag at 3+ attempts
- `isAccountLocked(identifier: string)` - Line 159-211
  - Checks if account is currently locked
  - Returns locked status and expiration time
- `clearFailedAttempts(identifier: string)` - Line 277-302
  - Resets failed attempts on successful login

**Progressive Lockout:**
```typescript
// lib/auth/security.ts - Line 11-19
const PROGRESSIVE_LOCKOUT_TIMEOUTS = [
  5 * 60 * 1000,      // 3 attempts: 5 minutes
  15 * 60 * 1000,     // 4 attempts: 15 minutes
  30 * 60 * 1000,     // 5 attempts: 30 minutes
  60 * 60 * 1000,     // 6 attempts: 1 hour
  2 * 60 * 60 * 1000, // 7 attempts: 2 hours
  4 * 60 * 60 * 1000, // 8 attempts: 4 hours
  8 * 60 * 60 * 1000, // 9 attempts: 8 hours
  24 * 60 * 60 * 1000 // 10+ attempts: 24 hours
];
```

### Login Attempts Log

**Database Table:** `login_attempts`

**Location:** `lib/db/refresh-token-schema.ts` - Line 53-75

**Schema:**
```sql
CREATE TABLE "login_attempts" (
  "attempt_id" varchar(255) PRIMARY KEY,
  "email" varchar(255) NOT NULL,
  "user_id" uuid,
  "ip_address" varchar(45) NOT NULL,
  "user_agent" text,
  "device_fingerprint" varchar(255),
  "success" boolean NOT NULL,
  "failure_reason" varchar(100),
  "remember_me_requested" boolean DEFAULT false,
  "session_id" varchar(255),
  "attempted_at" timestamp with time zone DEFAULT now()
);
```

**Tracking:** Every login attempt (success or failure)

**Failure Reasons:**
- `invalid_password`
- `invalid_email`
- `account_locked`
- `account_inactive`
- `mfa_required`
- `mfa_failed`

**Query Examples:**
```sql
-- Recent failed login attempts
SELECT email, ip_address, failure_reason, attempted_at
FROM login_attempts
WHERE success = false
  AND attempted_at > NOW() - INTERVAL '24 hours'
ORDER BY attempted_at DESC;

-- Suspicious patterns (multiple IPs)
SELECT user_id, COUNT(DISTINCT ip_address) as unique_ips
FROM login_attempts
WHERE attempted_at > NOW() - INTERVAL '7 days'
GROUP BY user_id
HAVING COUNT(DISTINCT ip_address) >= 5;
```

### CSRF Attack Tracking

**Database Table:** `csrf_failure_events`

**Location:** `lib/db/csrf-schema.ts`

**Schema:**
```sql
CREATE TABLE "csrf_failure_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "timestamp" timestamp with time zone DEFAULT now(),
  "ip_address" varchar(45) NOT NULL,
  "user_agent" text,
  "pathname" varchar(500) NOT NULL,
  "reason" varchar(100) NOT NULL,
  "severity" varchar(20) DEFAULT 'medium',
  "user_id" uuid,
  CONSTRAINT "severity_check" CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);
```

**Tracking Code:** `lib/security/csrf-monitoring.ts`

**CSRFSecurityMonitor Class:**
- `recordFailure(request, reason, severity, userId)` - Line 61-112
  - Records CSRF validation failures
  - Logs with severity level
  - Triggers alerts for high-frequency attacks
- `checkAlertConditions(ip)` - Line 200-257
  - Checks if IP has excessive failures (> 10 in 5 minutes)
  - Logs high-severity security alerts

**Logged CSRF Events:**
```typescript
log.security('csrf_validation_failed', 'high', {
  pathname,
  reason,
  ipAddress: ip,
  userAgent: userAgent.substring(0, 100),
  userId,
  component: 'csrf',
});
```

### Rate Limiting Events

**Location:** `lib/api/middleware/rate-limit.ts` - Line 61-133

**Rate Limit Configurations:**
```typescript
const RATE_LIMIT_CONFIGS = {
  auth: { limit: 20, windowSeconds: 15 * 60 },      // 20 auth attempts per 15 min
  mfa: { limit: 5, windowSeconds: 15 * 60 },        // 5 MFA attempts per 15 min
  upload: { limit: 10, windowSeconds: 60 },         // 10 uploads per minute
  api: { limit: 200, windowSeconds: 60 },           // 200 requests per minute
  global: { limit: 100, windowSeconds: 15 * 60 },   // 100 requests per 15 min
};
```

**Tracking:** Redis-based with logging

**When Rate Limit Exceeded:**
```typescript
log.security('rate_limit_exceeded', 'medium', {
  action: 'rate_limit_block',
  threat: 'dos_attempt',
  blocked: true,
  type,          // 'auth', 'api', 'upload', 'mfa'
  identifier,    // IP address or user ID
  current,       // Current request count
  limit,         // Rate limit threshold
  resetAt,       // Timestamp when limit resets
});
```

**CloudWatch Query:**
```sql
fields @timestamp, type, identifier, current, limit
| filter event = "rate_limit_exceeded"
| filter @timestamp > ago(1h)
| stats count(*) as blocks by type, identifier
| sort blocks desc
```

### Security Audit Logs

**Database Table:** `audit_logs`

**Location:** `lib/db/audit-schema.ts`

**Schema:**
```sql
CREATE TABLE "audit_logs" (
  "audit_log_id" varchar(255) PRIMARY KEY,
  "event_type" varchar(50) NOT NULL,        -- 'auth', 'user_management', 'data_access', etc.
  "action" varchar(100) NOT NULL,
  "user_id" varchar(255),
  "ip_address" varchar(45),
  "user_agent" text,
  "resource_type" varchar(50),
  "resource_id" varchar(255),
  "old_values" text,
  "new_values" text,
  "metadata" text,
  "severity" varchar(20) DEFAULT 'low',
  "created_at" timestamp with time zone DEFAULT now()
);
```

**Tracking Code:** `lib/api/services/audit.ts`

**AuditLogger Methods:**
- `logAuth(data)` - Authentication events
- `logUserAction(data)` - User management actions
- `log(entry)` - Generic audit logging

**Compliance:** 7-year retention for HIPAA compliance

---

## Cache Tracking

### Redis Cache Hit/Miss Logging

**Location:** `lib/cache/chart-data-cache.ts` - Line 50-79

**Cache Hit:**
```typescript
log.info('Cache hit', {
  key,
  chartType: data.metadata.chartType,
  cachedAt: data.metadata.cachedAt,
  recordCount: data.metadata.recordCount,
});
```

**Cache Miss:**
```typescript
log.debug('Cache miss', { key });
```

**CloudWatch Query for Cache Performance:**
```sql
fields @timestamp, message, key
| filter message like /Cache hit|Cache miss/
| filter @timestamp > ago(1h)
| stats 
    count(*) as total,
    sum(case message = "Cache hit" when 1 else 0 end) as hits,
    sum(case message = "Cache miss" when 1 else 0 end) as misses
  by bin(5m)
```

### Redis Connection Status

**Location:** `lib/redis.ts` - Line 143-183

**Events Logged:**
- `connect` - Connection established
- `ready` - Client ready for commands
- `error` - Connection error
- `close` - Connection closed
- `reconnecting` - Attempting reconnection

**Example:**
```typescript
log.info('Redis connected successfully', {
  component: 'redis',
  host: '[REDACTED]',
  port: config.port,
});

log.error('Redis connection error', error, {
  component: 'redis',
  host: '[REDACTED]',
});
```

### Cache Operations

**Services:**
- **ChartDataCache** (`lib/cache/chart-data-cache.ts`)
  - `get(key)` - Logs hit/miss
  - `set(key, data, ttl)` - Logs cache write
  - `invalidate(key)` - Logs cache deletion
  
- **RateLimitCache** (`lib/cache/rate-limit-cache.ts`)
  - `checkRateLimit(type, identifier, limit, windowSeconds)` - Logs blocks
  - `checkIpRateLimit()` - IP-based rate limiting
  - `checkUserRateLimit()` - User-based rate limiting

---

## Database Tracking

### Connection Pooling

**Location:** `lib/db/index.ts` - Line 23-50

**Configuration:**
```typescript
const dbClient = postgres(config.url, {
  prepare: false,
  max: config.max || 10,           // Connection pool size
  idle_timeout: 20,                 // 20 seconds
  connect_timeout: 10,              // 10 seconds
  ssl: 'require',                   // Production
  keep_alive: 30,                   // Production
});
```

### Health Checks

**Location:** `lib/db/index.ts` - Line 58-90

**Function:** `checkDbHealth()`

```typescript
export const checkDbHealth = async (): Promise<{
  isHealthy: boolean;
  latency?: number;
  error?: string;
}> => {
  const startTime = Date.now();
  await dbClient`SELECT 1 as health_check`;
  const latency = Date.now() - startTime;
  
  log.info('Main database health check passed', { latency });
  
  return { isHealthy: true, latency };
};
```

**Usage:** Called by `/api/health/db` endpoint

### Query Performance

**Not currently tracked automatically**, but can be added via:

```typescript
// Potential addition to lib/db/index.ts
db.$extends({
  query: {
    async $allOperations({ operation, model, args, query }) {
      const startTime = Date.now();
      const result = await query(args);
      const duration = Date.now() - startTime;
      
      if (duration > SLOW_THRESHOLDS.DB_QUERY) {
        log.warn('Slow database query detected', {
          operation,
          model,
          duration,
          component: 'database',
        });
      }
      
      return result;
    },
  },
});
```

---

## At-Risk User Detection

### Data Sources

**1. Account Security Table** (`account_security`)
- `failed_login_attempts` - Current failed attempt count
- `last_failed_attempt` - Timestamp of last failure
- `locked_until` - Account lock expiration
- `suspicious_activity_detected` - Boolean flag (set at 3+ attempts)
- `lockout_reason` - Reason for lockout

**2. Login Attempts Table** (`login_attempts`)
- All login attempts (success and failure)
- IP addresses, user agents, device fingerprints
- Timestamps for pattern analysis

### Detection Criteria

**Automatic Flagging:**
- ✓ `failed_login_attempts >= 3` → Sets `suspicious_activity_detected = true`
- ✓ `failed_login_attempts >= 10` → 24-hour lockout
- ✓ `locked_until > NOW()` → Currently locked

**Manual Analysis Criteria:**
- Multiple distinct IP addresses in short timeframe
- High frequency of attempts (e.g., > 10 in 1 hour)
- Geographic anomalies (login from different countries)
- Device fingerprint mismatches

### Query for At-Risk Users

```sql
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
ORDER BY asec.failed_login_attempts DESC, asec.last_failed_attempt DESC;
```

---

## Health Check Endpoints

### 1. Basic Health Check

**Endpoint:** `GET /api/health`

**Location:** `app/api/health/route.ts`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-13T14:32:00Z",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 86400,
  "memory": {
    "used": 245,
    "total": 512,
    "rss": 320,
    "external": 12
  },
  "node": {
    "version": "v20.10.0",
    "platform": "linux",
    "arch": "x64"
  },
  "pid": 1234
}
```

**Purpose:** Lightweight check for load balancers (no database queries)

### 2. Database Health Check

**Endpoint:** `GET /api/health/db`

**Location:** `app/api/health/db/route.ts`

**RBAC:** `settings:read:all` (Admin only)

**Response:**
```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "databases": {
    "main": {
      "connected": true,
      "responseTime": "45ms",
      "latency": 45,
      "poolingEnabled": true,
      "currentTime": "2025-10-13T14:32:00Z",
      "queries": {
        "basic": "success",
        "users": "success",
        "practices": "success"
      }
    },
    "analytics": {
      "connected": true,
      "latency": 52,
      "configured": true
    }
  },
  "statistics": {
    "totalUsers": 1234,
    "totalPractices": 456
  },
  "timestamp": "2025-10-13T14:32:00Z"
}
```

**Checks:**
- Main database connectivity
- Analytics database connectivity
- Connection pooling status
- Basic query performance
- Table counts

### 3. External Services Health

**Endpoint:** `GET /api/health/services`

**Location:** `app/api/health/services/route.ts`

**RBAC:** `settings:read:all` (Admin only)

**Response:**
```json
{
  "status": "healthy" | "degraded",
  "services": {
    "email": {
      "status": "healthy",
      "latency": 123
    },
    "storage": {
      "status": "healthy",
      "latency": 89
    },
    "auth": {
      "status": "healthy",
      "latency": 45
    }
  },
  "timestamp": "2025-10-13T14:32:00Z"
}
```

---

## CloudWatch Integration

### Metric Filters

**Location:** `infrastructure/lib/constructs/monitoring.ts`

**Configured Filters:**

1. **ErrorCount** (Line 263-270)
   - Pattern: `level="ERROR"` OR `level="FATAL"`
   - Namespace: `BCOS/{environment}`
   - Alarm: > 5 errors (prod) / 10 errors (staging) in 5 minutes

2. **SecurityEvents** (Line 316-329)
   - Pattern: `component="security"` OR `severity in ["high", "critical"]`
   - Alarm: > 1 event (immediate alert)

3. **AuthenticationFailures** (Line 345-363)
   - Pattern: `component="auth" AND success=false`
   - Alarm: > 10 failures (prod) / 20 failures (staging) in 5 minutes

4. **DatabaseErrors** (Line 365-383)
   - Pattern: `component="database" AND level="ERROR"`
   - Alarm: > 5 errors (prod) / 10 errors (staging) in 5 minutes

5. **HealthCheckFailures** (Line 293-313)
   - Pattern: `level="ERROR" AND message like "*health*"`
   - Alarm: > 3 failures in 5 minutes

### CloudWatch Logs Insights Queries

**Common Queries:**

**1. Error Rate by Endpoint:**
```sql
fields @timestamp, operation, message, statusCode
| filter level = "ERROR" AND component = "api"
| filter @timestamp > ago(1h)
| stats count(*) as error_count by operation
| sort error_count desc
```

**2. Slow Queries:**
```sql
fields @timestamp, operation, table, duration, recordCount
| filter component = "database" AND duration > 500
| filter @timestamp > ago(1h)
| sort duration desc
| limit 100
```

**3. API Response Times (p50/p95/p99):**
```sql
fields operation, duration
| filter component = "api"
| filter @timestamp > ago(1h)
| stats 
    count() as requests,
    avg(duration) as avg_ms,
    pct(duration, 50) as p50_ms,
    pct(duration, 95) as p95_ms,
    pct(duration, 99) as p99_ms
  by operation
| sort requests desc
```

**4. Security Events:**
```sql
fields @timestamp, event, severity, action, threat, blocked
| filter component = "security" OR severity in ["high", "critical"]
| filter @timestamp > ago(24h)
| sort @timestamp desc
```

**5. Failed Logins:**
```sql
fields @timestamp, action, email, ipAddress, failureReason
| filter component = "auth" AND success = false
| filter @timestamp > ago(1h)
| stats count(*) as attempts by email, ipAddress
| sort attempts desc
```

---

## Logging Patterns

### Standard API Route Pattern

```typescript
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

const handler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  
  try {
    // ... operation ...
    
    const duration = Date.now() - startTime;
    
    log.info('Operation completed', {
      operation: 'operation_name',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      recordCount: results.length,
      component: 'api',
    });
    
    return createSuccessResponse(data);
  } catch (error) {
    const duration = Date.now() - startTime;
    
    log.error('Operation failed', error, {
      operation: 'operation_name',
      userId: userContext.user_id,
      duration,
      component: 'api',
    });
    
    return createErrorResponse(error, 500, request);
  }
};
```

### Authentication Event Pattern

```typescript
// Successful login
log.auth('login', true, {
  userId,
  email,
  method: 'password',
  mfaRequired: false,
  ipAddress: metadata.ipAddress,
  userAgent: metadata.userAgent,
});

// Failed login
log.auth('login_failed', false, {
  email,
  reason: 'invalid_password',
  ipAddress: metadata.ipAddress,
  userAgent: metadata.userAgent,
});
```

### Security Event Pattern

```typescript
log.security('rate_limit_exceeded', 'high', {
  action: 'rate_limit_block',
  threat: 'dos_attempt',
  blocked: true,
  type: 'auth',
  identifier: ipAddress,
  current: 25,
  limit: 20,
});
```

### Database Query Pattern

```typescript
const dbStartTime = Date.now();
const results = await db.select().from(users);
const dbDuration = Date.now() - dbStartTime;

log.db('SELECT', 'users', dbDuration, {
  recordCount: results.length,
  slow: dbDuration > SLOW_THRESHOLDS.DB_QUERY,
  filters: { is_active: true },
});
```

---

## Summary Statistics

### Current Tracking Coverage

✅ **Fully Tracked:**
- API response times (all 88 routes)
- Database query durations
- Failed login attempts
- Account lockouts
- CSRF attacks
- Rate limiting violations
- Authentication events
- Audit trail (HIPAA compliant)
- Redis connection status
- Cache hit/miss rates
- Health check results

❌ **Not Tracked (Gaps):**
- Real-time active user count
- Cache memory usage over time
- Hot key identification
- Endpoint-specific error rates (aggregated)
- P50/P95/P99 response times (calculated on-demand only)
- Database connection pool utilization
- Slow query aggregation

### Data Retention

- **CloudWatch Logs:** 7 years (HIPAA compliance)
- **Database (audit_logs):** 7 years
- **Database (login_attempts):** No explicit retention (should add)
- **Database (csrf_failure_events):** No explicit retention (should add)
- **Redis Cache:** TTL-based (5 min - 24 hours)

---

**End of Reference Guide**

