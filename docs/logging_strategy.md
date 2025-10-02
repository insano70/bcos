# Logging Strategy

**Version:** 2.0
**Date:** 2025-10-02
**Status:** Implementation Ready

---

## Executive Summary

This document outlines the complete logging strategy for BendCare OS, transitioning from a complex 4,244-line custom logging system to a minimal 300-line implementation using native `console.*` with CloudWatch integration.

### Key Decisions

- **Use native `console.log/error/warn/debug`** instead of external libraries (Pino, Winston, etc.)
- **Leverage CloudWatch Logs** for persistence, search, and alerting
- **Automatic context capture** via `Error().stack` parsing and AsyncLocalStorage
- **Delete 93% of custom logging code** (4,244 → 300 lines)
- **Zero external dependencies** for logging (remove edge runtime concerns)

### Benefits

- ✅ Full stack traces in all error logs
- ✅ Automatic file/line/function capture
- ✅ Request correlation tracking via AsyncLocalStorage
- ✅ HIPAA-compliant PII sanitization
- ✅ CloudWatch structured JSON parsing
- ✅ Production sampling (1% debug, 10% info, 100% errors)
- ✅ Zero edge runtime compatibility issues
- ✅ 14x simpler codebase (300 vs 4,244 lines)

---

## Architecture Overview

### Current State (Before)

```
Application Code
    ↓
SimpleLogger (356 lines)
    ↓
Factory (101 lines)
    ↓
UniversalLogger (112 lines)
    ↓
Multiple Adapters (1,000+ lines)
    ↓
console.log(JSON.stringify(...))
    ↓
stdout → CloudWatch (already configured)
```

**Problems:**
- 4,244 lines of complex abstractions
- Error stack traces lost in JSON serialization
- No automatic context capture
- Generic log messages without location info
- Over-engineered for actual needs

### New Architecture (After)

```
Application Code
    ↓
log.error('message', error, context)
    ↓
buildLogEntry() [automatic context capture]
    ├─ Capture caller location (file:line:function)
    ├─ Get correlation ID from AsyncLocalStorage
    ├─ Serialize error with stack trace
    └─ Sanitize PII
    ↓
console.error(JSON.stringify(entry))
    ↓
stdout → CloudWatch Logs → CloudWatch Insights
```

**Improvements:**
- 300 lines total
- Full stack traces preserved
- Automatic file/line/function capture
- Correlation ID propagation
- Same CloudWatch integration

---

## Implementation Plan

### Phase 1: Create New Logger (Day 1 - 4 hours)

#### Task 1.1: Create Core Logger

**File:** `lib/logger/index.ts` (300 lines)

**Key Features:**
1. **Error Serialization** - Capture stack traces properly
2. **Caller Location** - Parse Error().stack to get file:line:function
3. **AsyncLocalStorage** - Propagate correlation ID automatically
4. **PII Sanitization** - HIPAA-compliant redaction
5. **Production Sampling** - 1% debug, 10% info in production
6. **CloudWatch-Optimized JSON** - Use @timestamp, flatten metadata

#### Task 1.2: Create Correlation Utilities

**File:** `lib/logger/correlation.ts` (200 lines)

Standalone correlation ID management:
- Generate unique correlation IDs
- AsyncLocalStorage context management
- Parent-child correlation relationships
- Metadata propagation

#### Task 1.3: Preserve Error Classes

**File:** `lib/logger/errors.ts` (150 lines)

Keep useful error classes from current `error-handler.ts`:
- `ValidationError`
- `AuthenticationError`
- `AuthorizationError`
- `NotFoundError`
- `ConflictError`
- `RateLimitError`
- `DatabaseError`

---

### Phase 2: CloudWatch Configuration (Day 1 - 2 hours)

#### Task 2.1: Update ECS Logging Configuration

**File:** `infrastructure/lib/constructs/secure-container.ts`

