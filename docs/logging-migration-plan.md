# Logging System Migration Plan - Option C: Gradual Migration

**Status:** In Progress
**Date Started:** 2025-10-02
**Strategy:** Keep both old and new logging systems running side-by-side
**Estimated Timeline:** 2-3 weeks (careful, methodical migration)

---

## Executive Summary

We're migrating from a complex 4,244-line logging system to a simple 550-line console-based logger with CloudWatch integration. To avoid breaking anything, we're keeping **both systems running** and migrating files one at a time.

### Key Principle
> **New code uses new logger. Old code keeps working. Migrate carefully, one file at a time.**

---

## Current Status

### ✅ Completed
1. **New Logger Created** - `/lib/logger/logger.ts` (400 lines)
   - Native console-based logging
   - Automatic stack trace capture
   - File:line:function location tracking
   - AsyncLocalStorage correlation
   - HIPAA-compliant PII sanitization
   - Production sampling (1% debug, 10% info)

2. **Error Classes Created** - `/lib/logger/errors.ts` (100 lines)
   - ValidationError (400)
   - AuthenticationError (401)
   - AuthorizationError (403)
   - NotFoundError (404)
   - ConflictError (409)
   - RateLimitError (429)
   - DatabaseError (500)

3. **Edge Runtime Fixes**
   - Fixed `lib/logger/audit-optimizer.ts:372` - Added `typeof process.on === 'function'` check
   - Fixed `lib/db/index.ts:105` - Added `typeof process.on === 'function'` check

4. **Index File Updated** - `/lib/logger/index.ts`
   - Exports both OLD and NEW APIs
   - Old code continues working
   - New code can use `log` and `correlation`

5. **Feature Branch Created** - `feat/logging-simplification`

### 🔄 In Progress
- Manual migration of 101 files from old API to new API
- Careful testing after each file migration

### ⏸ Not Started
- CloudWatch metric filter configuration
- Deletion of old logging files (will do LAST, after all migrations complete)
- Production deployment

---

## The Two Logging APIs

### OLD API (4,244 lines - being phased out)
```typescript
import { createAPILogger, logDBOperation, logPerformanceMetric } from '@/lib/logger';

const apiLogger = createAPILogger();
apiLogger.logRequest(req);
apiLogger.logAuth('login', true, { userId });

logDBOperation('SELECT', 'users', 45, { query: '...' });
logPerformanceMetric('db_query', 45, { table: 'users' });
```

### NEW API (550 lines - use for new code)
```typescript
import { log, correlation } from '@/lib/logger';

// Simple, direct logging
log.info('User created', { userId });
log.error('Failed to save', error, { context: 'user_service' });

// Specialized logging
log.auth('login', true, { userId });
log.security('suspicious_activity', 'high', { details });
log.api('Request completed', request, 200, duration);
log.db('SELECT', 'users', duration);

// Request correlation
await correlation.withContext(
  correlation.generate(),
  {},
  async () => {
    // All logs here share same correlation ID
    log.info('Processing request');
  }
);
```

---

## Migration Process

### Phase 1: Preparation (COMPLETED ✅)
- [x] Create new logger implementation
- [x] Create error classes
- [x] Fix edge runtime compatibility issues
- [x] Update index.ts to export both APIs
- [x] Create feature branch
- [x] Document migration plan

### Phase 2: Gradual File Migration (IN PROGRESS 🔄)

**Process for each file:**
1. Read the file carefully
2. Identify all old logger usage
3. Update imports to use new API
4. Replace old function calls with new equivalents
5. Test the file (run pnpm tsc)
6. Commit if working
7. Move to next file

**Priority Order:**
1. Critical authentication routes (`/app/api/auth/**`)
2. API middleware (`/lib/api/middleware/**`)
3. Core services (`/lib/api/services/**`)
4. Other API routes (`/app/api/**`)
5. Utility files (`/lib/**`)

**Files to Migrate:** 101 files total

