# Logging Migration Progress Report

**Last Updated:** 2025-10-02
**Token Usage:** 109K / 200K (54.5%)
**Files Migrated:** 2 / 101
**Lines Migrated:** 778 / ~40,000 (estimated)

---

## ✅ Completed (2 files)

### 1. app/api/auth/login/route.ts (469 lines)
**Status:** ✅ Fully migrated and tested
**Complexity:** High (complex authentication flow with multiple logging points)

**Changes Made:**
- Removed imports: `createAPILogger`, `logAPIAuth`, `logDBOperation`, `logSecurityEvent`, `logPerformanceMetric`, `withCorrelation`, `CorrelationContextManager`
- Added imports: `log`, `correlation`
- Replaced 40+ old logger calls with new API
- Fixed correlation.getContext() → correlation.current()
- Updated withCorrelation wrapper to use correlation.withContext()

**TypeScript:** ✅ Clean
**Lint:** ✅ Clean

### 2. app/api/auth/logout/route.ts (309 lines)
**Status:** ✅ Fully migrated and tested
**Complexity:** Medium (token revocation and cookie cleanup)

**Changes Made:**
- Removed imports: `BufferedAuditLogger`, `logger`, `createAPILogger`
- Added import: `log`
- Replaced apiLogger calls in POST and DELETE methods
- Simplified error logging

**TypeScript:** ✅ Clean
**Lint:** ✅ Clean

---

## 🔄 In Progress (0 files)

None currently

---

## ⏸ Pending (99 files, ~39,000 lines)

### Critical Auth Routes (5 files, 1,702 lines)
- [ ] app/api/auth/refresh/route.ts (385 lines)
- [ ] app/api/auth/sessions/route.ts (254 lines)
- [ ] app/api/auth/saml/callback/route.ts (754 lines) - **LARGE**
- [ ] app/api/auth/saml/login/route.ts (201 lines)
- [ ] app/api/auth/saml/metadata/route.ts (108 lines)

### Middleware (4 files, est. ~400 lines)
- [ ] lib/api/middleware/csrf-validation.ts
- [ ] lib/api/middleware/global-auth.ts
- [ ] lib/api/middleware/jwt-auth.ts
- [ ] lib/api/middleware/request-sanitization.ts

### Services (4 files, est. ~800 lines)
- [ ] lib/api/services/audit.ts
- [ ] lib/api/services/email.ts
- [ ] lib/api/services/session.ts
- [ ] lib/api/services/upload.ts

### Analytics Routes (16 files, est. ~2,500 lines)
- [ ] app/api/admin/analytics/categories/route.ts
- [ ] app/api/admin/analytics/charges-payments/route.ts
- [ ] app/api/admin/analytics/charts/route.ts
- [ ] app/api/admin/analytics/charts/[chartId]/route.ts
- [ ] app/api/admin/analytics/config/data-sources/route.ts
- [ ] app/api/admin/analytics/dashboards/route.ts
- [ ] app/api/admin/analytics/dashboards/[dashboardId]/route.ts
- [ ] app/api/admin/analytics/data-sources/route.ts
- [ ] app/api/admin/analytics/debug/route.ts
- [ ] app/api/admin/analytics/explore/route.ts
- [ ] app/api/admin/analytics/favorites/route.ts
- [ ] app/api/admin/analytics/measures/route.ts
- [ ] app/api/admin/analytics/practices/route.ts
- [ ] app/api/admin/analytics/schema/route.ts
- [ ] app/api/admin/analytics/system/route.ts
- [ ] app/api/admin/analytics/users/route.ts

### Data Source Routes (6 files, est. ~900 lines)
- [ ] app/api/admin/data-sources/route.ts
- [ ] app/api/admin/data-sources/[id]/route.ts
- [ ] app/api/admin/data-sources/[id]/columns/route.ts
- [ ] app/api/admin/data-sources/[id]/columns/[columnId]/route.ts
- [ ] app/api/admin/data-sources/[id]/introspect/route.ts
- [ ] app/api/admin/data-sources/[id]/test/route.ts

### Other API Routes (14 files, est. ~2,000 lines)
- [ ] app/api/appointments/route.ts
- [ ] app/api/contact/route.ts
- [ ] app/api/csrf/route.ts
- [ ] app/api/csrf/validate/route.ts
- [ ] app/api/health/route.ts
- [ ] app/api/practices/[id]/attributes/route.ts
- [ ] app/api/practices/[id]/staff/route.ts
- [ ] app/api/practices/[id]/staff/[staffId]/route.ts
- [ ] app/api/practices/[id]/staff/reorder/route.ts
- [ ] app/api/search/route.ts
- [ ] app/api/security/csp-report/route.ts
- [ ] app/api/upload/route.ts
- [ ] app/api/users/route.ts
- [ ] app/api/users/[id]/route.ts