Add metric filters:
```typescript
this.logGroup.addMetricFilter('ErrorCount', {
  filterPattern: logs.FilterPattern.jsonValue('$.level', '=', 'ERROR'),
  metricName: 'ApplicationErrors',
  metricNamespace: 'BendCareOS',
  metricValue: '1',
});

this.logGroup.addMetricFilter('SecurityEvents', {
  filterPattern: logs.FilterPattern.jsonValue('$.component', '=', 'security'),
  metricName: 'SecurityEvents',
  metricNamespace: 'BendCareOS',
  metricValue: '1',
});

this.logGroup.addMetricFilter('SlowRequests', {
  filterPattern: logs.FilterPattern.all(
    logs.FilterPattern.jsonValue('$.duration', '>', 1000),
    logs.FilterPattern.jsonValue('$.component', '=', 'api')
  ),
  metricName: 'SlowAPIRequests',
  metricNamespace: 'BendCareOS',
  metricValue: '1',
});
```

#### Task 2.2: Create Monitoring Dashboard

**File:** `infrastructure/lib/constructs/monitoring.ts`

CloudWatch dashboard with:
- Error rate graph
- Slow request tracking
- Security event count
- Authentication failures
- Top error types (Log Insights widget)
- Log volume by level

---

### Phase 3: Update Application Code (Day 2 - 4 hours)

#### Task 3.1: Update Import Statements

**Find and replace across codebase:**

```typescript
// OLD (delete these imports):
import { createAPILogger, logAPIAuth, logSecurityEvent } from '@/lib/logger';
import { createAppLogger, loggers } from '@/lib/logger';

// NEW (replace with):
import { log, correlation } from '@/lib/logger';
```

**Files to update (~50 files):**
- All `/app/api/**/*.ts` route handlers
- Middleware files
- Service files using logger
- Test files

#### Task 3.2: Update Logging Calls

**Pattern replacements:**

```typescript
// OLD:
const logger = createAPILogger(request);
logger.info('Processing request', { data });
logger.error('Failed', error, { context });

// NEW:
log.info('Processing request', { data });
log.error('Failed', error, { context });
```

```typescript
// OLD:
logAPIAuth(logger, 'login', true, userId);

// NEW:
log.auth('login', true, { userId });
```

```typescript
// OLD:
logSecurityEvent(logger, 'suspicious_activity', 'high', { details });

// NEW:
log.security('suspicious_activity', 'high', { details });
```

#### Task 3.3: Wrap Routes with Correlation Context

**Pattern for API routes:**

```typescript
// app/api/users/route.ts

export const GET = async (request: NextRequest) => {
  return correlation.withContext(
    correlation.generate(),
    {
      method: request.method,
      path: new URL(request.url).pathname,
    },
    async () => {
      log.api('User list request started', request);

      try {
        const users = await db.select().from(usersTable);

        log.api('User list request completed', request, 200, Date.now() - startTime);
        return NextResponse.json({ users });

      } catch (error) {
        log.error('Failed to fetch users', error);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
      }
    }
  );
};
```

---

### Phase 4: Delete Old Files (Day 2 - 1 hour)

#### Files to Delete (3,944 lines total):

```bash
# Delete old logging infrastructure
rm lib/logger/simple-logger.ts          # 356 lines
rm lib/logger/universal-logger.ts       # 112 lines
rm lib/logger/factory.ts                # 101 lines
rm lib/logger/api-logger.ts             # 245 lines
rm lib/logger/api-features.ts           # 435 lines
rm lib/logger/middleware.ts             # 217 lines
rm lib/logger/production-optimizer.ts   # 537 lines
rm lib/logger/volume-manager.ts         # 625 lines
rm lib/logger/audit-optimizer.ts        # 381 lines
rm lib/logger/db-wrapper.ts             # 147 lines
rm lib/logger/debug-migration.ts        # 84 lines
rm lib/logger/metrics.ts                # 369 lines

# Optional: Keep error-handler.ts if error classes are useful
# Or migrate error classes to lib/logger/errors.ts
```

#### Files to Keep:

- `lib/logger/index.ts` (NEW - 300 lines)
- `lib/logger/correlation.ts` (NEW - 200 lines)
- `lib/logger/errors.ts` (NEW - 150 lines)

**Total new code:** 650 lines (down from 4,244)

---

