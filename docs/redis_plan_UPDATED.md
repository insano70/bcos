# 🚀 Comprehensive Redis Implementation Plan for BendCare OS

**Status:** Planning Phase - Updated with Approved Changes
**Created:** 2025-10-10
**Updated:** 2025-10-10 (Post-Discussion)
**Target Completion:** 4 weeks
**Expected Impact:** 60-78% database load reduction, 50-60% dashboard performance improvement

---

## 🎯 Executive Summary

Based on deep analysis of the authentication system, RBAC, rate limiting, middleware, dashboards, and login logs (which show **113 database queries, 327 chart-data requests, and 33 user table queries for a single user viewing one dashboard**), this plan outlines a comprehensive Redis caching strategy to dramatically improve performance while maintaining security and data consistency.

### ✅ Approved Architectural Decisions

1. **✅ Data Source Level Caching** - Cache entire data source results with manual refresh
2. **✅ Session Caching (1-min TTL)** - Acceptable for session validation
3. **❌ NO Batch Endpoint** - Skipped (previous attempt failed, not worth retry)
4. **✅ Valkey Serverless** - Sufficient for our high-availability needs
5. **⏳ Cache Warming** - Discuss implementation details before proceeding
6. **🔴 CRITICAL: Fallback Required** - All cache operations MUST gracefully degrade to database

### Expected Improvements (Revised)

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| **Database Queries per Dashboard** | 113 | 30-40 | 65-75% ↓ |
| **User Table Queries** | 33 | 1 | 97% ↓ |
| **RBAC Queries** | 55 | 5 | 91% ↓ |
| **Token Blacklist Queries** | 22 | 1 | 95% ↓ |
| **Data Source Queries** | 6 (parallel) | 6 (cached) | 90% faster |
| **Average Response Time** | ~1000ms | ~400ms | 60% ↓ |
| **Dashboard Load Time** | ~2500ms | ~1000ms | 60% ↓ |

### Cost-Benefit Analysis

- **Redis Cost:** ~$47/month (AWS Valkey Serverless)
- **RDS Savings:** ~$200-300/month (smaller instance due to reduced load)
- **ECS Savings:** ~$150/month (fewer instances needed)
- **Net Savings:** ~$300-400/month
- **ROI:** Positive after 1 month

---

## 📊 Current State Analysis

### 1. Authentication & JWT Flow

**Affected Files:**
- [`lib/auth/jwt.ts`](../lib/auth/jwt.ts)
- [`middleware.ts`](../middleware.ts)
- [`lib/api/middleware/global-auth.ts`](../lib/api/middleware/global-auth.ts)

**Current Bottlenecks:**

#### 1.1 Token Blacklist Checking
- **Problem:** Checked on **every request** with no caching
- **Impact:** 22 queries in single login session
- **Response Time:** ~5-10ms per check
- **Hit Rate:** Very low (tokens rarely blacklisted)

**Log Evidence:**
```
Query: select "jti", "user_id", "token_type", "blacklisted_at", "expires_at"
from "token_blacklist" where "token_blacklist"."jti" = $1 limit $2
-- params: ["S-Lkx94xGUo00pECObXG7", 1]
(repeated 22 times in single session)
```

#### 1.2 User Table Over-Querying
- **Problem:** User table queried **33 times** for single dashboard view
- **Causes:**
  - JWT validation loads user (6x for parallel charts)
  - User context loads user again (multiple times)
  - No shared cache between auth layers

**Log Evidence:**
```
Query: select "user_id", "email", "first_name", "last_name", "password_hash",
"email_verified", "is_active", "created_at", "updated_at", "deleted_at"
from "users" where "users"."user_id" = $1 limit $2
-- params: ["cfd640bd-fcb6-4a78-ab0f-0bc8f0ab8d0f", 1]
(repeated 33 times)
```

---

### 2. RBAC System

**Affected Files:**
- [`lib/rbac/cached-user-context.ts`](../lib/rbac/cached-user-context.ts)
- [`lib/rbac/permission-checker.ts`](../lib/rbac/permission-checker.ts)
- [`lib/cache/role-permission-cache.ts`](../lib/cache/role-permission-cache.ts)

**Current Implementation:**
- **Storage:** In-memory Map cache
- **TTL:** 1-second cleanup interval (request-scoped)
- **Role Permissions:** Cached for 24 hours ✅ (good!)
- **Issue:** Map cache doesn't survive parallel requests or restarts

**Bottlenecks:**
- 62 user context operations for single dashboard
- 55 role/permission queries per dashboard
- No shared cache across ECS instances

---

### 3. Rate Limiting

**Affected Files:**
- [`lib/api/middleware/rate-limit.ts`](../lib/api/middleware/rate-limit.ts)

**Current Implementation:**
- **Storage:** In-memory Map with cleanup intervals
- **Scope:** Per-ECS-instance only
- **Persistence:** Lost on restart

**Critical Issue:** Each ECS task has its own rate limit counters, allowing bypass by hitting different instances.

---

### 4. Dashboard & Data Sources

**Affected Files:**
- [`components/charts/dashboard-view.tsx`](../components/charts/dashboard-view.tsx)
- [`app/api/admin/analytics/chart-data/route.ts`](../app/api/admin/analytics/chart-data/route.ts)
- [`lib/services/analytics-query-builder.ts`](../lib/services/analytics-query-builder.ts)

**Current Flow:**
```
Dashboard loads → 6 parallel chart requests → Each request:
  1. JWT validation (DB query)
  2. Token blacklist check (DB query)
  3. User lookup (DB query)
  4. User context load (multiple DB queries)
  5. RBAC permission check
  6. Data source query (~1000ms) ← CACHEABLE HERE
  7. Data transformation
```

