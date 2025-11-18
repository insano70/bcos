# Rate Limiting - Simple Fix

**Problem**: Login takes 20 ticks, dashboard refresh takes 30+ ticks. Limits are too high (200) to compensate.

**Solution**: Stop counting unnecessary requests, batch what we can.

---

## Request Identifier Strategy

- **Issue**: The prior limiter trusted `x-forwarded-for`, allowing any client to spoof their IP and bypass limits. We also had to maintain allow-lists of proxy IPs as they rotated.
- **Fix**: The limiter now keys off `NextRequest.ip`, which Next.js derives from the actual connection (ALB/Edge). If the runtime is unavailable, we fall back to infrastructure-populated headers (`x-real-ip`, `cf-connecting-ip`, etc.) before defaulting to `anonymous`.
- **Benefit**: No proxy maintenance, no spoofing via user-controlled headers, and the change is contained to `getRateLimitKey()` so every caller benefits automatically.

---

## Analysis: What's Being Double-Counted?

### Issue 1: Login Flow (10-15 requests)

**Current Flow**:
1. `/api/auth/login` - ✅ **NEEDS rate limit** (password attempt)
2. Subsequent MFA/session calls - ❌ **DUPLICATE** (already verified via password)

**Finding**:
- Line 31 in `login/route.ts`: `await applyRateLimit(request, 'auth')`
- Line 377: `rateLimit: 'auth'` - **DOUBLE COUNTED!**

**What's Happening**:
1. Handler manually calls `applyRateLimit(request, 'auth')` (line 31)
2. publicRoute wrapper ALSO applies rate limit (line 377: `rateLimit: 'auth'`)
3. **Every login attempt counts TWICE!**

**Same Pattern Found in**:
- `/api/auth/mfa/verify` - lines 39 & 189
- `/api/auth/mfa/skip` - lines 42 & 161
- `/api/auth/mfa/register/complete` - lines 40 & 226
- `/api/auth/logout` - lines 60, 219 (THREE rate limit checks!)
- `/api/auth/refresh` - line 30

**Fix**: Remove manual `applyRateLimit()` calls - let the wrapper handle it.

---

### Issue 2: `/api/auth/me` Called on Every Page Load + Wrong Limit

**When It's Called**:
1. **App initialization** - Line 196 in `rbac-auth-provider.tsx`: `checkSession()`
2. **After login** - Line 155: `fetchUserContext()`
3. **On navigation** - Line 140: `loadUserContext()` when user changes

**Current**:
```typescript
// app/api/auth/me/route.ts
export const GET = authRoute(handler, { rateLimit: 'api' }); // 200/min limit
```

**Problems**:
1. Called 3+ times during normal flow (initialization, login, navigation)
2. Counts against API limit (200/min) even though it's just session verification
3. User already authenticated - limiting session reads wastes quota

**Security Concern**:
❓ "If we remove rate limiting, doesn't that make it susceptible to attack?"

**Analysis**:
- ✅ **Already protected**: `authRoute()` validates JWT token (rejects invalid/expired immediately)
- ✅ **Global IP limit** still applies (middleware)
- ✅ **Fast operation**: JWT verification ~1ms, response is cached
- ⚠️ **Risk**: Attacker with valid JWT could spam requests

**Solution**: Use a **separate, higher limit** for authenticated session reads.

**New Rate Limit Category**:
```typescript
session_read: { limit: 500, windowSeconds: 60 }  // 500/min - high but not unlimited
```

**Rationale**:
- **Legitimate use**: 3+ calls per page load across many pages/hour
- **Attack surface**: LOW - requires valid JWT (already authenticated)
- **Performance**: Fast (~1ms JWT verify, cached response)
- **500/min** = ~8/sec = reasonable for single user, prevents abuse

**Affected Routes**:
- `/api/auth/me` - session info (called on every page load)
- `/api/auth/sessions` - session management (GET only)
- `/api/auth/mfa/credentials` - list credentials (GET only)

**Fix**: Create new `session_read` category with higher limit.

---

### Issue 3: Dashboard Loading (30+ requests)