### Library Files (45 files, est. ~15,000 lines)
**Auth (4 files):**
- [ ] lib/auth/cleanup.ts
- [ ] lib/auth/jwt.ts
- [ ] lib/auth/security.ts
- [ ] lib/auth/token-manager.ts

**Cache (2 files):**
- [ ] lib/cache/cache-warmer.ts
- [ ] lib/cache/role-permission-cache.ts

**Database (2 files):**
- [ ] lib/db/rbac-seed.ts
- [ ] lib/db/seed.ts

**RBAC (4 files):**
- [ ] lib/rbac/cache-invalidation.ts
- [ ] lib/rbac/cached-user-context.ts
- [ ] lib/rbac/user-context.ts
- [ ] lib/rbac/permission-checker.ts

**SAML (5 files):**
- [ ] lib/saml/client.ts
- [ ] lib/saml/config.ts
- [ ] lib/saml/input-validator.ts
- [ ] lib/saml/metadata-fetcher.ts
- [ ] lib/saml/replay-prevention.ts

**Security (2 files):**
- [ ] lib/security/csrf-monitoring-refactored.ts
- [ ] lib/security/csrf-unified.ts

**Services (14 files):**
- [ ] lib/services/advanced-permissions.ts
- [ ] lib/services/analytics-cache.ts
- [ ] lib/services/analytics-db.ts
- [ ] lib/services/analytics-query-builder.ts
- [ ] lib/services/chart-config-service.ts
- [ ] lib/services/chart-executor.ts
- [ ] lib/services/chart-refresh-scheduler.ts
- [ ] lib/services/chart-validation.ts
- [ ] lib/services/rbac-charts-service.ts
- [ ] lib/services/rbac-dashboards-service.ts
- [ ] lib/services/rbac-data-sources-service.ts
- [ ] lib/services/rbac-users-service.ts
- [ ] lib/services/usage-analytics.ts

**Utils (3 files):**
- [ ] lib/utils/cache-monitor.ts
- [ ] lib/utils/debug.ts
- [ ] lib/utils/simplified-chart-transformer.ts

**Other (3 files):**
- [ ] lib/api/rbac-route-handler.ts
- [ ] lib/hooks/use-published-dashboards.ts
- [ ] middleware.ts

---

## Migration Pattern (Proven & Tested)

### Import Replacements

**REMOVE these imports:**
```typescript
import { createAPILogger } from '@/lib/logger/api-features'
import {
  logAPIAuth,
  logAPIRequest,
  logAPIResponse,
  logDBOperation,
  logPerformanceMetric,
  logSecurityEvent,
  logRateLimit,
  logValidationError,
  withCorrelation,
  CorrelationContextManager
} from '@/lib/logger'
import { logger } from '@/lib/logger'
import { BufferedAuditLogger } from '@/lib/logger'
```

**ADD these imports:**
```typescript
import { log, correlation } from '@/lib/logger'
// Keep AuditLogger:
import { AuditLogger } from '@/lib/logger'
```

### Code Replacements

| Old Pattern | New Pattern |
|------------|-------------|
| `const apiLogger = createAPILogger(request, 'context')` | Remove (use `log` directly) |
| `const logger = apiLogger.getLogger()` | Remove |
| `apiLogger.logRequest({ ... })` | `log.api('METHOD /path - Request', request, 0, 0)` |
| `apiLogger.logResponse(200, { ... })` | `log.api('METHOD /path - Success', request, 200, duration)` |
| `apiLogger.logAuth(event, success, ctx)` | `log.auth(event, success, ctx)` |
| `apiLogger.logSecurity(event, sev, ctx)` | `log.security(event, sev, ctx)` |
| `logDBOperation(logger, op, table, start, count)` | `log.db(op, table, Date.now() - start, { rowCount: count })` |
| `logPerformanceMetric(logger, name, dur)` | `log.info(name, { duration: dur })` |
| `logger.info(msg, ctx)` | `log.info(msg, ctx)` |
| `logger.warn(msg, ctx)` | `log.warn(msg, ctx)` |
| `logger.error(msg, err, ctx)` | `log.error(msg, err, ctx)` |
| `logger.debug(msg, ctx)` | `log.debug(msg, ctx)` |
| `withCorrelation(handler)` | `async (req) => correlation.withContext(correlation.generate(), {}, () => handler(req))` |
| `CorrelationContextManager.getCurrentId()` | `correlation.current()` |
| `BufferedAuditLogger` | `AuditLogger` |

### Common Patterns in Route Files

**1. Request Logging:**
```typescript
// OLD:
const apiLogger = createAPILogger(request, 'context')
apiLogger.logRequest({ authType: 'session' })

// NEW:
log.api('POST /api/path - Request received', request, 0, 0)
```

**2. Performance Timing:**
```typescript
// OLD:
const startTime = Date.now()
await someOperation()
logPerformanceMetric(logger, 'operation_name', Date.now() - startTime)

// NEW:
const startTime = Date.now()
await someOperation()
log.info('Operation completed', { duration: Date.now() - startTime })
```