**Key Insight:** Instead of batching, **cache at data source query level**. Multiple charts can share cached data source results.

---

## 🎯 Redis Implementation Strategy (Updated)

### Phase 1: Foundation Layer ⚡ (Week 1)
**Goal:** Establish Redis caching infrastructure with immediate 30-40% performance gains
**Risk Level:** Low
**Rollback Difficulty:** Easy (feature flag)

---

#### Task 1.1: Token Blacklist Caching ✅
**Priority:** 🔴 Critical
**Impact:** High (reduces 22 queries → 1-2 per user session)
**File:** [`lib/cache/token-cache.ts`](../lib/cache/token-cache.ts) (NEW)

**Implementation with FALLBACK:**

```typescript
/**
 * lib/cache/token-cache.ts
 * Caches token blacklist status with intelligent TTL and database fallback
 */

import { db } from '@/lib/db';
import { token_blacklist } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  getCachedTokenBlacklistStatus,
  cacheTokenBlacklistStatus,
  isRedisAvailable,
} from './redis-rbac-cache';
import { log } from '@/lib/logger';

/**
 * Check if token is blacklisted with Redis caching + database fallback
 *
 * Cache Strategy:
 * - Not blacklisted: 1 minute TTL (balance freshness vs hits)
 * - Blacklisted: 1 hour TTL (once blacklisted, stays blacklisted)
 *
 * FALLBACK Strategy:
 * - If Redis unavailable: Query database directly
 * - If Redis error: Log and query database
 * - Always ensure security: Better to query DB than serve stale blacklist status
 */
export async function isTokenBlacklisted(tokenId: string): Promise<boolean> {
  // 1. Check if Redis is available
  if (!isRedisAvailable()) {
    log.debug('Redis unavailable, querying database for token blacklist', {
      tokenId: tokenId.substring(0, 8),
      component: 'token-cache',
      fallback: true,
    });
    return await queryTokenBlacklistFromDB(tokenId);
  }

  try {
    // 2. Try Redis cache first
    const cached = await getCachedTokenBlacklistStatus(tokenId);
    if (cached !== null) {
      log.debug('Token blacklist cache hit', {
        tokenId: tokenId.substring(0, 8),
        blacklisted: cached,
        component: 'token-cache',
      });
      return cached;
    }

    // 3. Cache miss - query database
    log.debug('Token blacklist cache miss, querying database', {
      tokenId: tokenId.substring(0, 8),
      component: 'token-cache',
    });

    const result = await queryTokenBlacklistFromDB(tokenId);

    // 4. Cache the result (don't await - fire and forget)
    cacheTokenBlacklistStatus(tokenId, result).catch((error) => {
      log.error('Failed to cache token blacklist status', error instanceof Error ? error : new Error(String(error)), {
        tokenId: tokenId.substring(0, 8),
        component: 'token-cache',
      });
    });

    return result;
  } catch (error) {
    // 5. Redis error - fallback to database
    log.error(
      'Redis error checking token blacklist, falling back to database',
      error instanceof Error ? error : new Error(String(error)),
      {
        tokenId: tokenId.substring(0, 8),
        component: 'token-cache',
        fallback: true,
      }
    );

    return await queryTokenBlacklistFromDB(tokenId);
  }
}

/**
 * Query token blacklist from database (shared by cache miss and fallback)
 */
async function queryTokenBlacklistFromDB(tokenId: string): Promise<boolean> {
  const [blacklisted] = await db
    .select()
    .from(token_blacklist)
    .where(eq(token_blacklist.jti, tokenId))
    .limit(1);

  return !!blacklisted;
}

/**
 * Invalidate token cache (call when token is blacklisted)
 */
export async function invalidateTokenCache(tokenId: string): Promise<void> {
  if (!isRedisAvailable()) {
    log.debug('Redis unavailable, skipping token cache invalidation', {
      tokenId: tokenId.substring(0, 8),
      component: 'token-cache',
    });
    return;
  }

  try {
    await cacheTokenBlacklistStatus(tokenId, true);

    log.info('Token cache invalidated', {
      tokenId: tokenId.substring(0, 8),
      component: 'token-cache',
    });
  } catch (error) {
    // Non-critical error - token is blacklisted in DB, cache will expire
    log.error('Failed to invalidate token cache', error instanceof Error ? error : new Error(String(error)), {
      tokenId: tokenId.substring(0, 8),
      component: 'token-cache',
    });
  }
}
```

**Expected Results:**
- **Cache hit rate:** >95%
- **Response time:** 10ms → <1ms (when cached)
- **Fallback:** Always available (database query)
- **Queries eliminated:** ~20 per dashboard

**Testing Checklist:**
- [ ] Token blacklist check uses Redis cache when available
- [ ] Cache miss falls back to database correctly
- [ ] Redis down falls back to database without error
- [ ] Cache invalidates when token is blacklisted
- [ ] No false negatives (blacklisted token never returned as valid)

---

#### Task 1.2: User Basic Info Caching ✅
**Priority:** 🔴 Critical
**Impact:** High (reduces 33 queries → 1 per 5 minutes)
**File:** [`lib/cache/user-cache.ts`](../lib/cache/user-cache.ts) (NEW)

**Implementation with FALLBACK:**