### Phase 3: Testing & Validation (NOT STARTED ⏸)
- [ ] Run full test suite
- [ ] Test locally with real requests
- [ ] Verify stack traces appear in logs
- [ ] Verify correlation IDs work
- [ ] Test PII sanitization
- [ ] Load test to verify performance

### Phase 4: Infrastructure Updates (NOT STARTED ⏸)
- [ ] Update CloudWatch metric filters
- [ ] Configure log retention policies
- [ ] Set up CloudWatch Insights queries
- [ ] Update monitoring dashboards

### Phase 5: Cleanup (NOT STARTED ⏸)
- [ ] Delete old logging files (11 files)
- [ ] Remove old API exports from index.ts
- [ ] Update documentation
- [ ] Final test suite run

### Phase 6: Deployment (NOT STARTED ⏸)
- [ ] Deploy to staging
- [ ] Monitor for 48 hours
- [ ] Deploy to production
- [ ] Monitor for 1 week

---

## File Migration Tracking

### Files Migrated: 0 / 101

**Critical Auth Routes (Priority 1):**
- [ ] `/app/api/auth/login/route.ts`
- [ ] `/app/api/auth/logout/route.ts`
- [ ] `/app/api/auth/refresh/route.ts`
- [ ] `/app/api/auth/sessions/route.ts`
- [ ] `/app/api/auth/saml/callback/route.ts`
- [ ] `/app/api/auth/saml/login/route.ts`
- [ ] `/app/api/auth/saml/metadata/route.ts`

**API Middleware (Priority 2):**
- [ ] `/lib/api/middleware/csrf-validation.ts`
- [ ] `/lib/api/middleware/global-auth.ts`
- [ ] `/lib/api/middleware/jwt-auth.ts`
- [ ] `/lib/api/middleware/request-sanitization.ts`

**Core Services (Priority 3):**
- [ ] `/lib/api/services/audit.ts`
- [ ] `/lib/api/services/email.ts`
- [ ] `/lib/api/services/session.ts`
- [ ] `/lib/api/services/upload.ts`

**Analytics Routes (Priority 4):**
- [ ] `/app/api/admin/analytics/categories/route.ts`
- [ ] `/app/api/admin/analytics/charges-payments/route.ts`
- [ ] `/app/api/admin/analytics/charts/route.ts`
- [ ] `/app/api/admin/analytics/charts/[chartId]/route.ts`
- [ ] `/app/api/admin/analytics/config/data-sources/route.ts`
- [ ] `/app/api/admin/analytics/dashboards/route.ts`
- [ ] `/app/api/admin/analytics/dashboards/[dashboardId]/route.ts`
- [ ] `/app/api/admin/analytics/data-sources/route.ts`
- [ ] `/app/api/admin/analytics/debug/route.ts`
- [ ] `/app/api/admin/analytics/explore/route.ts`
- [ ] `/app/api/admin/analytics/favorites/route.ts`
- [ ] `/app/api/admin/analytics/measures/route.ts`
- [ ] `/app/api/admin/analytics/practices/route.ts`
- [ ] `/app/api/admin/analytics/schema/route.ts`
- [ ] `/app/api/admin/analytics/system/route.ts`
- [ ] `/app/api/admin/analytics/users/route.ts`

**Data Source Routes (Priority 4):**
- [ ] `/app/api/admin/data-sources/route.ts`
- [ ] `/app/api/admin/data-sources/[id]/route.ts`
- [ ] `/app/api/admin/data-sources/[id]/columns/route.ts`
- [ ] `/app/api/admin/data-sources/[id]/columns/[columnId]/route.ts`
- [ ] `/app/api/admin/data-sources/[id]/introspect/route.ts`
- [ ] `/app/api/admin/data-sources/[id]/test/route.ts`