**3. Response Logging:**
```typescript
// OLD:
apiLogger.logResponse(200, { recordCount: 1 })
return response

// NEW:
log.api('POST /api/path - Success', request, 200, Date.now() - startTime)
return response
```

**4. Error Handling:**
```typescript
// OLD:
} catch (error) {
  logger.error('Operation failed', error)
  apiLogger.logResponse(500, {}, error)
  return createErrorResponse(...)
}

// NEW:
} catch (error) {
  log.error('Operation failed', error)
  log.api('POST /api/path - Error', request, 500, Date.now() - startTime)
  return createErrorResponse(...)
}
```

**5. Correlation Wrapper:**
```typescript
// OLD:
export const POST = withCorrelation(async (request) => {
  // handler code
})

// NEW:
export const POST = async (request: NextRequest) => {
  const correlationId = correlation.generate()
  return correlation.withContext(correlationId, {}, async () => {
    // handler code
  })
}
```

---

## Quick Migration Script (sed-based for simple files)

**⚠️ WARNING:** Only use on simple files. Complex files like login.ts need manual migration.

```bash
# Backup first
cp file.ts file.ts.backup

# Update imports
sed -i '' '/createAPILogger.*api-features/d' file.ts
sed -i '' '/BufferedAuditLogger/d' file.ts
sed -i '' 's/import { logger }/import { log }/g' file.ts

# Add new import if needed
# Manually add: import { log, correlation } from '@/lib/logger'

# Simple replacements
sed -i '' 's/logger\.info/log.info/g' file.ts
sed -i '' 's/logger\.warn/log.warn/g' file.ts
sed -i '' 's/logger\.error/log.error/g' file.ts
sed -i '' 's/logger\.debug/log.debug/g' file.ts

# Check result
pnpm tsc --noEmit 2>&1 | grep file.ts
```

---

## Testing Strategy

After each file migration:
1. **Run TypeScript:** `pnpm tsc --noEmit 2>&1 | grep filename`
2. **Run Lint:** `pnpm lint 2>&1 | grep filename`
3. **Fix errors:** Address any TypeScript/lint issues
4. **Batch check:** After every 5-10 files, run full `pnpm tsc --noEmit`

Before committing:
1. **Full TypeScript check:** `pnpm tsc --noEmit`
2. **Full lint check:** `pnpm lint`
3. **Test locally:** Start dev server and test critical flows

---

## Files Already Clean (No Migration Needed)

None identified yet.

---

## Known Issues & Solutions

### Issue 1: correlation.getContext() doesn't exist
**Error:** `Property 'getContext' does not exist`
**Solution:** Use `correlation.current()` instead

### Issue 2: log.error() signature
**Old:** `logger.error(msg, { error })`
**New:** `log.error(msg, error, { context })` - error is second param

### Issue 3: apiLogger complex methods
Some files use `apiLogger.withUser()` or other methods not in new API.
**Solution:** Remove chaining, use direct `log.*` calls with context

---

## Commit Strategy

**Batches:**
1. Commit after completing auth routes (7 files)
2. Commit after middleware (4 files)
3. Commit after services (4 files)
4. Commit after each category of API routes
5. Commit after library files in groups

**Commit Message Template:**
```
Migrate [category] to new logger API

- Migrated X files to simplified log/correlation API
- Replaced createAPILogger with direct log calls
- Updated correlation wrapper pattern
- All TypeScript/lint checks passing

Files changed:
- path/to/file1.ts
- path/to/file2.ts
```

---

## Next Steps

1. **Continue with remaining auth routes** (5 files, 1,702 lines)
2. **Migrate middleware** (4 files, simpler)
3. **Migrate services** (4 files, moderate complexity)
4. **Batch migrate analytics routes** (16 files, similar patterns)
5. **Continue with remaining categories**

---

## Estimated Completion

**At current pace:**
- Time per file: ~5-10 minutes for simple, ~20 minutes for complex
- Complex files remaining: ~20 files (~400 minutes = 6.7 hours)
- Simple files remaining: ~79 files (~400 minutes = 6.7 hours)
- **Total estimated time: 13-15 hours of focused work**

**Recommended approach:**
- Migrate in batches of 10-15 files
- Take breaks between batches
- Run full test suite after each major category
- Deploy to staging after all migrations complete

---

## Success Criteria

- ✅ All 101 files migrated
- ✅ `pnpm tsc --noEmit` shows 0 errors (or baseline 3 errors)
- ✅ `pnpm lint` shows only pre-existing warnings
- ✅ Application starts without errors
- ✅ All API routes respond correctly
- ✅ Logs include stack traces and file:line:function
- ✅ Correlation IDs appear in logs
- ✅ PII is properly sanitized

---

**Progress: 2% complete (2/101 files migrated)**