```typescript
/**
 * lib/cache/user-cache.ts
 * Caches basic user information with 5-minute TTL and database fallback
 */

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getCachedUserBasic, cacheUserBasic, isRedisAvailable } from './redis-rbac-cache';
import { log } from '@/lib/logger';

interface User {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  email_verified: boolean | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Get user by ID with Redis caching + database fallback
 *
 * Cache Strategy:
 * - TTL: 5 minutes
 * - Rationale: User data rarely changes, safe to cache
 * - Invalidation: Manual when user is updated
 *
 * FALLBACK Strategy:
 * - If Redis unavailable: Query database directly
 * - If Redis error: Log and query database
 * - User data must always be available for authentication
 */
export async function getUserById(userId: string): Promise<User | null> {
  // 1. Check if Redis is available
  if (!isRedisAvailable()) {
    log.debug('Redis unavailable, querying database for user', {
      userId,
      component: 'user-cache',
      fallback: true,
    });
    return await queryUserFromDB(userId);
  }

  try {
    // 2. Try Redis cache first
    const cached = await getCachedUserBasic(userId);
    if (cached) {
      log.debug('User cache hit', {
        userId,
        email: cached.email,
        component: 'user-cache',
      });
      return cached;
    }

    // 3. Cache miss - query database
    log.debug('User cache miss, querying database', {
      userId,
      component: 'user-cache',
    });

    const user = await queryUserFromDB(userId);

    // 4. Cache the result (fire and forget)
    if (user) {
      cacheUserBasic(userId, user).catch((error) => {
        log.error('Failed to cache user', error instanceof Error ? error : new Error(String(error)), {
          userId,
          component: 'user-cache',
        });
      });
    }

    return user;
  } catch (error) {
    // 5. Redis error - fallback to database
    log.error(
      'Redis error getting user, falling back to database',
      error instanceof Error ? error : new Error(String(error)),
      {
        userId,
        component: 'user-cache',
        fallback: true,
      }
    );

    return await queryUserFromDB(userId);
  }
}

/**
 * Query user from database (shared by cache miss and fallback)
 */
async function queryUserFromDB(userId: string): Promise<User | null> {
  const [user] = await db
    .select({
      user_id: users.user_id,
      email: users.email,
      first_name: users.first_name,
      last_name: users.last_name,
      is_active: users.is_active,
      email_verified: users.email_verified,
      created_at: users.created_at,
      updated_at: users.updated_at,
    })
    .from(users)
    .where(eq(users.user_id, userId))
    .limit(1);

  return user || null;
}

/**
 * Invalidate user cache (call when user is updated)
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  if (!isRedisAvailable()) {
    log.debug('Redis unavailable, skipping user cache invalidation', {
      userId,
      component: 'user-cache',
    });
    return;
  }

  try {
    const { redisDel } = await import('./redis-client');
    await redisDel(`user_basic:${userId}`);

    log.info('User cache invalidated', {
      userId,
      component: 'user-cache',
    });
  } catch (error) {
    log.error('Failed to invalidate user cache', error instanceof Error ? error : new Error(String(error)), {
      userId,
      component: 'user-cache',
    });
  }
}
```

**Expected Results:**
- **Queries:** 33 → 1 per dashboard
- **Cache hit rate:** >90%
- **TTL:** 5 minutes (safe for user data)
- **Fallback:** Always available (database query)

---

#### Task 1.3: JWT Payload Caching ✅
**Priority:** 🟡 Medium
**Impact:** Medium (reduces crypto operations)

[Same implementation as original plan, with fallback logic]

---

### Phase 2: RBAC Optimization 🔒 (Week 2)
**Goal:** Eliminate duplicate RBAC lookups, achieve 60-70% total improvement
**Risk Level:** Medium
**Rollback Difficulty:** Medium (affects authorization)

---

#### Task 2.1: User Context Redis Caching ✅
**Priority:** 🔴 Critical
**Impact:** Very High (reduces 62 operations → 1)

[Same as original, but emphasize fallback to database query if Redis fails]

**CRITICAL FALLBACK LOGIC:**

```typescript
export async function getCachedUserContext(userId: string): Promise<UserContext> {
  // 1. Try Redis if available
  if (isRedisAvailable()) {
    try {
      const cached = await getRedisUserContext(userId);
      if (cached) return cached;
    } catch (error) {
      log.error('Redis error loading user context, falling back to database', error, {
        userId,
        component: 'rbac-cache',
        fallback: true,
      });
    }
  }

  // 2. Fallback: Load from database (ALWAYS WORKS)
  const context = await loadUserContextFromDB(userId);

  // 3. Try to cache (fire and forget)
  if (isRedisAvailable()) {
    cacheRedisUserContext(userId, context).catch((error) => {
      log.error('Failed to cache user context', error, {
        userId,
        component: 'rbac-cache',
      });
    });
  }

  return context;
}
```

---

### Phase 3: Rate Limiting 🚦 (Week 2)
**Goal:** Distributed rate limiting across ECS instances
**Risk Level:** Low
**Rollback Difficulty:** Easy

[Same as original, already includes in-memory fallback]

---

### Phase 4: Data Source Caching 📊 (Week 3) **NEW**
**Goal:** Cache data source query results with manual refresh capabilities
**Risk Level:** Medium
**Rollback Difficulty:** Easy (feature flag per data source)

---

#### Task 4.1: Data Source Query Caching ✅
**Priority:** 🔴 Critical
**Impact:** Very High (90% faster data source queries)
**File:** [`lib/cache/data-source-cache.ts`](../lib/cache/data-source-cache.ts) (NEW)

**Architectural Decision:**
- **Cache at data source query level** (before chart transformation)
- **Multiple charts** can share same cached data source result
- **User controls refresh** via UI button
- **Automatic TTL** for data freshness

**Implementation:**