**Other API Routes (Priority 4):**
- [ ] `/app/api/appointments/route.ts`
- [ ] `/app/api/contact/route.ts`
- [ ] `/app/api/csrf/route.ts`
- [ ] `/app/api/csrf/validate/route.ts`
- [ ] `/app/api/health/route.ts`
- [ ] `/app/api/practices/[id]/attributes/route.ts`
- [ ] `/app/api/practices/[id]/staff/route.ts`
- [ ] `/app/api/practices/[id]/staff/[staffId]/route.ts`
- [ ] `/app/api/practices/[id]/staff/reorder/route.ts`
- [ ] `/app/api/search/route.ts`
- [ ] `/app/api/security/csp-report/route.ts`
- [ ] `/app/api/upload/route.ts`
- [ ] `/app/api/users/route.ts`
- [ ] `/app/api/users/[id]/route.ts`

**Library Files (Priority 5):**
- [ ] `/lib/auth/cleanup.ts`
- [ ] `/lib/auth/jwt.ts`
- [ ] `/lib/auth/security.ts`
- [ ] `/lib/auth/token-manager.ts`
- [ ] `/lib/cache/cache-warmer.ts`
- [ ] `/lib/cache/role-permission-cache.ts`
- [ ] `/lib/db/rbac-seed.ts`
- [ ] `/lib/db/seed.ts`
- [ ] `/lib/hooks/use-published-dashboards.ts`
- [ ] `/lib/rbac/cache-invalidation.ts`
- [ ] `/lib/rbac/cached-user-context.ts`
- [ ] `/lib/rbac/user-context.ts`
- [ ] `/lib/saml/client.ts`
- [ ] `/lib/saml/config.ts`
- [ ] `/lib/saml/input-validator.ts`
- [ ] `/lib/saml/metadata-fetcher.ts`
- [ ] `/lib/saml/replay-prevention.ts`
- [ ] `/lib/security/csrf-monitoring-refactored.ts`
- [ ] `/lib/security/csrf-unified.ts`
- [ ] `/lib/services/advanced-permissions.ts`
- [ ] `/lib/services/analytics-cache.ts`
- [ ] `/lib/services/analytics-db.ts`
- [ ] `/lib/services/analytics-query-builder.ts`
- [ ] `/lib/services/bulk-chart-operations.ts`
- [ ] `/lib/services/chart-config-service.ts`
- [ ] `/lib/services/chart-executor.ts`
- [ ] `/lib/services/chart-refresh-scheduler.ts`
- [ ] `/lib/services/chart-validation.ts`
- [ ] `/lib/services/rbac-charts-service.ts`
- [ ] `/lib/services/rbac-dashboards-service.ts`
- [ ] `/lib/services/rbac-data-sources-service.ts`
- [ ] `/lib/services/rbac-users-service.ts`
- [ ] `/lib/services/usage-analytics.ts`
- [ ] `/lib/utils/cache-monitor.ts`
- [ ] `/lib/utils/debug.ts`
- [ ] `/lib/utils/simplified-chart-transformer.ts`
- [ ] `/lib/api/rbac-route-handler.ts`
- [ ] `/middleware.ts`

**Documentation Files:**
- [ ] `/docs/logging_strategy.md` (reference only)
- [ ] `/docs/LOGGING_IMPLEMENTATION_SUMMARY.md` (reference only)

---

## Old API → New API Mapping

### Basic Logging
| Old API | New API |
|---------|---------|
| `createAppLogger()` | Use `log` directly |
| `logger.info(msg, ctx)` | `log.info(msg, ctx)` |
| `logger.warn(msg, ctx)` | `log.warn(msg, ctx)` |
| `logger.error(msg, err, ctx)` | `log.error(msg, err, ctx)` |
| `logger.debug(msg, ctx)` | `log.debug(msg, ctx)` |

### API Logging
| Old API | New API |
|---------|---------|
| `createAPILogger()` | Use `log` directly |
| `apiLogger.logRequest(req)` | `log.api('Request', req, 0, 0)` |
| `apiLogger.logResponse(req, status)` | `log.api('Response', req, status, duration)` |
| `logAPIAuth(event, success, ctx)` | `log.auth(event, success, ctx)` |
| `logSecurityEvent(event, sev, ctx)` | `log.security(event, sev, ctx)` |