### Phase 5: Testing (Day 3 - 4 hours)

#### Test 1: Local Development

```bash
# Start dev server
pnpm dev

# Make test requests
curl http://localhost:3000/api/health

# Verify logs include:
# - @timestamp
# - file, line, function
# - correlationId
# - Full stack traces on errors
```

#### Test 2: Error Logging

```typescript
// Create test error endpoint
export const GET = async () => {
  try {
    throw new Error('Test error with stack trace');
  } catch (error) {
    log.error('Test error logging', error, { testData: 'example' });
    throw error;
  }
};
```

**Verify log output includes:**
```json
{
  "@timestamp": "2025-10-02T10:00:00.000Z",
  "level": "ERROR",
  "message": "Test error logging",
  "file": "route.ts",
  "line": 15,
  "function": "GET",
  "error": {
    "name": "Error",
    "message": "Test error with stack trace",
    "stack": [
      "Error: Test error with stack trace",
      "at GET (/app/api/test/route.ts:15:11)",
      "..."
    ]
  },
  "testData": "example"
}
```

#### Test 3: Correlation Tracking

```bash
# Make request and capture correlation ID
CORRELATION_ID=$(curl -v http://localhost:3000/api/users 2>&1 | grep -i x-correlation | awk '{print $3}')

# Verify all logs have same correlation ID
grep "$CORRELATION_ID" logs/*.log
```

#### Test 4: PII Sanitization

```typescript
log.info('User data', {
  email: 'user@example.com',
  password: 'secret123',
  phone: '555-123-4567',
});

// Verify output:
// "email": "[EMAIL]"
// "password": "[REDACTED]"
// "phone": "[PHONE]"
```

#### Test 5: CloudWatch Integration (Staging)

```bash
# Deploy to staging
pnpm deploy:staging

# Make test requests
curl https://staging.bendcare.com/api/health

# Query CloudWatch Logs
aws logs filter-log-events \
  --log-group-name /ecs/bcos-staging \
  --filter-pattern '{ $.level = "ERROR" }' \
  --start-time $(date -u -d '10 minutes ago' +%s)000 \
  --limit 10
```

**Verify:**
- Logs appear in CloudWatch within 5 seconds
- JSON fields are queryable ($.level, $.file, $.correlationId)
- Metric filters are working (check CloudWatch Metrics)

---

## Log Format Specification

### Standard Log Entry

```json
{
  "@timestamp": "2025-10-02T10:30:45.123Z",
  "level": "ERROR|WARN|INFO|DEBUG",
  "message": "Human-readable message",
  "service": "bendcare-os",
  "env": "production|staging|development",

  // Automatic context capture
  "file": "route.ts",
  "line": 142,
  "function": "updateUser",

  // Request context (from AsyncLocalStorage)
  "correlationId": "cor_xyz123",
  "requestId": "req_abc456",
  "userId": "[UUID]",
  "organizationId": "[UUID]",
  "method": "POST",
  "path": "/api/users/123",
  "ipAddress": "192.168.1.1",

  // Error details (if error)
  "error": {
    "name": "PostgresError",
    "message": "Connection timeout",
    "stack": [
      "Error: Connection timeout",
      "at Database.query (/app/lib/db/client.ts:89:15)",
      "at updateUser (/app/api/users/[id]/route.ts:142:28)"
    ],
    "code": "CONNECTION_TIMEOUT"
  },

  // Additional context (sanitized)
  "operation": "update",
  "table": "users",
  "duration": 1234,

  // Component categorization
  "component": "api|database|auth|security|business-logic"
}
```

### Log Levels

| Level | Production Sampling | Use Case |
|-------|---------------------|----------|
| **ERROR** | 100% | Application errors, exceptions, failures |
| **WARN** | 100% | Potential issues, degraded performance, security warnings |
| **INFO** | 10% | Business events, successful operations, state changes |
| **DEBUG** | 1% | Detailed debugging, variable values, execution flow |

### Component Categories

- **api** - HTTP request/response logging
- **auth** - Authentication and session management
- **security** - Security events, threats, violations
- **database** - Database queries, connections, transactions
- **business-logic** - Domain-specific operations
- **integration** - External service calls
- **system** - Infrastructure, health checks, startup/shutdown