```typescript
/**
 * lib/cache/data-source-cache.ts
 * Caches data source query results with manual refresh and fallback
 */

import { redisGet, redisSet, redisDel, isRedisAvailable } from './redis-client';
import { log } from '@/lib/logger';
import type { AggAppMeasure } from '@/lib/types/analytics';

interface DataSourceQueryParams {
  measure?: string;
  frequency?: string;
  practice?: string;
  practice_uid?: number;
  provider_name?: string;
  start_date?: string;
  end_date?: string;
  advanced_filters?: unknown[];
  multiple_series?: unknown[];
  [key: string]: unknown;
}

interface CachedDataSourceResult {
  data: AggAppMeasure[];
  query_time_ms: number;
  cached_at: string;
  expires_at: string;
}

/**
 * Generate cache key for data source query
 *
 * Strategy:
 * - Hash query parameters to create unique key
 * - Include user's accessible organizations (RBAC filtering)
 * - Different keys for different filter combinations
 */
function generateDataSourceCacheKey(
  params: DataSourceQueryParams,
  userOrganizations: string[]
): string {
  const keyData = {
    ...params,
    // Include user's orgs for RBAC-filtered results
    organizations: userOrganizations.sort(),
  };

  // Simple hash (could use crypto.createHash for production)
  const keyString = JSON.stringify(keyData);
  const hash = Buffer.from(keyString).toString('base64').substring(0, 32);

  return `datasource:${hash}`;
}

/**
 * Determine TTL based on date range
 *
 * Strategy:
 * - Real-time data (today): 1 minute
 * - Recent data (this week): 5 minutes
 * - Historical data (>1 week): 1 hour
 * - User can manually refresh to bypass cache
 */
function getDataSourceCacheTTL(startDate?: string, endDate?: string): number {
  if (!endDate) return 60; // Default 1 minute

  const now = new Date();
  const end = new Date(endDate);
  const daysSinceEnd = Math.floor((now.getTime() - end.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSinceEnd === 0) {
    return 60; // 1 minute for today
  } else if (daysSinceEnd < 7) {
    return 300; // 5 minutes for this week
  } else {
    return 3600; // 1 hour for historical
  }
}

/**
 * Query data source with caching and fallback
 *
 * @param params Query parameters
 * @param userOrganizations User's accessible organizations
 * @param queryFunction Function to execute query (fallback)
 * @param forceRefresh Bypass cache (from manual refresh button)
 *
 * FALLBACK Strategy:
 * - If Redis unavailable: Execute query directly
 * - If Redis error: Log and execute query
 * - If forceRefresh: Skip cache, execute query, update cache
 * - Data source queries must always work regardless of Redis status
 */
export async function queryDataSourceWithCache<T extends AggAppMeasure>(
  params: DataSourceQueryParams,
  userOrganizations: string[],
  queryFunction: () => Promise<{ data: T[]; query_time_ms: number }>,
  forceRefresh: boolean = false
): Promise<{ data: T[]; query_time_ms: number; fromCache: boolean; cacheKey?: string }> {
  const cacheKey = generateDataSourceCacheKey(params, userOrganizations);

  // 1. Force refresh - skip cache, execute query, update cache
  if (forceRefresh) {
    log.info('Force refresh requested, bypassing cache', {
      cacheKey,
      component: 'datasource-cache',
    });

    const result = await queryFunction();

    // Try to update cache (fire and forget)
    if (isRedisAvailable()) {
      const ttl = getDataSourceCacheTTL(params.start_date, params.end_date);
      cacheDataSourceResult(cacheKey, result, ttl).catch((error) => {
        log.error('Failed to cache after force refresh', error instanceof Error ? error : new Error(String(error)), {
          cacheKey,
          component: 'datasource-cache',
        });
      });
    }

    return {
      ...result,
      fromCache: false,
      cacheKey,
    };
  }

  // 2. Check if Redis is available
  if (!isRedisAvailable()) {
    log.debug('Redis unavailable, executing data source query', {
      cacheKey,
      component: 'datasource-cache',
      fallback: true,
    });

    const result = await queryFunction();
    return {
      ...result,
      fromCache: false,
      cacheKey,
    };
  }

  try {
    // 3. Try Redis cache first
    const cached = await redisGet<CachedDataSourceResult>(cacheKey);

    if (cached) {
      log.info('Data source cache hit', {
        cacheKey,
        cachedAt: cached.cached_at,
        expiresAt: cached.expires_at,
        dataPoints: cached.data.length,
        component: 'datasource-cache',
      });

      return {
        data: cached.data as T[],
        query_time_ms: cached.query_time_ms,
        fromCache: true,
        cacheKey,
      };
    }

    // 4. Cache miss - execute query
    log.info('Data source cache miss, executing query', {
      cacheKey,
      component: 'datasource-cache',
    });

    const result = await queryFunction();

    // 5. Cache the result (fire and forget)
    const ttl = getDataSourceCacheTTL(params.start_date, params.end_date);
    cacheDataSourceResult(cacheKey, result, ttl).catch((error) => {
      log.error('Failed to cache data source result', error instanceof Error ? error : new Error(String(error)), {
        cacheKey,
        component: 'datasource-cache',
      });
    });

    return {
      ...result,
      fromCache: false,
      cacheKey,
    };
  } catch (error) {
    // 6. Redis error - fallback to query
    log.error(
      'Redis error querying data source cache, falling back to database',
      error instanceof Error ? error : new Error(String(error)),
      {
        cacheKey,
        component: 'datasource-cache',
        fallback: true,
      }
    );

    const result = await queryFunction();
    return {
      ...result,
      fromCache: false,
      cacheKey,
    };
  }
}

/**
 * Cache data source result
 */
async function cacheDataSourceResult(
  cacheKey: string,
  result: { data: AggAppMeasure[]; query_time_ms: number },
  ttl: number
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 1000);

  const cacheData: CachedDataSourceResult = {
    data: result.data,
    query_time_ms: result.query_time_ms,
    cached_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  await redisSet(cacheKey, cacheData, ttl);

  log.info('Data source result cached', {
    cacheKey,
    dataPoints: result.data.length,
    ttl,
    expiresAt: expiresAt.toISOString(),
    component: 'datasource-cache',
  });
}

/**
 * Manually invalidate data source cache (called by refresh button)
 */
export async function invalidateDataSourceCache(cacheKey: string): Promise<void> {
  if (!isRedisAvailable()) {
    log.debug('Redis unavailable, skipping cache invalidation', {
      cacheKey,
      component: 'datasource-cache',
    });
    return;
  }

  try {
    await redisDel(cacheKey);

    log.info('Data source cache invalidated', {
      cacheKey,
      component: 'datasource-cache',
    });
  } catch (error) {
    log.error('Failed to invalidate data source cache', error instanceof Error ? error : new Error(String(error)), {
      cacheKey,
      component: 'datasource-cache',
    });
  }
}
```