**Current**:
```typescript
// Each chart makes individual API call
fetch('/api/admin/analytics/chart-data?chartId=1'); // tick 1
fetch('/api/admin/analytics/chart-data?chartId=2'); // tick 2
// ... 10 charts = 10 ticks
```

**We Already Have a Batch Endpoint**:
```typescript
// app/api/admin/analytics/dashboard/[dashboardId]/render/route.ts
POST /api/admin/analytics/dashboard/123/render
```

**Problem**: Frontend isn't using it!

**Fix**: Update dashboard component to use batch endpoint.

---

### Issue 4: Health Checks Counting Against Limits

**Current**:
```typescript
// app/api/health/route.ts
export const GET = publicRoute(handler, 'Health check', { rateLimit: 'api' });
```

**Problem**: Monitoring tools hit health checks every 30 seconds. This consumes rate limit for no security benefit.

**Fix**: Don't rate limit health checks.

---

## Simple Implementation Plan

### Phase 0: Add New Rate Limit Category (10 min)

**Add to** `lib/api/middleware/rate-limit.ts`:

```typescript
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  auth: {
    limit: 20, // 20 auth attempts per 15 minutes
    windowSeconds: 15 * 60,
  },
  mfa: {
    limit: 5, // 5 MFA attempts per 15 minutes
    windowSeconds: 15 * 60,
  },
  upload: {
    limit: 10, // 10 uploads per minute
    windowSeconds: 60,
  },
  api: {
    limit: 200, // 200 requests per minute
    windowSeconds: 60,
  },
  session_read: {  // NEW: High limit for authenticated session reads
    limit: 500, // 500 requests per minute
    windowSeconds: 60,
  },
};
```

**Update TypeScript type**:
```typescript
export async function applyRateLimit(
  request: Request,
  type: 'auth' | 'api' | 'upload' | 'mfa' | 'session_read' = 'api'  // Add 'session_read'
): Promise<{...}> {
  // ... existing code
}
```

---

### Phase 1: Remove Double-Counting (30 min)

**Fix These Files**:

1. `app/api/auth/login/route.ts`
   - ❌ Remove line 31: `await applyRateLimit(request, 'auth');`
   - ✅ Keep line 377: `rateLimit: 'auth'`

2. `app/api/auth/mfa/verify/route.ts`
   - ❌ Remove line 39: `await applyRateLimit(request, 'mfa');`
   - ✅ Keep line 189: `rateLimit: 'auth'`

3. `app/api/auth/mfa/skip/route.ts`
   - ❌ Remove line 42: `await applyRateLimit(request, 'auth');`
   - ✅ Keep line 161: `rateLimit: 'auth'`

4. `app/api/auth/mfa/register/complete/route.ts`
   - ❌ Remove line 40: `await applyRateLimit(request, 'mfa');`
   - ✅ Keep line 226: `rateLimit: 'auth'`

5. `app/api/auth/logout/route.ts`
   - ❌ Remove line 60: `await applyRateLimit(request, 'auth');`
   - ❌ Remove line 219: `await applyRateLimit(request, 'auth');`
   - (No wrapper rate limit - add one)

6. `app/api/auth/refresh/route.ts`
   - ❌ Remove line 30: `await applyRateLimit(request, 'auth');`
   - (Check if wrapper has rate limit)

**Result**: Login flow goes from 20+ ticks to ~10 ticks (50% reduction).

---

### Phase 2: Apply session_read Limit to Authenticated Reads (15 min)

**Fix These Files**:

1. `app/api/auth/me/route.ts`
   ```typescript
   // Before
   export const GET = authRoute(handler, { rateLimit: 'api' });

   // After
   export const GET = authRoute(handler, { rateLimit: 'session_read' });
   ```

2. `app/api/auth/sessions/route.ts`
   ```typescript
   // Before
   export const GET = authRoute(handler, { rateLimit: 'api' });

   // After
   export const GET = authRoute(handler, { rateLimit: 'session_read' });
   // Keep POST/DELETE with 'api' limit (state-changing operations)
   ```