---

## CloudWatch Query Library

### Common Queries

#### 1. All Errors in Last Hour

```sql
fields @timestamp, level, message, file, line, error.message
| filter level = "ERROR"
| sort @timestamp desc
| limit 100
```

#### 2. Trace Complete Request

```sql
fields @timestamp, file, line, function, message, level
| filter correlationId = "<CORRELATION_ID>"
| sort @timestamp asc
```

#### 3. Find Slow Requests

```sql
fields @timestamp, path, method, duration, statusCode
| filter component = "api" and duration > 1000
| sort duration desc
| limit 50
```

#### 4. Security Events by Severity

```sql
fields @timestamp, event, severity, userId, ipAddress
| filter component = "security"
| stats count() by severity
| sort count desc
```

#### 5. Top Errors by Message

```sql
fields @timestamp, message, file, error.message
| filter level = "ERROR"
| stats count() by message
| sort count desc
| limit 20
```

#### 6. User Activity Timeline

```sql
fields @timestamp, message, component, operation
| filter userId = "<USER_ID>"
| sort @timestamp desc
| limit 100
```

#### 7. Database Performance

```sql
fields @timestamp, operation, table, duration
| filter component = "database"
| stats avg(duration) as avgDuration, max(duration) as maxDuration, count() as queryCount by table
| sort avgDuration desc
```

#### 8. Authentication Failures

```sql
fields @timestamp, action, userId, ipAddress, reason
| filter component = "auth" and success = false
| sort @timestamp desc
| limit 50
```

---

## Usage Examples

### Example 1: Basic Logging

```typescript
import { log } from '@/lib/logger';

// Info
log.info('Processing payment', { amount: 100, method: 'card' });

// Warning
log.warn('Rate limit approaching', { limit: 1000, remaining: 10 });

// Error (with automatic stack trace)
try {
  await riskyOperation();
} catch (error) {
  log.error('Operation failed', error, { operation: 'payment' });
  // Automatically includes:
  // - file, line, function
  // - full stack trace
  // - correlation ID (if in request context)
}

// Debug (only in development, 1% sampled in production)
log.debug('Variable state', { user, state: 'active' });
```

### Example 2: Request Context with Correlation

```typescript
import { log, correlation } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

export const POST = async (request: NextRequest) => {
  // Wrap entire request handler in correlation context
  return correlation.withContext(
    correlation.generate(),
    {
      method: request.method,
      path: new URL(request.url).pathname,
    },
    async () => {
      log.api('Create user request started', request);

      try {
        const body = await request.json();

        // Validate
        if (!body.email) {
          log.warn('Validation failed', { field: 'email', reason: 'required' });
          return NextResponse.json({ error: 'Email required' }, { status: 400 });
        }

        // Create user
        const user = await db.insert(users).values(body).returning();

        // Set user context (all subsequent logs will include userId)
        correlation.setUser(user.id);

        log.info('User created successfully', { userId: user.id });
        log.api('Create user request completed', request, 201, Date.now() - startTime);

        return NextResponse.json(user);

      } catch (error) {
        log.error('Failed to create user', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      }
    }
  );
};
```

### Example 3: Specialized Logging

```typescript
import { log } from '@/lib/logger';

// Authentication
log.auth('login', true, { userId: 'user_123', method: 'saml' });
log.auth('login', false, { email: 'user@example.com', reason: 'invalid_password' });

// Security
log.security('suspicious_activity', 'high', {
  blocked: true,
  reason: 'rate_limit_exceeded',
  ipAddress: '192.168.1.1',
});

// API
log.api('User fetch completed', request, 200, 145);
log.api('User update failed', request, 500, 2341);

// Database
log.db('SELECT', 'users', 45, { recordCount: 100 });
log.db('UPDATE', 'practices', 1234, { recordCount: 1, slow: true });
```

### Example 4: Error with Context