---

#### Task 4.2: Integrate with Analytics Query Builder ✅
**Priority:** 🔴 Critical
**File:** [`lib/services/analytics-query-builder.ts`](../lib/services/analytics-query-builder.ts) (UPDATE)

**Implementation:**

```typescript
/**
 * Update lib/services/analytics-query-builder.ts
 * Add caching to queryMeasures function
 */

import { queryDataSourceWithCache } from '@/lib/cache/data-source-cache';

export class AnalyticsQueryBuilder {
  async queryMeasures(
    params: AnalyticsQueryParams,
    context: ChartRenderContext,
    forceRefresh: boolean = false // NEW parameter
  ): Promise<{ data: AggAppMeasure[]; query_time_ms: number; fromCache?: boolean; cacheKey?: string }> {
    const startTime = Date.now();

    // Extract user's accessible organizations for cache key
    const userOrganizations = context.accessible_organizations || [];

    // Use cached query with fallback
    const result = await queryDataSourceWithCache(
      params,
      userOrganizations,
      async () => {
        // Original query logic (fallback)
        const data = await this.executeQuery(params, context);
        return {
          data,
          query_time_ms: Date.now() - startTime,
        };
      },
      forceRefresh
    );

    return result;
  }

  // ... rest of implementation
}
```

---

#### Task 4.3: Add Manual Refresh to Chart Data API ✅
**Priority:** 🔴 Critical
**File:** [`app/api/admin/analytics/chart-data/route.ts`](../app/api/admin/analytics/chart-data/route.ts) (UPDATE)

**Implementation:**

```typescript
/**
 * Update app/api/admin/analytics/chart-data/route.ts
 * Support forceRefresh parameter
 */

const transformChartDataHandler = async (
  request: NextRequest,
  userContext: UserContext
) => {
  const startTime = Date.now();

  try {
    const requestBody = await request.clone().json();

    // NEW: Check for forceRefresh parameter
    const forceRefresh = requestBody.forceRefresh === true;

    if (forceRefresh) {
      log.info('Manual refresh requested for chart data', {
        requestingUserId: userContext.user_id,
        chartType: requestBody.chartType,
        measure: requestBody.measure,
      });
    }

    const validatedData = await validateRequest(request, chartDataRequestSchema);

    // ... existing validation logic ...

    // Pass forceRefresh to query builder
    const result = await analyticsQueryBuilder.queryMeasures(
      queryParams,
      chartContext,
      forceRefresh // NEW parameter
    );

    let measures = result.data;

    log.info('Measures fetched successfully', {
      requestingUserId: userContext.user_id,
      measureCount: measures.length,
      queryTimeMs: result.query_time_ms,
      fromCache: result.fromCache,
      cacheKey: result.cacheKey,
    });

    // ... rest of transformation logic ...

    const response = createSuccessResponse({
      chartData,
      rawData: measures,
      metadata: {
        transformedAt: new Date().toISOString(),
        chartType: validatedData.chartType,
        duration,
        measureCount: measures.length,
        datasetCount: chartData.datasets?.length ?? 0,
        queryTimeMs: result.query_time_ms,
        fromCache: result.fromCache, // NEW: Tell client if cached
        cacheKey: result.cacheKey, // NEW: Return cache key for refresh
      },
    });

    // Add cache headers
    if (result.fromCache) {
      response.headers.set('X-Cache-Status', 'HIT');
    } else {
      response.headers.set('X-Cache-Status', 'MISS');
    }

    return response;
  } catch (error) {
    // ... error handling ...
  }
};
```

---

#### Task 4.4: Add Refresh Button to UI ✅
**Priority:** 🟡 Medium
**File:** [`components/charts/analytics-chart.tsx`](../components/charts/analytics-chart.tsx) (UPDATE)

**Implementation:**

```typescript
/**
 * Update components/charts/analytics-chart.tsx
 * Add manual refresh button
 */

'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function AnalyticsChart({ config }: { config: ChartConfig }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const loadChartData = async (forceRefresh: boolean = false) => {
    setIsRefreshing(true);

    try {
      const response = await apiClient.post('/api/admin/analytics/chart-data', {
        ...config,
        forceRefresh, // NEW parameter
      });

      // Update cache status
      setFromCache(response.metadata.fromCache);
      if (response.metadata.fromCache) {
        setCachedAt(response.metadata.cachedAt);
      }

      // ... update chart data ...
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="chart-container">
      {/* Chart header with refresh button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{config.title}</h3>

        <div className="flex items-center gap-2">
          {/* Cache status indicator */}
          {fromCache && cachedAt && (
            <span className="text-xs text-gray-500">
              Cached {new Date(cachedAt).toLocaleTimeString()}
            </span>
          )}

          {/* Manual refresh button */}
          <button
            onClick={() => loadChartData(true)}
            disabled={isRefreshing}
            className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Chart rendering */}
      {/* ... existing chart component ... */}
    </div>
  );
}
```