### Database & Performance
| Old API | New API |
|---------|---------|
| `logDBOperation(op, table, dur, ctx)` | `log.db(op, table, dur, ctx)` |
| `logPerformanceMetric(name, val, ctx)` | `log.info('Performance: '+name, {duration: val, ...ctx})` |

### Correlation
| Old API | New API |
|---------|---------|
| `withCorrelation(handler)` | `correlation.withContext(id, {}, handler)` |
| `CorrelationContextManager` | `correlation` |

### Error Handling
| Old API | New API |
|---------|---------|
| `throw new ValidationError(msg)` | `throw new ValidationError(msg, ctx)` |
| `logValidationError(msg, ctx)` | `throw new ValidationError(msg, ctx)` or `log.warn('Validation: '+msg, ctx)` |

---

## Migration Example

### Before (Old API):
```typescript
import {
  createAPILogger,
  logDBOperation,
  logPerformanceMetric,
  withCorrelation,
  CorrelationContextManager
} from '@/lib/logger';

const apiLogger = createAPILogger();

export async function GET(request: NextRequest) {
  const correlationId = CorrelationContextManager.generate();

  return withCorrelation(correlationId, async () => {
    const startTime = Date.now();
    apiLogger.logRequest(request);

    logDBOperation('SELECT', 'users', 45);
    const users = await db.select().from(users);

    const duration = Date.now() - startTime;
    logPerformanceMetric('get_users', duration);

    apiLogger.logResponse(request, 200);
    return NextResponse.json(users);
  });
}
```

### After (New API):
```typescript
import { log, correlation } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const correlationId = correlation.generate();

  return correlation.withContext(correlationId, {}, async () => {
    const startTime = Date.now();
    log.api('GET /users - Request received', request, 0, 0);

    const dbStart = Date.now();
    const users = await db.select().from(users);
    log.db('SELECT', 'users', Date.now() - dbStart);

    const duration = Date.now() - startTime;
    log.api('GET /users - Success', request, 200, duration);

    return NextResponse.json(users);
  });
}
```

---

## Benefits of New Logger

### Developer Experience
- ✅ **87% less code** to maintain (4,244 → 550 lines)
- ✅ **Automatic context capture** - no manual file/line tracking
- ✅ **Full stack traces** in error logs
- ✅ **Simple API** - just use `log.*` methods
- ✅ **No conditional imports** - works in Node.js and Edge

### Operational Benefits
- ✅ **CloudWatch native** - stdout → CloudWatch (already configured)
- ✅ **Correlation tracking** - trace requests across services
- ✅ **HIPAA compliant** - automatic PII sanitization
- ✅ **Production sampling** - reduce log volume (1% debug, 10% info)
- ✅ **Cost effective** - <$1/month CloudWatch costs

### Debugging Benefits
- ✅ **Rich error logs** - full stack + context + correlation
- ✅ **Easy queries** - CloudWatch Insights with correlation ID
- ✅ **Fast debugging** - from "unknown error" to "line 142 in route.ts"

---

## Rollback Plan

If anything breaks during migration:

### Immediate Rollback (< 2 minutes)
```bash
git checkout main
git revert HEAD
git push origin feat/logging-simplification
```

### Partial Rollback
Keep the new logger files but revert specific file migrations that have issues.

---

## Success Metrics

### Technical Metrics (After Full Migration)
- ✅ 100% of errors have full stack traces
- ✅ 100% of logs include file:line:function
- ✅ All API requests have correlation IDs
- ✅ Zero logging-related errors
- ✅ 87% reduction in logging code

### Operational Metrics
- ✅ Time to debug issues: 5 minutes (vs 30+ minutes before)
- ✅ CloudWatch query time: <2 seconds
- ✅ Zero PII leaks
- ✅ Log costs: <$1/month

---

## Next Steps

1. **Start migrating critical auth routes** (7 files)
2. **Test each file after migration**
3. **Run pnpm tsc after every 5-10 files**
4. **Commit working batches**
5. **Continue methodically through priority list**
6. **Update this document with progress**

---

**Last Updated:** 2025-10-02
**Current Progress:** 0 / 101 files migrated (0%)