```typescript
try {
  const practice = await db.query.practices.findFirst({
    where: eq(practices.id, practiceId),
  });

  if (!practice) {
    throw new NotFoundError('Practice', practiceId);
  }

  await updatePractice(practice);

} catch (error) {
  // Logs automatically include:
  // - File: route.ts
  // - Line: 142
  // - Function: GET
  // - Correlation ID
  // - User ID (if set)
  // - Full stack trace
  log.error('Failed to update practice', error, {
    practiceId,
    operation: 'update',
  });
  throw error;
}
```

---

## Migration Checklist

### Pre-Migration

- [ ] Read this document completely
- [ ] Review current logging usage in codebase
- [ ] Backup current logging files (for reference)
- [ ] Test CloudWatch access (verify IAM permissions)

### Implementation

- [ ] Create `lib/logger/index.ts` (new minimal logger)
- [ ] Create `lib/logger/correlation.ts` (correlation utilities)
- [ ] Create `lib/logger/errors.ts` (error classes)
- [ ] Update `infrastructure/lib/constructs/secure-container.ts` (metric filters)
- [ ] Create `infrastructure/lib/constructs/monitoring.ts` (dashboard)
- [ ] Update all import statements in `/app/api/**/*.ts`
- [ ] Update all import statements in service files
- [ ] Wrap API routes with correlation context
- [ ] Delete old logging files (11 files)
- [ ] Update `.gitignore` if needed
- [ ] Update any tests that mock logger

### Testing

- [ ] Test locally: verify logs appear in console
- [ ] Test locally: verify stack traces are complete
- [ ] Test locally: verify PII sanitization works
- [ ] Test locally: verify correlation propagation
- [ ] Deploy to staging
- [ ] Verify CloudWatch log ingestion (within 5 seconds)
- [ ] Test CloudWatch Insights queries
- [ ] Verify metric filters are generating metrics
- [ ] Load test: verify sampling works under high traffic
- [ ] Check for any dropped logs

### Production Deployment

- [ ] Deploy infrastructure changes (CDK)
- [ ] Deploy application code
- [ ] Monitor error rates (should be stable)
- [ ] Monitor CloudWatch costs (first 24 hours)
- [ ] Verify alerts are working
- [ ] Create runbook for common debugging scenarios
- [ ] Train team on new logging patterns
- [ ] Update documentation

### Post-Migration

- [ ] Monitor for 1 week
- [ ] Gather team feedback
- [ ] Optimize sampling rates if needed
- [ ] Add additional metric filters if needed
- [ ] Create custom CloudWatch dashboard
- [ ] Document any issues encountered

---

## Cost Estimation

### CloudWatch Logs Pricing (us-east-1)

- **Ingestion:** $0.50 per GB
- **Storage:** $0.03 per GB/month
- **Insights Queries:** $0.005 per GB scanned

### Estimated Monthly Cost

**Assumptions:**
- 100,000 requests/day
- Average 3 logs per request (start, operation, end)
- Average log size: 500 bytes
- 10% info logs (sampling), 100% errors/warnings
- 90-day retention (production), 30-day (staging)

**Production:**
```
Daily volume: 100,000 req × 3 logs × 0.5 KB = 150 MB/day
Monthly ingestion: 150 MB × 30 = 4.5 GB
Sampling reduction: 4.5 GB × 0.2 (80% sampled out) = 0.9 GB actual

Ingestion: 0.9 GB × $0.50 = $0.45/month
Storage: 0.9 GB × 3 months × $0.03 = $0.08/month
Queries: ~50 queries/month × 1 GB scanned × $0.005 = $0.25/month

Total: ~$0.78/month
```

**Staging:**
```
10% of production traffic = $0.08/month
```

**Grand Total: <$1/month** (essentially free)

---

## Rollback Plan

### If Issues Occur

#### Emergency Rollback (< 5 minutes)

```bash
# Revert application code
git revert <commit-sha>
git push origin main

# Redeploy
pnpm deploy:production
```

#### Partial Rollback

Keep new logger but revert specific changes:

```typescript
// Temporarily disable correlation context
// Change from:
return correlation.withContext(id, {}, async () => {
  // ... handler code
});

// To:
// ... handler code directly (no wrapping)
```