3. `app/api/auth/mfa/credentials/route.ts`
   ```typescript
   // Before
   export const GET = authRoute(handler, { rateLimit: 'api' });

   // After
   export const GET = authRoute(handler, { rateLimit: 'session_read' });
   ```

4. `app/api/auth/mfa/credentials/[id]/route.ts`
   ```typescript
   // GET/PATCH - Use session_read
   export const PATCH = authRoute(handler, { rateLimit: 'session_read' });

   // DELETE - Keep api limit (state-changing)
   export const DELETE = authRoute(handler, { rateLimit: 'api' });
   ```

**Rationale**:
- **session_read (500/min)**: High limit for authenticated, read-only operations
- **api (200/min → 100/min)**: Standard limit for state-changing operations
- Separates session verification from business logic API calls

**Result**: Session reads no longer compete with API calls for rate limit quota.

---

### Phase 3: Don't Rate Limit Health Checks (5 min)

**Fix**:

1. `app/api/health/route.ts`
   ```typescript
   // Before
   export const GET = publicRoute(handler, 'Health check', { rateLimit: 'api' });

   // After
   export const GET = publicRoute(handler, 'Health check'); // No rate limit
   ```

2. `app/api/health/db/route.ts` - same change
3. `app/api/health/services/route.ts` - same change

**Result**: Load balancer health checks stop consuming user rate limits.

---

### Phase 4: Use Batch Dashboard Endpoint (Frontend Change)

**Current Frontend** (example):
```typescript
// Loads each chart individually
const chartData = await Promise.all(
  charts.map(chart => fetch(`/api/admin/analytics/chart-data?chartId=${chart.id}`))
);
```

**Updated Frontend**:
```typescript
// Use batch endpoint
const response = await fetch(`/api/admin/analytics/dashboard/${dashboardId}/render`, {
  method: 'POST',
  body: JSON.stringify({ chartIds: charts.map(c => c.id) })
});
```

**Result**: 10+ chart requests become 1 request.

---

### Phase 5: Lower Limits Safely (After Above Changes)

**Current Limits**:
```typescript
auth: { limit: 20, windowSeconds: 900 },  // 15 min
api: { limit: 200, windowSeconds: 60 },   // 1 min
```

**After Fixes Above**:
```typescript
auth: { limit: 10, windowSeconds: 900 },      // Cut in half (no more double-counting)
api: { limit: 100, windowSeconds: 60 },       // Cut in half (batch dashboards, session_read separate)
session_read: { limit: 500, windowSeconds: 60 }, // New: High limit for session verification
```

**Summary of Changes**:
- ✅ `auth`: 20 → 10 (fixed double-counting)
- ✅ `api`: 200 → 100 (session reads moved to separate category)
- ✅ `session_read`: NEW at 500 (allows high-frequency session verification)

---

## Expected Results

| Scenario | Before | After | Improvement |
|----------|--------|-------|-------------|
| **Login Flow** | 20 ticks | ~5 ticks | **75% reduction** |
| **Dashboard Load** | 30+ ticks | 1-2 ticks | **95% reduction** |
| **Page Navigation** | 5-10 ticks | 0-1 ticks | **90% reduction** |
| **Health Checks** | Consumes limits | Doesn't count | **100% reduction** |

**Net Effect**:
- Auth limit can drop from 20 to 10 (tighter security)
- API limit can drop from 200 to 100 (tighter security)
- Users will NEVER hit limits during normal use
- Attackers will hit limits much faster

---

## Implementation Time

- **Phase 0** (Add session_read category): 10 minutes
- **Phase 1** (Remove double-counting): 30 minutes
- **Phase 2** (Apply session_read limit): 15 minutes
- **Phase 3** (Remove health rate limits): 5 minutes
- **Phase 4** (Use batch endpoint): 1 hour (frontend change)
- **Phase 5** (Lower limits): 5 minutes
- **Testing**: 1 hour
- **Total**: ~3 hours, 5 minutes

---

## Testing Plan

### 1. Test Login Flow
```bash
# Before fix: Should hit limit at 10 attempts (double-counting)
# After fix: Should hit limit at 20 attempts (correct counting)

for i in {1..25}; do
  curl -X POST http://localhost:4001/api/auth/login \
    -d '{"email":"test@example.com","password":"wrong"}' \
    -H "Content-Type: application/json"
done
```