---

#### Phase 4 Success Criteria

**Performance Metrics:**
- [ ] Data source query cache hit rate >70%
- [ ] Chart load time: ~1000ms → ~100ms (when cached)
- [ ] Database queries reduced by 90% for cached charts
- [ ] Manual refresh works within 1-2 seconds

**Functional Requirements:**
- [ ] All charts support caching
- [ ] Manual refresh button works correctly
- [ ] Cache TTL varies by data freshness
- [ ] Fallback to database always works
- [ ] No stale data issues

**User Experience:**
- [ ] Cache status visible in UI
- [ ] Refresh button responsive
- [ ] Loading states clear
- [ ] Cached charts load instantly

---

## 🔄 Cache Invalidation Strategy

### Automatic Invalidation (Event-Driven)

**Complete Trigger Point Matrix:**

| Event | Cache to Invalidate | Function to Call | File to Update | Priority |
|-------|---------------------|------------------|----------------|----------|
| **User Management** |
| User updated (name, email) | User basic info | `invalidateUserCache(userId)` | `lib/services/rbac-users-service.ts` | 🔴 Critical |
| User role assigned | User context | `invalidateUserContext(userId, 'role_assigned')` | `lib/services/rbac-users-service.ts` | 🔴 Critical |
| User role removed | User context | `invalidateUserContext(userId, 'role_removed')` | `lib/services/rbac-users-service.ts` | 🔴 Critical |
| **Authentication** |
| User logs out | JWT payload | `invalidateJWTPayload(tokenId)` | `app/api/auth/logout/route.ts` | 🔴 Critical |
| Token blacklisted | Token blacklist cache | `invalidateTokenCache(tokenId)` | `lib/auth/token-manager.ts` | 🔴 Critical |
| **Data Source** |
| User clicks refresh | Data source cache | `invalidateDataSourceCache(cacheKey)` | Via API parameter | 🟡 Medium |
| Data source updated | All related caches | `invalidateDataSourceCaches(dataSourceId)` | `lib/services/rbac-data-sources-service.ts` | 🟡 Medium |

### Time-Based Expiration (TTL)

**TTL Reference Table:**

| Cache Type | TTL | Rationale | Fallback |
|------------|-----|-----------|----------|
| **Authentication** |
| Token blacklist (not blacklisted) | 1 min | Balance freshness vs performance | Database query |
| Token blacklist (blacklisted) | 1 hour | Once blacklisted, stays blacklisted | Database query |
| JWT payload | 5 min | Token expires anyway (24 hrs) | Re-verify token |
| User basic info | 5 min | Rarely changes | Database query |
| **RBAC** |
| User context | 5 min | Contains roles/permissions | Database query |
| Role permissions | 24 hours | Manual invalidation on change | Database query |
| **Rate Limiting** |
| Rate limit counters | Window duration | Sliding window expiry | In-memory Map |
| **Data Source** |
| Chart data (today) | 1 min | Real-time requirement | Execute query |
| Chart data (this week) | 5 min | Recent but not real-time | Execute query |
| Chart data (historical) | 1 hour | Static historical data | Execute query |

---

## 🛡️ Comprehensive Fallback Strategy

### Design Principles

1. **Security First:** When in doubt, query database (better slow than wrong)
2. **Graceful Degradation:** Application works perfectly without Redis
3. **Fire and Forget Caching:** Never block on cache writes
4. **Fail Open:** Cache read errors should not block requests
5. **Monitoring:** Log all fallback triggers for investigation

### Fallback Implementation Pattern

**Standard Pattern for All Cache Operations:**

```typescript
export async function cachedOperation(): Promise<Result> {
  // 1. Check Redis availability first
  if (!isRedisAvailable()) {
    log.debug('Redis unavailable, using fallback', {
      operation: 'cachedOperation',
      fallback: true,
    });
    return await databaseQuery();
  }

  try {
    // 2. Try Redis
    const cached = await redisGet(key);
    if (cached) return cached;

    // 3. Cache miss - query database
    const result = await databaseQuery();

    // 4. Cache result (fire and forget - don't await)
    redisSet(key, result, ttl).catch((error) => {
      log.error('Failed to cache result', error, {
        operation: 'cachedOperation',
        key,
      });
    });

    return result;
  } catch (error) {
    // 5. Redis error - fallback to database
    log.error('Redis error, using fallback', error, {
      operation: 'cachedOperation',
      fallback: true,
    });

    return await databaseQuery();
  }
}
```

### Monitoring Fallback Usage

**CloudWatch Metric:**
```typescript
// Track fallback usage
export function recordCacheFallback(operation: string, reason: string): void {
  log.warn('Cache fallback triggered', {
    operation,
    reason,
    component: 'cache-fallback',
  });

  // Increment CloudWatch metric
  // putMetric('CacheFallback', 1, { operation, reason });
}
```

**Alert if fallback rate >10% for 10 minutes:**
- Indicates Redis issues
- Trigger investigation
- May need to scale Redis or fix connection

---

## 🧪 Testing Strategy

### Fallback Testing (NEW - CRITICAL)

**Create `tests/integration/redis-fallback.test.ts`:**