#### Infrastructure Rollback

```bash
# Revert CDK changes
cd infrastructure
git revert <commit-sha>
pnpm cdk deploy --all
```

### Monitoring for Issues

**Watch these metrics first 24 hours:**
- Error rate (should not increase)
- Response time (should not increase)
- CloudWatch ingestion lag (should be <5 seconds)
- Application memory usage (should not increase)
- CPU usage (should not increase)

**Indicators of problems:**
- Error rate spike >10%
- Response time increase >20%
- CloudWatch lag >30 seconds
- Memory leak (gradual increase)
- Missing logs in CloudWatch

---

## Success Metrics

### Technical Metrics

- ✅ Error logs contain full stack traces (100% of errors)
- ✅ Logs include file:line:function (100% of logs)
- ✅ Correlation ID present (100% of API logs)
- ✅ CloudWatch lag <5 seconds (p99)
- ✅ Zero logging-related errors
- ✅ Codebase reduced by 3,944 lines

### Operational Metrics

- ✅ Time to debug production issue <5 minutes (vs. 30+ minutes before)
- ✅ CloudWatch query response time <2 seconds
- ✅ Zero PII leaks in logs
- ✅ Zero complaints about log usefulness
- ✅ Team adoption >90% within 2 weeks

### Business Metrics

- ✅ CloudWatch costs <$5/month
- ✅ Zero logging-related outages
- ✅ Reduced oncall burden (easier debugging)
- ✅ HIPAA audit compliance maintained

---

## FAQ

### Q: Why not use Pino or Winston?

**A:** Edge runtime compatibility is uncertain, and `console.log` + CloudWatch provides everything we need without external dependencies.

### Q: What about structured logging?

**A:** We are using structured logging - JSON output with consistent schema. CloudWatch Logs Insights can query all fields.

### Q: Will this work in edge runtime?

**A:** Yes, but AsyncLocalStorage may not work in edge. For edge functions, pass context explicitly or use request headers for correlation.

### Q: How do I trace a request across services?

**A:** Use the `correlationId` field. All logs within a request have the same ID. Query: `filter correlationId = "cor_xyz123"`

### Q: What about real-time monitoring?

**A:** Use CloudWatch metric filters + alarms. Errors are tracked in real-time and can trigger PagerDuty/SNS.

### Q: Can I add custom fields?

**A:** Yes, pass them in the context object: `log.info('message', { customField: value })`

### Q: How do I debug in production?

**A:** Use CloudWatch Insights queries. Find correlation ID from error, then query all logs for that ID.

### Q: What about log aggregation?

**A:** CloudWatch Logs is our aggregation layer. For advanced needs, can export to S3 or stream to Elasticsearch.

### Q: Is PII automatically sanitized?

**A:** Yes, passwords, emails, phone numbers, UUIDs, SSNs, credit cards are automatically redacted.

### Q: Can I disable sampling for a specific user?

**A:** Currently no, but could be added by checking user ID in sampling logic.

---

## References

### Internal Documentation

- [CloudWatch Logs Documentation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/)
- [ECS Logging Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/logging.html)
- [Next.js Logging](https://nextjs.org/docs/app/building-your-application/optimizing/logging)

### Code Locations

- **New Logger:** `lib/logger/index.ts`
- **Correlation:** `lib/logger/correlation.ts`
- **Errors:** `lib/logger/errors.ts`
- **Infrastructure:** `infrastructure/lib/constructs/secure-container.ts`
- **Monitoring:** `infrastructure/lib/constructs/monitoring.ts`

### Team Resources

- **Slack Channel:** #logging-migration
- **Documentation:** `/docs/logging_strategy.md` (this file)
- **Runbook:** `/docs/runbooks/debugging_with_cloudwatch.md` (create after migration)

---

## Approval & Sign-off

- [ ] Engineering Lead Review
- [ ] Security Team Review (PII sanitization)
- [ ] DevOps Review (CloudWatch costs)
- [ ] Compliance Review (HIPAA audit trail)

**Approved By:** _________________
**Date:** _________________

---

**END OF DOCUMENT**