### 2. Test Dashboard Load
```bash
# Before fix: 10 charts = 10 ticks
# After fix: 10 charts = 1 tick

curl -X POST http://localhost:4001/api/admin/analytics/dashboard/123/render \
  -d '{"chartIds":["1","2","3","4","5","6","7","8","9","10"]}' \
  -H "Content-Type: application/json" \
  -H "Cookie: access-token=..."
```

### 3. Test Auth Reads
```bash
# After fix: Should not count against rate limit
for i in {1..300}; do
  curl http://localhost:4001/api/auth/me \
    -H "Cookie: access-token=..."
done
# Should all succeed (no rate limit)
```

### 4. Monitor Rate Limit Consumption
```bash
# Check Redis for rate limit keys
redis-cli --scan --pattern "ratelimit:*" | xargs redis-cli mget
```

---

## Files to Change

### Configuration (1 file)
0. [lib/api/middleware/rate-limit.ts](lib/api/middleware/rate-limit.ts) - Add `session_read` category

### Backend - Remove Double-Counting (6 files)
1. [app/api/auth/login/route.ts](app/api/auth/login/route.ts) - Remove line 31
2. [app/api/auth/mfa/verify/route.ts](app/api/auth/mfa/verify/route.ts) - Remove line 39
3. [app/api/auth/mfa/skip/route.ts](app/api/auth/mfa/skip/route.ts) - Remove line 42
4. [app/api/auth/mfa/register/complete/route.ts](app/api/auth/mfa/register/complete/route.ts) - Remove line 40
5. [app/api/auth/logout/route.ts](app/api/auth/logout/route.ts) - Remove lines 60, 219
6. [app/api/auth/refresh/route.ts](app/api/auth/refresh/route.ts) - Remove line 30

### Backend - Apply session_read Limit (4 files)
7. [app/api/auth/me/route.ts](app/api/auth/me/route.ts) - Change to `session_read`
8. [app/api/auth/sessions/route.ts](app/api/auth/sessions/route.ts) - GET only to `session_read`
9. [app/api/auth/mfa/credentials/route.ts](app/api/auth/mfa/credentials/route.ts) - GET to `session_read`
10. [app/api/auth/mfa/credentials/[id]/route.ts](app/api/auth/mfa/credentials/[id]/route.ts) - PATCH to `session_read`

### Backend - Health Checks (3 files)
11. [app/api/health/route.ts](app/api/health/route.ts) - Remove rateLimit
12. [app/api/health/db/route.ts](app/api/health/db/route.ts) - Remove rateLimit
13. [app/api/health/services/route.ts](app/api/health/services/route.ts) - Remove rateLimit

### Frontend (1-2 files)
14. Find dashboard loading component - Update to use batch endpoint

### Configuration - Final (1 file)
15. [lib/api/middleware/rate-limit.ts](lib/api/middleware/rate-limit.ts) - Lower limits after testing

---

## Rollback Plan

If issues arise:

1. **Git revert** the changes
2. **Restore original limits** in rate-limit.ts
3. **Monitor** for 24 hours

Simple and safe.

---

## Why This is Better Than Complex Solution

| Complex Solution | Simple Solution |
|-----------------|----------------|
| JWT tokens, Lua scripts, 4-tier fallback | Remove duplicate rate limit calls |
| 90 hours of development | 3 hours of work |
| 28 TODO items | 10 file changes |
| New architecture to maintain | Use existing code correctly |
| Security risks from complexity | Security improvement from lower limits |
| Performance overhead | Performance improvement |

**The best code is the code you delete.**

---

## Next Steps

1. ✅ Review this document
2. ⬜ Implement Phase 1 (remove double-counting)
3. ⬜ Test in staging
4. ⬜ Implement Phase 2-4
5. ⬜ Lower limits (Phase 5)
6. ⬜ Deploy to production
7. ⬜ Monitor for 1 week

**Total time**: 1 day of work, not 3 weeks.