```typescript
describe('Redis Fallback Tests', () => {
  it('should fallback to database when Redis is down', async () => {
    // Disable Redis
    mockRedis.disconnect();

    // Should still work
    const user = await getUserById('test-user');
    expect(user).toBeDefined();
    expect(user?.email).toBe('test@example.com');

    // Verify database was queried
    expect(mockDb.queries.length).toBe(1);
  });

  it('should fallback on Redis timeout', async () => {
    // Simulate Redis timeout
    mockRedis.setLatency(10000); // 10 second delay

    // Should fallback quickly
    const startTime = Date.now();
    const result = await isTokenBlacklisted('test-token');
    const duration = Date.now() - startTime;

    expect(result).toBe(false);
    expect(duration).toBeLessThan(1000); // Should not wait for Redis
  });

  it('should work when Redis errors on write', async () => {
    // Simulate Redis write failure
    mockRedis.failOnWrite();

    // Should still return result (cache write is fire-and-forget)
    const context = await getCachedUserContext('test-user');
    expect(context).toBeDefined();

    // Second call should still work (queries DB again)
    const context2 = await getCachedUserContext('test-user');
    expect(context2).toEqual(context);
  });
});
```

---

## 📋 Updated Implementation Checklist

### Phase 1: Foundation (Week 1)
- [ ] Token blacklist caching with fallback
- [ ] User basic info caching with fallback
- [ ] JWT payload caching with fallback
- [ ] Middleware integration with fallback
- [ ] Fallback testing passed
- [ ] Testing: Verify 30-40% improvement
- [ ] Deploy to dev → staging

### Phase 2: RBAC (Week 2)
- [ ] User context Redis caching with fallback
- [ ] Cache invalidation integration
- [ ] All RBAC trigger points implemented
- [ ] Fallback testing passed
- [ ] Testing: Verify 60% improvement
- [ ] Deploy to dev → staging

### Phase 3: Rate Limiting (Week 2)
- [ ] Redis-backed rate limiter with in-memory fallback
- [ ] Multi-instance testing
- [ ] Fallback testing passed
- [ ] Deploy to staging → production

### Phase 4: Data Source Caching (Week 3) **NEW**
- [ ] Data source query caching with fallback
- [ ] Analytics query builder integration
- [ ] Manual refresh API parameter
- [ ] UI refresh button
- [ ] Cache status in UI
- [ ] Fallback testing passed
- [ ] Testing: Verify 60% total improvement
- [ ] Deploy to production

### Monitoring & Validation
- [ ] CloudWatch dashboards created
- [ ] Fallback rate monitoring active
- [ ] Cache hit rate monitoring active
- [ ] Alerts configured
- [ ] Runbooks updated

---

## 🤔 Updated Open Questions for Discussion

### ~~Question 1: Batch Endpoint~~ ✅ RESOLVED
**Decision:** Skip batch endpoint (tried before, didn't work). Use data source caching instead.

---

### ~~Question 2: Session Caching~~ ✅ RESOLVED
**Decision:** 1-minute cache TTL is acceptable for session validation.

---

### ~~Question 3: Redis High Availability~~ ✅ RESOLVED
**Decision:** Valkey Serverless is sufficient.

---

### Question 4: Cache Warming Strategy ⏳ NEEDS DISCUSSION

**When to warm cache:**
- Application startup
- After deployment
- During low-traffic periods (3am - 6am)

**What to warm:**

**Option A: Aggressive Warming (Recommended)**
- Common role permissions (super_admin, practice_admin, user)
- Top 100 most active users (by login frequency)
- Most frequently accessed data sources (last 7 days)
- **Pros:** Great first-request performance
- **Cons:** Longer deployment (~2-3 minutes), complexity

**Option B: Minimal Warming**
- Only role permissions (super_admin, practice_admin, user)
- **Pros:** Fast deployment (~30 seconds), simple
- **Cons:** First user requests slower

**Option C: No Warming**
- Let cache naturally populate
- **Pros:** Simplest, fastest deployment
- **Cons:** First requests after deployment slow

**Questions:**
1. Which option aligns with deployment constraints?
2. Is 2-3 minute longer deployment acceptable for better UX?
3. Should warming run in background (non-blocking)?

**Proposed Implementation (Option A):**

```typescript
/**
 * lib/cache/cache-warmer.ts
 * Pre-populate cache with frequently accessed data
 */

import { log } from '@/lib/logger';
import { getCachedRolePermissions } from '@/lib/cache/redis-rbac-cache';
import { getCachedUserContext } from '@/lib/rbac/cached-user-context';
import { db, roles, users } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';

interface WarmupStats {
  rolesWarmed: number;
  usersWarmed: number;
  dataSourcesWarmed: number;
  duration: number;
  errors: number;
}

export async function warmCache(): Promise<WarmupStats> {
  const startTime = Date.now();
  const stats: WarmupStats = {
    rolesWarmed: 0,
    usersWarmed: 0,
    dataSourcesWarmed: 0,
    duration: 0,
    errors: 0,
  };

  try {
    log.info('Cache warming initiated', {
      component: 'cache-warmer',
    });

    // 1. Warm common role permissions
    const commonRoles = await db
      .select({ role_id: roles.role_id, name: roles.name })
      .from(roles)
      .where(eq(roles.is_system_role, true));

    for (const role of commonRoles) {
      try {
        await getCachedRolePermissions(role.role_id);
        stats.rolesWarmed++;
      } catch (error) {
        log.error('Failed to warm role', error instanceof Error ? error : new Error(String(error)), {
          roleId: role.role_id,
          component: 'cache-warmer',
        });
        stats.errors++;
      }
    }

    // 2. Warm top 100 active users (by last login)
    const activeUsers = await db
      .select({ user_id: users.user_id })
      .from(users)
      .where(eq(users.is_active, true))
      .orderBy(desc(users.updated_at))
      .limit(100);

    for (const user of activeUsers) {
      try {
        await getCachedUserContext(user.user_id);
        stats.usersWarmed++;
      } catch (error) {
        log.error('Failed to warm user', error instanceof Error ? error : new Error(String(error)), {
          userId: user.user_id,
          component: 'cache-warmer',
        });
        stats.errors++;
      }
    }

    // 3. Warm popular data sources (optional - discuss)
    // Could query analytics logs to find most-used data sources
    // and pre-cache their results

    stats.duration = Date.now() - startTime;

    log.info('Cache warming completed', {
      component: 'cache-warmer',
      ...stats,
    });

    return stats;
  } catch (error) {
    log.error(
      'Cache warming failed',
      error instanceof Error ? error : new Error(String(error)),
      {
        component: 'cache-warmer',
        duration: Date.now() - startTime,
      }
    );

    stats.duration = Date.now() - startTime;
    return stats;
  }
}

// OPTION 1: Blocking warming (deployment waits)
if (process.env.ENABLE_CACHE_WARMING === 'true' && process.env.NODE_ENV === 'production') {
  warmCache().then((stats) => {
    console.log('Cache warmed:', stats);
  });
}

// OPTION 2: Background warming (non-blocking)
if (process.env.ENABLE_CACHE_WARMING === 'true' && process.env.NODE_ENV === 'production') {
  setImmediate(() => {
    warmCache().then((stats) => {
      console.log('Cache warmed in background:', stats);
    });
  });
}
```

**Decision Needed:**
- [ ] Which warming strategy? (A, B, or C)
- [ ] Blocking or background warming?
- [ ] Should we warm data sources?

---

### Question 5: Data Source Cache Invalidation Scope

**Scenario:** User updates a data source (adds column, changes query)

**Options:**

**A) Invalidate All Related Caches:**
- Clear all cached queries for that data source ID
- **Pros:** Ensures freshness
- **Cons:** Expensive if data source has many cached queries

**B) Lazy Invalidation:**
- Don't invalidate, let TTL expire naturally
- **Pros:** Simple, no overhead
- **Cons:** Stale data for up to 1 hour (historical data)

**C) Hybrid:**
- Invalidate on schema changes (columns added/removed)
- Let TTL expire on data refreshes
- **Pros:** Balance between freshness and performance
- **Cons:** More complexity

**Decision Needed:** Which invalidation strategy?

---

## 🎯 Revised Success Criteria

### Phase 1 (Week 1):
- [ ] Token blacklist cache hit rate >95%
- [ ] User cache hit rate >90%
- [ ] Database queries reduced by 40-50%
- [ ] Response time improved by 30%
- [ ] **Fallback works without Redis:** All features functional

### Phase 2 (Week 2):
- [ ] RBAC cache hit rate >85%
- [ ] Database queries reduced by 60-70%
- [ ] Response time improved by 60%
- [ ] Cache invalidation working
- [ ] **Fallback works without Redis:** All features functional

### Phase 3 (Week 2):
- [ ] Rate limiting consistent across instances
- [ ] No rate limit bypass detected
- [ ] **Fallback to in-memory works:** Rate limiting still enforced

### Phase 4 (Week 3):
- [ ] Data source cache hit rate >70%
- [ ] Chart load time: ~1000ms → ~100ms (cached)
- [ ] Database queries reduced by 90% for cached charts
- [ ] Manual refresh works correctly
- [ ] **Fallback works without Redis:** Charts load (slower, but work)

### Overall:
- [ ] Total database query reduction: 65-75%
- [ ] Total response time improvement: 60%
- [ ] Zero downtime from Redis issues
- [ ] Cache monitoring active
- [ ] Team trained on Redis operations

---

## 🚀 Next Steps (Updated)

### Immediate Actions (This Week)

1. **✅ Review this updated plan** with team
2. **Discuss cache warming strategy** (Question 4)
3. **Discuss data source invalidation** (Question 5)
4. **Get security approval** for caching with fallbacks
5. **Assign tasks** to team members

### Phase 1 Kickoff (Next Week)

1. **Create feature branch** `feature/redis-phase-1`
2. **✅ Set up dev Redis** (already done ✅)
3. **Implement token caching with fallback**
4. **Implement user caching with fallback**
5. **Implement JWT caching with fallback**
6. **Write fallback tests** (CRITICAL)
7. **Deploy to dev and test Redis failure scenarios**
8. **Validate metrics**

---

## 📝 Conclusion

This updated comprehensive Redis implementation plan provides a clear, phased approach to dramatically improving the performance of BendCare OS while ensuring **100% reliability through comprehensive fallback strategies**.

**Key Changes from Original Plan:**
- ✅ Removed batch endpoint (not feasible)
- ✅ Added data source caching with manual refresh
- ✅ Added comprehensive fallback logic to ALL cache operations
- ✅ Added manual refresh UI controls
- ✅ Added fallback testing requirements

**Priorities:**
1. **Reliability** - Application works perfectly without Redis
2. **Security** - Cache invalidation ensures no stale permissions
3. **Performance** - 60% improvement in dashboard load times
4. **Observability** - Comprehensive monitoring and alerting

**Estimated Timeline:** 3-4 weeks
**Estimated ROI:** Positive after 1 month
**Risk Level:** Low (comprehensive fallback strategy)

**Ready to proceed? Let's discuss cache warming and data source invalidation!** 🚀
