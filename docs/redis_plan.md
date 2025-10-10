# 🚀 Comprehensive Redis Implementation Plan for BendCare OS

**Status:** Planning Phase
**Created:** 2025-10-10
**Target Completion:** 4 weeks
**Expected Impact:** 60-78% database load reduction, 68% dashboard performance improvement

---

## Executive Summary

Based on deep analysis of the authentication system, RBAC, rate limiting, middleware, dashboards, and login logs (which show **113 database queries, 327 chart-data requests, and 33 user table queries for a single user viewing one dashboard**), this plan outlines a comprehensive Redis caching strategy to dramatically improve performance while maintaining security and data consistency.

### Expected Improvements

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| **Database Queries per Dashboard** | 113 | 25-45 | 60-78% ↓ |
| **User Table Queries** | 33 | 1 | 97% ↓ |
| **RBAC Queries** | 55 | 5 | 91% ↓ |
| **Token Blacklist Queries** | 22 | 1 | 95% ↓ |
| **API Requests per Dashboard** | 6 | 1 | 83% ↓ |
| **Average Response Time** | ~1000ms | ~350ms | 65% ↓ |
| **Dashboard Load Time** | ~2500ms | ~800ms | 68% ↓ |

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

#### 1.3 Triple Authentication Pattern
**Redundant authentication layers:**
```
1. middleware.ts:334       → validateAuthentication()
2. global-auth.ts:86       → applyGlobalAuth()
3. jwt-auth.ts:99          → requireJWTAuth() (via rbacRoute)
```

Each layer performs its own database queries, with no shared cache.

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

#### 2.1 User Context Loading
- **Problem:** 62 user context operations for single dashboard
- **Root Cause:** Each chart request loads context from database
- **Impact:** Map cache misses on parallel requests

**Log Evidence:**
```json
{
  "message": "User context loaded successfully",
  "rolesCount": 1,
  "permissionsCount": 89,
  "organizationsCount": 0
}
// Repeated 62 times in single dashboard load
```

#### 2.2 RBAC Query Explosion
- **Problem:** 55 role/permission queries per dashboard
- **Query Pattern:**
```sql
SELECT distinct "user_roles".*, "roles".*, "permissions".*
FROM "user_roles"
INNER JOIN "roles" ON "user_roles"."role_id" = "roles"."role_id"
INNER JOIN "role_permissions" ON "roles"."role_id" = "role_permissions"."role_id"
INNER JOIN "permissions" ON "role_permissions"."permission_id" = "permissions"."permission_id"
WHERE "user_roles"."user_id" = $1
-- Repeated for each API request
```

---

### 3. Rate Limiting

**Affected Files:**
- [`lib/api/middleware/rate-limit.ts`](../lib/api/middleware/rate-limit.ts)

**Current Implementation:**
- **Storage:** In-memory Map with cleanup intervals
- **Scope:** Per-ECS-instance only
- **Persistence:** Lost on restart

**Critical Issues:**

#### 3.1 Not Distributed
- **Problem:** Each ECS task has its own rate limit counters
- **Attack Vector:** User hitting Task A, then Task B gets 2x the limit
- **Impact:** Rate limiting ineffective in multi-instance deployments

**Example:**
```
User makes 100 requests to ECS Task 1: ✅ Allowed (limit 200/min)
User makes 100 requests to ECS Task 2: ✅ Allowed (limit 200/min)
Total: 200 requests/min from single user (should be rate limited)
```

---

### 4. Dashboard & Charts

**Affected Files:**
- [`components/charts/dashboard-view.tsx`](../components/charts/dashboard-view.tsx)
- [`app/api/admin/analytics/chart-data/route.ts`](../app/api/admin/analytics/chart-data/route.ts)

**Current Flow:**
```
Dashboard loads → 6 parallel chart requests → Each request:
  1. JWT validation (DB query)
  2. Token blacklist check (DB query)
  3. User lookup (DB query)
  4. User context load (multiple DB queries)
  5. RBAC permission check
  6. Chart data query (~1000ms)
  7. Data transformation
```

**Critical Bottlenecks:**

#### 4.1 No Batch Endpoint
- **Problem:** 6 separate HTTP requests per dashboard
- **Impact:** 6x authentication overhead, 6x network latency
- **Total Time:** ~6 seconds for dashboard load

#### 4.2 Duplicate Authentication
- **Problem:** Each chart re-authenticates independently
- **Impact:** 6 JWT validations, 6 token checks, 6 user lookups
- **Waste:** 83% of auth work is redundant

#### 4.3 No Chart Data Caching
- **Problem:** Fresh database query every time
- **Impact:** Slow for frequently-viewed dashboards
- **Query Time:** 1000-1200ms per chart

**Log Evidence:**
```
POST /api/admin/analytics/chart-data (327 requests)
Average duration: 1000-1200ms per chart
Peak: 1171ms for complex charts
Total dashboard load: ~2500ms
```

---

### 5. Middleware Execution

**Affected Files:**
- [`middleware.ts`](../middleware.ts)

**Current Sequential Flow:**
```typescript
1. Rate limit check (in-memory Map)
2. JWT validation + token blacklist check (DB)
3. User load from DB
4. CSRF validation
5. Session validation
```

**Issues:**
- Sequential execution prevents optimization
- Repeated for every request (even static assets)
- No caching between execution steps
- Each step queries database independently

---

## 🎯 Redis Implementation Strategy

### Phase 1: Foundation Layer ⚡ (Week 1)
**Goal:** Establish Redis caching infrastructure with immediate 30-40% performance gains
**Risk Level:** Low
**Rollback Difficulty:** Easy (feature flag)

---

#### Task 1.1: Token Blacklist Caching
**Priority:** 🔴 Critical
**Impact:** High (reduces 22 queries → 1-2 per user session)
**File:** [`lib/cache/token-cache.ts`](../lib/cache/token-cache.ts) (NEW)

**Implementation:**

```typescript
/**
 * lib/cache/token-cache.ts
 * Caches token blacklist status with intelligent TTL
 */

import { db } from '@/lib/db';
import { token_blacklist } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  getCachedTokenBlacklistStatus,
  cacheTokenBlacklistStatus
} from './redis-rbac-cache';
import { log } from '@/lib/logger';

/**
 * Check if token is blacklisted with Redis caching
 *
 * Cache Strategy:
 * - Not blacklisted: 1 minute TTL (balance freshness vs hits)
 * - Blacklisted: 1 hour TTL (once blacklisted, stays blacklisted)
 */
export async function isTokenBlacklisted(tokenId: string): Promise<boolean> {
  // Check Redis cache first
  const cached = await getCachedTokenBlacklistStatus(tokenId);
  if (cached !== null) {
    log.debug('Token blacklist cache hit', {
      tokenId: tokenId.substring(0, 8),
      blacklisted: cached,
      component: 'token-cache',
    });
    return cached;
  }

  // Cache miss - query database
  log.debug('Token blacklist cache miss, querying database', {
    tokenId: tokenId.substring(0, 8),
    component: 'token-cache',
  });

  const [blacklisted] = await db
    .select()
    .from(token_blacklist)
    .where(eq(token_blacklist.jti, tokenId))
    .limit(1);

  const result = !!blacklisted;

  // Cache the result
  await cacheTokenBlacklistStatus(tokenId, result);

  return result;
}

/**
 * Invalidate token cache (call when token is blacklisted)
 */
export async function invalidateTokenCache(tokenId: string): Promise<void> {
  await cacheTokenBlacklistStatus(tokenId, true);

  log.info('Token cache invalidated', {
    tokenId: tokenId.substring(0, 8),
    component: 'token-cache',
  });
}
```

**Integration Points:**

1. **Update JWT validation** in [`lib/auth/jwt.ts`](../lib/auth/jwt.ts):
```typescript
// Before
const [blacklisted] = await db
  .select()
  .from(token_blacklist)
  .where(eq(token_blacklist.jti, jti))
  .limit(1);

if (blacklisted) {
  throw new TokenBlacklistedError();
}

// After
import { isTokenBlacklisted } from '@/lib/cache/token-cache';

if (await isTokenBlacklisted(jti)) {
  throw new TokenBlacklistedError();
}
```

2. **Update token blacklisting** in [`lib/auth/token-manager.ts`](../lib/auth/token-manager.ts):
```typescript
import { invalidateTokenCache } from '@/lib/cache/token-cache';

export async function blacklistToken(tokenId: string): Promise<void> {
  // Insert into database
  await db.insert(token_blacklist).values({ jti: tokenId, ... });

  // Update cache immediately
  await invalidateTokenCache(tokenId);
}
```

**Expected Results:**
- **Cache hit rate:** >95%
- **Response time:** 10ms → <1ms
- **DB load:** -95% for token checks
- **Queries eliminated:** ~20 per dashboard

**Testing Checklist:**
- [ ] Token blacklist check uses Redis cache
- [ ] Cache miss falls back to database
- [ ] Blacklisted tokens are cached correctly
- [ ] Cache invalidates when token is blacklisted
- [ ] Cache hit rate monitored in logs

---

#### Task 1.2: User Basic Info Caching
**Priority:** 🔴 Critical
**Impact:** High (reduces 33 queries → 1 per 5 minutes)
**File:** [`lib/cache/user-cache.ts`](../lib/cache/user-cache.ts) (NEW)

**Implementation:**

```typescript
/**
 * lib/cache/user-cache.ts
 * Caches basic user information with 5-minute TTL
 */

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getCachedUserBasic, cacheUserBasic } from './redis-rbac-cache';
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
 * Get user by ID with Redis caching
 *
 * Cache Strategy:
 * - TTL: 5 minutes
 * - Rationale: User data rarely changes, safe to cache
 * - Invalidation: Manual when user is updated
 */
export async function getUserById(userId: string): Promise<User | null> {
  // Check Redis cache first
  const cached = await getCachedUserBasic(userId);
  if (cached) {
    log.debug('User cache hit', {
      userId,
      email: cached.email,
      component: 'user-cache',
    });
    return cached;
  }

  // Cache miss - query database
  log.debug('User cache miss, querying database', {
    userId,
    component: 'user-cache',
  });

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

  if (user) {
    // Cache for 5 minutes
    await cacheUserBasic(userId, user);
  }

  return user || null;
}

/**
 * Invalidate user cache (call when user is updated)
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  const { redisDel } = await import('./redis-client');
  await redisDel(`user_basic:${userId}`);

  log.info('User cache invalidated', {
    userId,
    component: 'user-cache',
  });
}
```

**Integration Points:**

1. **Update JWT validation** in [`lib/auth/jwt.ts`](../lib/auth/jwt.ts):
```typescript
// Before
const [user] = await db
  .select()
  .from(users)
  .where(eq(users.user_id, payload.sub))
  .limit(1);

// After
import { getUserById } from '@/lib/cache/user-cache';

const user = await getUserById(payload.sub);
```

2. **Update user mutations** in [`lib/services/rbac-users-service.ts`](../lib/services/rbac-users-service.ts):
```typescript
import { invalidateUserCache } from '@/lib/cache/user-cache';

export async function updateUser(userId: string, data: UpdateUserData): Promise<void> {
  // Update database
  await db.update(users).set(data).where(eq(users.user_id, userId));

  // Invalidate cache
  await invalidateUserCache(userId);
}
```

**Expected Results:**
- **Queries:** 33 → 1 per dashboard
- **Cache hit rate:** >90%
- **TTL:** 5 minutes (safe for user data)
- **Response time:** 5-10ms → <1ms

**Testing Checklist:**
- [ ] User lookup uses Redis cache
- [ ] Cache miss falls back to database
- [ ] User updates invalidate cache
- [ ] Cache hit rate >90% in production
- [ ] No stale user data served

---

#### Task 1.3: JWT Payload Caching
**Priority:** 🟡 Medium
**Impact:** Medium (reduces crypto operations)
**File:** [`lib/auth/jwt.ts`](../lib/auth/jwt.ts) (UPDATE)

**Implementation:**

```typescript
/**
 * Update lib/auth/jwt.ts
 * Add caching to JWT verification
 */

import { cacheJWTPayload, getCachedJWTPayload } from '@/lib/cache/redis-rbac-cache';
import { log } from '@/lib/logger';

/**
 * Verify JWT token with Redis caching
 *
 * Cache Strategy:
 * - TTL: 5 minutes
 * - Rationale: Reduces expensive crypto operations
 * - Key: First 32 chars of token ID (unique identifier)
 */
export async function verifyToken(token: string): Promise<JWTPayload> {
  // Extract token ID without full verification
  const decoded = jwt.decode(token) as JWTPayload | null;
  if (!decoded?.jti) {
    throw new InvalidTokenError('Token missing JTI');
  }

  // Check cache first
  const cached = await getCachedJWTPayload(decoded.jti);
  if (cached) {
    log.debug('JWT payload cache hit', {
      tokenId: decoded.jti.substring(0, 8),
      component: 'jwt-cache',
    });
    return cached as JWTPayload;
  }

  // Cache miss - verify token (expensive crypto operation)
  log.debug('JWT payload cache miss, verifying token', {
    tokenId: decoded.jti.substring(0, 8),
    component: 'jwt-cache',
  });

  const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;

  // Cache for 5 minutes
  await cacheJWTPayload(decoded.jti, payload);

  return payload;
}
```

**Expected Results:**
- **Crypto operations:** Reduced by 90%
- **Response time:** ~5ms → <1ms per verification
- **CPU usage:** Reduced during high traffic

**Testing Checklist:**
- [ ] JWT verification uses cache
- [ ] Invalid tokens not cached
- [ ] Cache invalidates on logout
- [ ] Token expiry respected
- [ ] No security regressions

---

#### Task 1.4: Middleware Integration
**Priority:** 🔴 Critical
**File:** [`middleware.ts`](../middleware.ts) (UPDATE)

**Implementation:**

Update middleware to use cached functions:

```typescript
/**
 * Update middleware.ts
 * Use cached versions of auth functions
 */

import { isTokenBlacklisted } from '@/lib/cache/token-cache';
import { getUserById } from '@/lib/cache/user-cache';

async function validateAuthentication(request: NextRequest) {
  // ... existing JWT decode logic ...

  // Use cached token blacklist check
  if (await isTokenBlacklisted(jti)) {
    return createAuthError('Token has been revoked');
  }

  // Use cached user lookup
  const user = await getUserById(userId);
  if (!user) {
    return createAuthError('User not found');
  }

  // ... rest of validation ...
}
```

**Testing Checklist:**
- [ ] Middleware uses cached functions
- [ ] Authentication still secure
- [ ] Response time improved by 30%
- [ ] Database queries reduced
- [ ] No auth bypass vulnerabilities

---

#### Phase 1 Success Criteria

**Performance Metrics:**
- [ ] Token blacklist cache hit rate >95%
- [ ] User cache hit rate >90%
- [ ] JWT cache hit rate >85%
- [ ] Database queries reduced by 40-50%
- [ ] Dashboard load time improved by 30%
- [ ] Response time: ~1000ms → ~750ms

**Functional Requirements:**
- [ ] All authentication flows work correctly
- [ ] No security regressions
- [ ] Cache invalidation works
- [ ] Graceful degradation if Redis fails
- [ ] Monitoring in place

**Deployment Checklist:**
- [ ] Feature flag implemented
- [ ] Rollback plan documented
- [ ] Monitoring dashboards created
- [ ] Dev deployment successful
- [ ] Staging deployment successful
- [ ] Production deployment (10% → 50% → 100%)

---

### Phase 2: RBAC Optimization 🔒 (Week 2)
**Goal:** Eliminate duplicate RBAC lookups, achieve 60-70% total improvement
**Risk Level:** Medium
**Rollback Difficulty:** Medium (affects authorization)

---

#### Task 2.1: User Context Redis Caching
**Priority:** 🔴 Critical
**Impact:** Very High (reduces 62 operations → 1)
**File:** [`lib/rbac/cached-user-context.ts`](../lib/rbac/cached-user-context.ts) (UPDATE)

**Implementation:**

```typescript
/**
 * Update lib/rbac/cached-user-context.ts
 * Replace in-memory Map with Redis caching
 */

import {
  getCachedUserContext as getRedisUserContext,
  cacheUserContext as cacheRedisUserContext,
} from '@/lib/cache/redis-rbac-cache';
import { log } from '@/lib/logger';

/**
 * Get complete user context with Redis caching
 *
 * Cache Strategy:
 * - TTL: 5 minutes
 * - Shared across all ECS instances
 * - Survives server restarts
 * - Invalidated when roles/permissions change
 */
export async function getCachedUserContext(userId: string): Promise<UserContext> {
  const startTime = Date.now();

  // 1. Check Redis cache first
  const cached = await getRedisUserContext(userId);
  if (cached) {
    log.debug('User context Redis cache hit', {
      userId,
      rolesCount: cached.roles?.length || 0,
      permissionsCount: cached.all_permissions?.length || 0,
      duration: Date.now() - startTime,
      component: 'rbac-cache',
    });
    return cached;
  }

  // 2. Cache miss - load from database
  log.debug('User context cache miss, loading from database', {
    userId,
    component: 'rbac-cache',
  });

  // 3. Get basic user information
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

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  if (!user.is_active) {
    throw new Error(`User account is inactive: ${userId}`);
  }

  // 4. Get user's organizations
  const userOrgs = await db
    .select({
      user_organization_id: user_organizations.user_organization_id,
      user_id: user_organizations.user_id,
      organization_id: user_organizations.organization_id,
      is_active: user_organizations.is_active,
      joined_at: user_organizations.joined_at,
      created_at: user_organizations.created_at,
      // Organization details
      org_name: organizations.name,
      org_slug: organizations.slug,
      org_parent_id: organizations.parent_organization_id,
      org_is_active: organizations.is_active,
      org_created_at: organizations.created_at,
      org_updated_at: organizations.updated_at,
      org_deleted_at: organizations.deleted_at,
    })
    .from(user_organizations)
    .innerJoin(organizations, eq(user_organizations.organization_id, organizations.organization_id))
    .where(
      and(
        eq(user_organizations.user_id, userId),
        eq(user_organizations.is_active, true),
        eq(organizations.is_active, true)
      )
    );

  // 5. Get user's roles with cached permissions
  const userRolesData = await db
    .select({
      // User role info
      user_role_id: user_roles.user_role_id,
      user_id: user_roles.user_id,
      role_id: user_roles.role_id,
      user_role_organization_id: user_roles.organization_id,
      granted_by: user_roles.granted_by,
      granted_at: user_roles.granted_at,
      expires_at: user_roles.expires_at,
      user_role_is_active: user_roles.is_active,
      user_role_created_at: user_roles.created_at,

      // Role info
      role_name: roles.name,
      role_description: roles.description,
      role_organization_id: roles.organization_id,
      is_system_role: roles.is_system_role,
      role_is_active: roles.is_active,
      role_created_at: roles.created_at,
      role_updated_at: roles.updated_at,
      role_deleted_at: roles.deleted_at,
    })
    .from(user_roles)
    .innerJoin(roles, eq(user_roles.role_id, roles.role_id))
    .where(
      and(eq(user_roles.user_id, userId), eq(user_roles.is_active, true), eq(roles.is_active, true))
    );

  // 6. Get permissions for each role (use existing role cache)
  const rolesMap = new Map<string, Role>();
  const userRolesMap = new Map<string, UserRole>();

  for (const row of userRolesData) {
    if (!rolesMap.has(row.role_id)) {
      // Get permissions from cache (existing function, already optimized)
      const permissions = await getRolePermissions(row.role_id, row.role_name);

      rolesMap.set(row.role_id, {
        role_id: row.role_id,
        name: row.role_name,
        description: row.role_description || undefined,
        organization_id: row.role_organization_id || undefined,
        is_system_role: row.is_system_role ?? false,
        is_active: row.role_is_active ?? true,
        created_at: row.role_created_at ?? new Date(),
        updated_at: row.role_updated_at ?? new Date(),
        deleted_at: row.role_deleted_at || undefined,
        permissions,
      });
    }

    // Build user role mapping
    if (!userRolesMap.has(row.user_role_id)) {
      const role = rolesMap.get(row.role_id);
      if (role) {
        userRolesMap.set(row.user_role_id, {
          user_role_id: row.user_role_id,
          user_id: row.user_id,
          role_id: row.role_id,
          organization_id: row.user_role_organization_id || undefined,
          granted_by: row.granted_by || undefined,
          granted_at: row.granted_at ?? new Date(),
          expires_at: row.expires_at || undefined,
          is_active: row.user_role_is_active ?? true,
          created_at: row.user_role_created_at ?? new Date(),
          role: role,
        });
      }
    }
  }

  // 7. Build final user context
  const userContext: UserContext = {
    user_id: user.user_id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    is_active: user.is_active,
    email_verified: user.email_verified ?? false,
    roles: Array.from(rolesMap.values()),
    organizations: userOrgs.map((org) => ({
      organization_id: org.organization_id,
      name: org.org_name,
      slug: org.org_slug,
      parent_organization_id: org.org_parent_id || undefined,
      is_active: org.org_is_active ?? true,
      created_at: org.org_created_at ?? new Date(),
      updated_at: org.org_updated_at ?? new Date(),
      deleted_at: org.org_deleted_at || undefined,
    })),
    accessible_organizations: [], // Computed below
    user_roles: Array.from(userRolesMap.values()),
    user_organizations: userOrgs.map((org) => ({
      user_organization_id: org.user_organization_id,
      user_id: org.user_id,
      organization_id: org.organization_id,
      is_active: org.is_active ?? true,
      joined_at: org.joined_at ?? new Date(),
      created_at: org.created_at ?? new Date(),
    })),
    current_organization_id: userOrgs[0]?.organization_id || undefined,
    all_permissions: [],
    is_super_admin: false,
    organization_admin_for: [],
  };

  // Compute accessible organizations and permissions
  userContext.accessible_organizations = userContext.organizations;

  const uniquePermissionsMap = new Map<string, Permission>();
  userContext.roles.forEach((role) => {
    role.permissions.forEach((permission) => {
      uniquePermissionsMap.set(permission.permission_id, permission);
    });
  });
  userContext.all_permissions = Array.from(uniquePermissionsMap.values());

  userContext.is_super_admin = userContext.roles.some(
    (role) => role.is_system_role && role.name === 'super_admin'
  );

  userContext.organization_admin_for = userContext.roles
    .filter((role) => !role.is_system_role && role.name === 'practice_admin' && role.organization_id)
    .map((role) => role.organization_id!)
    .filter(Boolean);

  // 8. Cache in Redis (5 minutes)
  await cacheRedisUserContext(userId, userContext);

  log.info('User context loaded and cached', {
    userId,
    rolesCount: userContext.roles.length,
    permissionsCount: userContext.all_permissions.length,
    organizationsCount: userContext.organizations.length,
    duration: Date.now() - startTime,
    component: 'rbac-cache',
  });

  return userContext;
}
```

**Expected Results:**
- **Queries:** 55 RBAC queries → 1 per user per 5 minutes
- **Cache hit rate:** >85%
- **Load time:** 50ms → <5ms
- **Shared across ECS instances:** ✅

**Testing Checklist:**
- [ ] User context loads from Redis cache
- [ ] Cache miss loads from database correctly
- [ ] All RBAC checks work correctly
- [ ] Permissions are accurate
- [ ] No authorization bypass vulnerabilities
- [ ] Cache hit rate >85% in production

---

#### Task 2.2: Cache Invalidation Integration
**Priority:** 🔴 Critical (Security)
**Impact:** High (prevents stale permissions)
**File:** [`lib/rbac/cache-invalidation.ts`](../lib/rbac/cache-invalidation.ts) (UPDATE)

**Implementation:**

```typescript
/**
 * Update lib/rbac/cache-invalidation.ts
 * Add Redis cache invalidation
 */

import {
  invalidateUserContext as redisInvalidateUserContext,
  invalidateRolePermissions as redisInvalidateRolePermissions,
} from '@/lib/cache/redis-rbac-cache';
import { log } from '@/lib/logger';

/**
 * Invalidate role permissions cache when role is modified
 * This affects both in-memory and Redis caches
 */
export async function invalidateRolePermissions(roleId: string, roleName?: string): Promise<void> {
  // 1. Invalidate in-memory cache (existing)
  const wasInvalidated = rolePermissionCache.invalidate(roleId);
  rolePermissionCache.incrementRoleVersion(roleId);

  // 2. Invalidate Redis cache (NEW)
  await redisInvalidateRolePermissions(roleId);

  log.info('Role permissions invalidated (in-memory + Redis)', {
    roleId,
    roleName,
    wasInvalidated,
    operation: 'invalidateRolePermissions',
  });
}

/**
 * Invalidate user context when user roles change
 */
export async function invalidateUserContext(userId: string, reason?: string): Promise<void> {
  // Invalidate Redis cache
  await redisInvalidateUserContext(userId);

  log.info('User context invalidated', {
    userId,
    reason,
    operation: 'invalidateUserContext',
  });
}

/**
 * Invalidate all users with a specific role
 * Called when role permissions are updated
 */
export async function invalidateUsersWithRole(roleId: string, reason: string = 'role_modified'): Promise<void> {
  const startTime = Date.now();

  try {
    // 1. Get all users with this role
    const usersWithRole = await getUsersWithRole(roleId);

    if (usersWithRole.length === 0) {
      log.info('No users found with role - no contexts to invalidate', {
        roleId,
        reason,
      });
      return;
    }

    // 2. Invalidate each user's context
    for (const user of usersWithRole) {
      await invalidateUserContext(user.user_id, reason);
    }

    // 3. Revoke tokens (existing logic)
    await invalidateUserTokensWithRole(roleId, reason);

    log.info('All users with role invalidated', {
      roleId,
      reason,
      affectedUsers: usersWithRole.length,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    log.error(
      'Failed to invalidate users with role',
      error instanceof Error ? error : new Error(String(error)),
      {
        roleId,
        reason,
        duration: Date.now() - startTime,
      }
    );
    throw error;
  }
}
```

**Integration Points:**

Add invalidation calls to all endpoints that modify RBAC:

1. **Role updates** - [`lib/services/rbac-roles-service.ts`](../lib/services/rbac-roles-service.ts):
```typescript
import { invalidateRolePermissions, invalidateUsersWithRole } from '@/lib/rbac/cache-invalidation';

export async function updateRolePermissions(roleId: string, permissions: string[]): Promise<void> {
  // Update database
  await updateRolePermissionsInDB(roleId, permissions);

  // Invalidate caches
  await invalidateRolePermissions(roleId);
  await invalidateUsersWithRole(roleId, 'permissions_updated');
}
```

2. **User role assignments** - [`lib/services/rbac-users-service.ts`](../lib/services/rbac-users-service.ts):
```typescript
import { invalidateUserContext } from '@/lib/rbac/cache-invalidation';

export async function assignUserRole(userId: string, roleId: string): Promise<void> {
  // Update database
  await assignRoleInDB(userId, roleId);

  // Invalidate user context
  await invalidateUserContext(userId, 'role_assigned');
}
```

3. **Organization membership** - [`lib/services/rbac-organizations-service.ts`](../lib/services/rbac-organizations-service.ts):
```typescript
import { invalidateUserContext } from '@/lib/rbac/cache-invalidation';

export async function addUserToOrganization(userId: string, orgId: string): Promise<void> {
  // Update database
  await addToOrganizationInDB(userId, orgId);

  // Invalidate user context
  await invalidateUserContext(userId, 'organization_added');
}
```

**Trigger Points (Complete List):**

| Event | Function to Call | File to Update |
|-------|------------------|----------------|
| Role permissions updated | `invalidateRolePermissions(roleId)` + `invalidateUsersWithRole(roleId)` | `lib/services/rbac-roles-service.ts` |
| User role assigned | `invalidateUserContext(userId)` | `lib/services/rbac-users-service.ts` |
| User role removed | `invalidateUserContext(userId)` | `lib/services/rbac-users-service.ts` |
| User organization added | `invalidateUserContext(userId)` | `lib/services/rbac-organizations-service.ts` |
| User organization removed | `invalidateUserContext(userId)` | `lib/services/rbac-organizations-service.ts` |
| User updated (name, email, etc.) | `invalidateUserCache(userId)` | `lib/services/rbac-users-service.ts` |
| Permission granted to role | `invalidateRolePermissions(roleId)` + `invalidateUsersWithRole(roleId)` | `lib/services/rbac-permissions-service.ts` |
| Permission revoked from role | `invalidateRolePermissions(roleId)` + `invalidateUsersWithRole(roleId)` | `lib/services/rbac-permissions-service.ts` |
| User logs out | `invalidateJWTPayload(tokenId)` | `app/api/auth/logout/route.ts` |
| Token blacklisted | `invalidateTokenCache(tokenId)` | `lib/auth/token-manager.ts` |

**Testing Checklist:**
- [ ] Role permission updates invalidate cache
- [ ] User role changes invalidate user context
- [ ] Organization changes invalidate user context
- [ ] All trigger points implemented
- [ ] No stale data served after updates
- [ ] Invalidation completes in <100ms

---

#### Task 2.3: Role Permission Redis Migration (Optional)
**Priority:** 🟢 Low (current implementation is good)
**Impact:** Medium (shared cache, survives restarts)
**File:** [`lib/cache/role-permission-cache.ts`](../lib/cache/role-permission-cache.ts) (UPDATE)

**Rationale:**
Current in-memory implementation works well (24-hour TTL, good hit rate). Migration to Redis provides:
- Shared cache across ECS instances
- Survives server restarts
- Better monitoring capabilities

**Implementation:**

```typescript
/**
 * Update lib/cache/role-permission-cache.ts
 * Backend by Redis instead of in-memory Map
 */

import {
  getCachedRolePermissions,
  cacheRolePermissions
} from './redis-rbac-cache';

export class RolePermissionCache {
  async get(roleId: string): Promise<{ roleName: string; permissions: Permission[] } | null> {
    // Check Redis first
    const cached = await getCachedRolePermissions(roleId);
    if (cached) return cached;

    // Not in cache
    return null;
  }

  async set(roleId: string, roleName: string, permissions: Permission[]): Promise<void> {
    await cacheRolePermissions(roleId, roleName, permissions);
  }

  // ... rest of implementation
}
```

**Expected Results:**
- **Shared cache:** All ECS instances share role permissions
- **Persistence:** Survives restarts
- **Monitoring:** Better visibility into cache usage

**Testing Checklist:**
- [ ] Role permissions cache in Redis
- [ ] Cache hit rate maintained (>95%)
- [ ] All RBAC checks work correctly
- [ ] No performance regression

---

#### Phase 2 Success Criteria

**Performance Metrics:**
- [ ] RBAC queries reduced by 90% (55 → 5)
- [ ] User context cache hit rate >85%
- [ ] Dashboard load time improved by 60%
- [ ] Response time: ~750ms → ~550ms
- [ ] Database load reduced by 60-70%

**Functional Requirements:**
- [ ] All RBAC checks work correctly
- [ ] Cache invalidation works properly
- [ ] No stale permissions served
- [ ] No authorization bypass vulnerabilities
- [ ] Token revocation still works

**Security Requirements:**
- [ ] Cache invalidation tested for all trigger points
- [ ] Stale data test: Update role, verify cache clears
- [ ] Security audit: No permission escalation bugs
- [ ] Penetration test: No auth bypass through cache

**Deployment Checklist:**
- [ ] Dev deployment successful
- [ ] Staging load testing passed
- [ ] Security review passed
- [ ] Production deployment (10% → 50% → 100%)
- [ ] Monitoring confirms 60-70% improvement

---

### Phase 3: Rate Limiting 🚦 (Week 2)
**Goal:** Distributed rate limiting across ECS instances
**Risk Level:** Low
**Rollback Difficulty:** Easy

---

#### Task 3.1: Redis-Backed Rate Limiter
**Priority:** 🟡 Medium
**Impact:** Medium (prevents rate limit bypass)
**File:** [`lib/cache/redis-rate-limit.ts`](../lib/cache/redis-rate-limit.ts) (NEW)

**Implementation:**

```typescript
/**
 * lib/cache/redis-rate-limit.ts
 * Distributed rate limiting using Redis
 */

import { getRedisClient } from './redis-client';
import { log } from '@/lib/logger';

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
}

/**
 * Redis-backed rate limiter with sliding window
 *
 * Strategy:
 * - Uses Redis INCR with expiry for atomic counting
 * - Sliding window per time interval
 * - Shared across all ECS instances
 * - Graceful fallback to in-memory if Redis unavailable
 */
export class RedisRateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private inMemoryFallback: Map<string, { count: number; resetTime: number }>;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.inMemoryFallback = new Map();

    // Cleanup fallback cache every 5 minutes
    setInterval(() => this.cleanupFallback(), 5 * 60 * 1000);
  }

  /**
   * Check rate limit for identifier (IP address or user ID)
   */
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const client = getRedisClient();

    // Fallback to in-memory if Redis unavailable
    if (!client) {
      log.warn('Redis unavailable, using in-memory rate limiting', {
        identifier,
        component: 'rate-limit',
      });
      return this.checkLimitInMemory(identifier);
    }

    try {
      return await this.checkLimitRedis(identifier, client);
    } catch (error) {
      log.error(
        'Redis rate limit check failed, falling back to in-memory',
        error instanceof Error ? error : new Error(String(error)),
        {
          identifier,
          component: 'rate-limit',
        }
      );
      return this.checkLimitInMemory(identifier);
    }
  }

  /**
   * Check rate limit using Redis
   */
  private async checkLimitRedis(identifier: string, client: Redis): Promise<RateLimitResult> {
    const now = Date.now();
    const windowKey = `ratelimit:${identifier}:${Math.floor(now / this.windowMs)}`;

    // Increment counter atomically
    const count = await client.incr(windowKey);

    // Set expiry on first increment
    if (count === 1) {
      await client.pexpire(windowKey, this.windowMs);
    }

    const resetTime = Math.ceil((now + this.windowMs) / this.windowMs) * this.windowMs;
    const remaining = Math.max(0, this.maxRequests - count);

    return {
      success: count <= this.maxRequests,
      remaining,
      resetTime,
    };
  }

  /**
   * Fallback to in-memory rate limiting
   */
  private checkLimitInMemory(identifier: string): RateLimitResult {
    const now = Date.now();
    const resetTime = now + this.windowMs;
    const existing = this.inMemoryFallback.get(identifier);

    if (!existing || now > existing.resetTime) {
      this.inMemoryFallback.set(identifier, { count: 1, resetTime });
      return { success: true, remaining: this.maxRequests - 1, resetTime };
    }

    existing.count++;
    const remaining = Math.max(0, this.maxRequests - existing.count);

    return {
      success: existing.count <= this.maxRequests,
      remaining,
      resetTime: existing.resetTime,
    };
  }

  /**
   * Cleanup expired in-memory entries
   */
  private cleanupFallback(): void {
    const now = Date.now();
    for (const [key, entry] of this.inMemoryFallback.entries()) {
      if (now > entry.resetTime) {
        this.inMemoryFallback.delete(key);
      }
    }
  }
}

// Export pre-configured limiters
export const globalRateLimiter = new RedisRateLimiter(15 * 60 * 1000, 100); // 100 req/15min
export const authRateLimiter = new RedisRateLimiter(15 * 60 * 1000, 20); // 20 req/15min
export const apiRateLimiter = new RedisRateLimiter(60 * 1000, 200); // 200 req/min
export const mfaRateLimiter = new RedisRateLimiter(15 * 60 * 1000, 5); // 5 req/15min
```

**Integration:**

Update [`lib/api/middleware/rate-limit.ts`](../lib/api/middleware/rate-limit.ts):

```typescript
/**
 * Update lib/api/middleware/rate-limit.ts
 * Use Redis-backed rate limiters
 */

import {
  RedisRateLimiter,
  globalRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  mfaRateLimiter,
} from '@/lib/cache/redis-rate-limit';

// Remove old in-memory limiters
// Replace with imported Redis limiters

export async function applyRateLimit(
  request: Request,
  type: 'auth' | 'api' | 'upload' | 'mfa' = 'api'
): Promise<{
  success: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
  windowMs: number;
}> {
  const rateLimitKey = getRateLimitKey(request, type);
  let limiter: RedisRateLimiter;
  let limit: number;
  let windowMs: number;

  switch (type) {
    case 'auth':
      limiter = authRateLimiter;
      limit = 20;
      windowMs = 15 * 60 * 1000;
      break;
    case 'mfa':
      limiter = mfaRateLimiter;
      limit = 5;
      windowMs = 15 * 60 * 1000;
      break;
    case 'upload':
      limiter = new RedisRateLimiter(60 * 1000, 10);
      limit = 10;
      windowMs = 60 * 1000;
      break;
    case 'api':
    default:
      limiter = apiRateLimiter;
      limit = 200;
      windowMs = 60 * 1000;
      break;
  }

  const result = await limiter.checkLimit(rateLimitKey);

  if (!result.success) {
    const error = RateLimitError(result.resetTime);
    error.details = {
      limit,
      windowMs,
      resetTime: result.resetTime,
      retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      type,
    };
    throw error;
  }

  return {
    ...result,
    limit,
    windowMs,
  };
}
```

**Expected Results:**
- **Consistent limits** across all ECS instances
- **No bypass** by hitting different instances
- **Graceful fallback** to in-memory if Redis fails
- **Atomic operations** (no race conditions)

**Testing Checklist:**
- [ ] Rate limiting works across multiple instances
- [ ] User hitting different instances gets consistent limits
- [ ] Fallback to in-memory works when Redis fails
- [ ] No race conditions in counter increments
- [ ] Rate limit headers correct

---

#### Phase 3 Success Criteria

**Performance Metrics:**
- [ ] Rate limiting consistent across instances
- [ ] No rate limit bypass detected in testing
- [ ] Fallback to in-memory works correctly
- [ ] Redis operations <1ms

**Functional Requirements:**
- [ ] All rate limit types work correctly
- [ ] Headers include correct remaining/reset times
- [ ] Rate limit errors have proper retry-after
- [ ] In-memory fallback tested

**Deployment Checklist:**
- [ ] Dev testing passed
- [ ] Multi-instance testing passed
- [ ] Staging deployment successful
- [ ] Production deployment successful

---

### Phase 4: Dashboard Optimization 📊 (Week 3)
**Goal:** Eliminate duplicate chart requests, cache chart data
**Risk Level:** Medium
**Rollback Difficulty:** Easy (keep old endpoint)

---

#### Task 4.1: Chart Data Batch Endpoint
**Priority:** 🔴 Critical
**Impact:** Very High (6 requests → 1, shared auth)
**File:** [`app/api/admin/analytics/chart-data-batch/route.ts`](../app/api/admin/analytics/chart-data-batch/route.ts) (NEW)

**Implementation:**

```typescript
/**
 * app/api/admin/analytics/chart-data-batch/route.ts
 * Batch endpoint for loading multiple charts in single request
 */

import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import type { UserContext } from '@/lib/types/rbac';
import type { ChartData, ChartConfig } from '@/lib/types/analytics';
import { redisGet, redisSet } from '@/lib/cache/redis-client';
import { log } from '@/lib/logger';
import { generateChartData } from '@/lib/services/chart-generator';

/**
 * Generate cache key for chart configuration
 *
 * Strategy:
 * - Hash chart config to create unique key
 * - Include user context for RBAC-filtered data
 * - Different keys for different filter combinations
 */
function generateChartCacheKey(
  config: ChartConfig,
  userContext: UserContext
): string {
  const filterHash = JSON.stringify({
    measure: config.measure,
    frequency: config.frequency,
    startDate: config.startDate,
    endDate: config.endDate,
    filters: config.advancedFilters || [],
    practice: config.practice,
    providerName: config.providerName,
    // Include user's accessible organizations for RBAC
    organizations: userContext.accessible_organizations.map(o => o.organization_id).sort(),
  });

  // Simple hash function (could use crypto.createHash for production)
  const hash = Buffer.from(filterHash).toString('base64').substring(0, 32);

  return `chart:${hash}`;
}

/**
 * Determine TTL based on date range
 *
 * Strategy:
 * - Real-time data (today): 1 minute
 * - Recent data (this week): 5 minutes
 * - Historical data (>1 week): 1 hour
 */
function getChartCacheTTL(startDate: string, endDate: string): number {
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
 * Batch Chart Data Handler
 * POST /api/admin/analytics/chart-data-batch
 *
 * Loads multiple charts in a single API request with:
 * - Single authentication check (shared across all charts)
 * - Parallel chart generation
 * - Redis caching per chart
 * - Optimal TTL based on data freshness
 */
const batchChartDataHandler = async (
  request: NextRequest,
  userContext: UserContext
) => {
  const startTime = Date.now();

  log.info('Batch chart data request initiated', {
    requestingUserId: userContext.user_id,
    currentOrganizationId: userContext.current_organization_id,
  });

  try {
    // 1. Parse request body
    const { charts } = await request.json();

    if (!Array.isArray(charts) || charts.length === 0) {
      return createErrorResponse('Charts array is required and must not be empty', 400, request);
    }

    if (charts.length > 20) {
      return createErrorResponse('Maximum 20 charts per batch request', 400, request);
    }

    log.info('Batch chart request validated', {
      requestingUserId: userContext.user_id,
      chartCount: charts.length,
    });

    // 2. Process charts in parallel
    const results = await Promise.all(
      charts.map(async (config: ChartConfig, index: number) => {
        const chartStartTime = Date.now();

        try {
          // Check cache first
          const cacheKey = generateChartCacheKey(config, userContext);
          const cached = await redisGet<ChartData>(cacheKey);

          if (cached) {
            log.debug('Chart data cache hit', {
              requestingUserId: userContext.user_id,
              chartIndex: index,
              measure: config.measure,
              cacheKey,
              component: 'chart-cache',
            });

            return {
              index,
              chartData: cached,
              fromCache: true,
              duration: Date.now() - chartStartTime,
            };
          }

          // Cache miss - generate chart data
          log.debug('Chart data cache miss, generating', {
            requestingUserId: userContext.user_id,
            chartIndex: index,
            measure: config.measure,
            component: 'chart-cache',
          });

          const chartData = await generateChartData(config, userContext);

          // Cache with appropriate TTL
          const ttl = getChartCacheTTL(config.startDate, config.endDate);
          await redisSet(cacheKey, chartData, ttl);

          log.info('Chart data generated and cached', {
            requestingUserId: userContext.user_id,
            chartIndex: index,
            measure: config.measure,
            duration: Date.now() - chartStartTime,
            ttl,
            component: 'chart-cache',
          });

          return {
            index,
            chartData,
            fromCache: false,
            duration: Date.now() - chartStartTime,
          };
        } catch (error) {
          log.error(
            'Chart generation failed',
            error instanceof Error ? error : new Error(String(error)),
            {
              requestingUserId: userContext.user_id,
              chartIndex: index,
              measure: config.measure,
            }
          );

          return {
            index,
            error: error instanceof Error ? error.message : 'Chart generation failed',
            duration: Date.now() - chartStartTime,
          };
        }
      })
    );

    const totalDuration = Date.now() - startTime;
    const successCount = results.filter(r => !r.error).length;
    const cacheHits = results.filter(r => r.fromCache).length;

    log.info('Batch chart data request completed', {
      requestingUserId: userContext.user_id,
      totalCharts: charts.length,
      successCount,
      failureCount: charts.length - successCount,
      cacheHits,
      cacheHitRate: ((cacheHits / charts.length) * 100).toFixed(1) + '%',
      totalDuration,
    });

    // 3. Return results
    const response = createSuccessResponse({
      charts: results,
      metadata: {
        totalCharts: charts.length,
        successCount,
        cacheHits,
        duration: totalDuration,
      },
    });

    // Add caching headers
    response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=30');
    response.headers.set('X-Batch-Request', 'true');
    response.headers.set('X-Cache-Hits', cacheHits.toString());

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Batch chart data request failed', error instanceof Error ? error : new Error(String(error)), {
      duration,
      requestingUserId: userContext.user_id,
      currentOrganizationId: userContext.current_organization_id,
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to process batch chart request',
      500,
      request
    );
  }
};

export const POST = rbacRoute(batchChartDataHandler, {
  permission: ['analytics:read:organization', 'analytics:read:all'],
  rateLimit: 'api',
});
```

**Helper Function:**

Create [`lib/services/chart-generator.ts`](../lib/services/chart-generator.ts):

```typescript
/**
 * lib/services/chart-generator.ts
 * Extracts chart generation logic for reuse
 */

import type { ChartConfig, ChartData, UserContext } from '@/lib/types/analytics';
import { SimplifiedChartTransformer } from '@/lib/utils/simplified-chart-transformer';
import { analyticsQueryBuilder } from './analytics-query-builder';
import { loadColumnMetadata } from '@/lib/utils/chart-metadata-loader.server';
import { getDateRange } from '@/lib/utils/date-presets';

export async function generateChartData(
  config: ChartConfig,
  userContext: UserContext
): Promise<ChartData> {
  // This is extracted from app/api/admin/analytics/chart-data/route.ts
  // Use existing logic from that file

  const { startDate, endDate } = getDateRange(
    config.dateRangePreset,
    config.startDate,
    config.endDate
  );

  const queryParams = {
    measure: config.measure,
    frequency: config.frequency,
    practice: config.practice,
    practice_uid: config.practiceUid ? parseInt(config.practiceUid, 10) : undefined,
    provider_name: config.providerName,
    start_date: startDate,
    end_date: endDate,
    advanced_filters: config.advancedFilters,
    calculated_field: config.calculatedField,
    data_source_id: config.dataSourceId,
    limit: 1000,
    multiple_series: config.multipleSeries,
    period_comparison: config.periodComparison,
  };

  const chartContext = {
    user_id: userContext.user_id,
    accessible_practices: [],
    accessible_providers: [],
    roles: userContext.roles?.map((role) => role.name) || [],
  };

  const result = await analyticsQueryBuilder.queryMeasures(queryParams, chartContext);
  let measures = result.data;

  if (config.calculatedField && measures.length > 0) {
    measures = calculatedFieldsService.applyCalculatedField(config.calculatedField, measures);
  }

  const metadata = config.dataSourceId
    ? await loadColumnMetadata(config.dataSourceId)
    : undefined;

  const transformer = new SimplifiedChartTransformer(metadata);

  let transformChartType = config.chartType;
  if (config.chartType === 'stacked-bar') {
    transformChartType = 'bar';
  } else if (config.chartType === 'dual-axis' || config.chartType === 'number') {
    transformChartType = 'bar';
  }

  let chartData: ChartData;

  if (config.multipleSeries && config.multipleSeries.length > 0) {
    const aggregations = {};
    config.multipleSeries.forEach(series => {
      if (series.label) {
        aggregations[series.label] = series.aggregation;
      }
    });

    chartData = transformer.createEnhancedMultiSeriesChart(
      measures,
      'measure',
      aggregations,
      config.colorPalette
    );
  } else if (measures.some(m => m.series_id === 'current' || m.series_id === 'comparison')) {
    chartData = transformer.transformDataWithPeriodComparison(
      measures,
      transformChartType,
      config.groupBy,
      config.colorPalette
    );
  } else {
    chartData = transformer.transformData(
      measures,
      transformChartType,
      config.groupBy,
      config.colorPalette
    );
  }

  return chartData;
}
```

**Expected Results:**
- **API requests:** 6 → 1 per dashboard
- **Auth overhead:** 6 × 30ms → 1 × 30ms (83% reduction)
- **Response time:** ~6000ms total → ~1200ms (80% improvement)
- **DB queries:** ~60 → ~10 per dashboard

**Testing Checklist:**
- [ ] Batch endpoint accepts multiple charts
- [ ] Charts processed in parallel
- [ ] Cache works correctly per chart
- [ ] TTL varies based on data freshness
- [ ] Errors in one chart don't affect others
- [ ] Response includes cache hit metadata

---

#### Task 4.2: Dashboard View Update
**Priority:** 🔴 Critical
**File:** [`components/charts/dashboard-view.tsx`](../components/charts/dashboard-view.tsx) (UPDATE)

**Implementation:**

```typescript
/**
 * Update components/charts/dashboard-view.tsx
 * Use batch endpoint instead of individual requests
 */

'use client';

import { useState, useEffect } from 'react';
import AnalyticsChart from './analytics-chart';
import type { Dashboard, DashboardChart, ChartDefinition } from '@/lib/types/analytics';
import { apiClient } from '@/lib/api/client';

interface DashboardViewProps {
  dashboard: Dashboard;
  dashboardCharts: DashboardChart[];
}

export default function DashboardView({
  dashboard,
  dashboardCharts
}: DashboardViewProps) {
  const [availableCharts, setAvailableCharts] = useState<ChartDefinition[]>([]);
  const [chartDataMap, setChartDataMap] = useState<Map<string, any>>(new Map());
  const [isLoadingCharts, setIsLoadingCharts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load chart definitions and data
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // 1. Load chart definitions
      const result = await apiClient.get<{ charts: ChartDefinition[] }>(
        '/api/admin/analytics/charts?is_active=true'
      );
      const charts = (result.charts || [])
        .map((item: ChartDefinition) => (item as any).chart_definitions || item)
        .filter((chart: ChartDefinition) => chart.is_active !== false);

      setAvailableCharts(charts);

      // 2. Build chart configs for batch request
      const chartConfigs = dashboardCharts
        .map((chartAssoc) => {
          const chartDef = charts.find(c => c.chart_definition_id === chartAssoc.chart_definition_id);
          if (!chartDef) return null;

          return {
            chartDefinitionId: chartDef.chart_definition_id,
            chartType: chartDef.chart_type,
            measure: chartDef.default_measure,
            frequency: chartDef.default_frequency,
            groupBy: chartDef.default_group_by,
            startDate: chartDef.default_start_date,
            endDate: chartDef.default_end_date,
            dateRangePreset: chartDef.default_date_range_preset,
            advancedFilters: chartDef.default_filters,
            colorPalette: chartDef.color_palette,
            multipleSeries: chartDef.multiple_series_config,
            periodComparison: chartDef.period_comparison_config,
          };
        })
        .filter(Boolean);

      // 3. Load all chart data in single batch request
      const batchResult = await apiClient.post('/api/admin/analytics/chart-data-batch', {
        charts: chartConfigs,
      });

      // 4. Map results to chart definitions
      const dataMap = new Map();
      batchResult.charts.forEach((result: any) => {
        if (!result.error) {
          const config = chartConfigs[result.index];
          dataMap.set(config.chartDefinitionId, {
            chartData: result.chartData,
            fromCache: result.fromCache,
            duration: result.duration,
          });
        }
      });

      setChartDataMap(dataMap);

      // Log performance metrics
      console.log('Dashboard loaded:', {
        totalCharts: chartConfigs.length,
        cacheHits: batchResult.metadata.cacheHits,
        duration: batchResult.metadata.duration,
      });

    } catch (error) {
      console.error('Failed to load dashboard:', error);
      setError('Failed to load dashboard data');
    } finally {
      setIsLoadingCharts(false);
    }
  };

  // ... rest of component
}
```

**Expected Results:**
- **Network requests:** 6 → 1 (single batch request)
- **Total load time:** ~2500ms → ~800ms (68% improvement)
- **User experience:** Much faster dashboard loading

**Testing Checklist:**
- [ ] Dashboard loads with single batch request
- [ ] All charts render correctly
- [ ] Cache hits logged in console
- [ ] Errors handled gracefully
- [ ] Loading states work correctly

---

#### Task 4.3: Keep Legacy Endpoint (Optional)
**Priority:** 🟢 Low
**Rationale:** Backwards compatibility

Keep [`app/api/admin/analytics/chart-data/route.ts`](../app/api/admin/analytics/chart-data/route.ts) for:
- Individual chart loading (if needed)
- Backwards compatibility
- Gradual migration

**Implementation:**
- No changes needed to existing endpoint
- Both endpoints coexist
- Deprecate old endpoint after migration complete

---

#### Phase 4 Success Criteria

**Performance Metrics:**
- [ ] Dashboard load time: ~2500ms → ~800ms (68% improvement)
- [ ] API requests per dashboard: 6 → 1 (83% reduction)
- [ ] Chart data cache hit rate: >60%
- [ ] Total database queries: 113 → 25 (78% reduction)

**Functional Requirements:**
- [ ] All dashboards load correctly
- [ ] All chart types supported
- [ ] Cache TTL varies correctly
- [ ] Batch request handles errors gracefully
- [ ] Legacy endpoint still works

**User Experience:**
- [ ] Dashboards load noticeably faster
- [ ] No visual regressions
- [ ] Loading states smooth
- [ ] Error handling clear

**Deployment Checklist:**
- [ ] Dev testing passed
- [ ] Staging load testing passed
- [ ] Production deployment (10% → 50% → 100%)
- [ ] User feedback positive
- [ ] Monitoring confirms 68% improvement

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
| User organization added | User context | `invalidateUserContext(userId, 'org_added')` | `lib/services/rbac-organizations-service.ts` | 🔴 Critical |
| User organization removed | User context | `invalidateUserContext(userId, 'org_removed')` | `lib/services/rbac-organizations-service.ts` | 🔴 Critical |
| User deactivated | User basic + context | `invalidateUserCache(userId)` + `invalidateUserContext(userId)` | `lib/services/rbac-users-service.ts` | 🔴 Critical |
| **Role Management** |
| Role permissions updated | Role perms + all users with role | `invalidateRolePermissions(roleId)` + `invalidateUsersWithRole(roleId)` | `lib/services/rbac-roles-service.ts` | 🔴 Critical |
| Permission granted to role | Role perms + all users with role | `invalidateRolePermissions(roleId)` + `invalidateUsersWithRole(roleId)` | `lib/services/rbac-permissions-service.ts` | 🔴 Critical |
| Permission revoked from role | Role perms + all users with role | `invalidateRolePermissions(roleId)` + `invalidateUsersWithRole(roleId)` | `lib/services/rbac-permissions-service.ts` | 🔴 Critical |
| Role deleted | Role perms + all users with role | `invalidateRolePermissions(roleId)` + `invalidateUsersWithRole(roleId)` | `lib/services/rbac-roles-service.ts` | 🔴 Critical |
| **Authentication** |
| User logs out | JWT payload | `invalidateJWTPayload(tokenId)` | `app/api/auth/logout/route.ts` | 🔴 Critical |
| Token blacklisted | Token blacklist cache | `invalidateTokenCache(tokenId)` | `lib/auth/token-manager.ts` | 🔴 Critical |
| All user tokens revoked | JWT payload (all user's tokens) | `invalidateAllUserTokens(userId)` | `lib/auth/token-manager.ts` | 🔴 Critical |
| Password changed | JWT payload + token blacklist | `invalidateAllUserTokens(userId)` | `lib/services/rbac-users-service.ts` | 🔴 Critical |
| **Dashboard & Charts** |
| Chart definition updated | Chart data (for that chart) | `invalidateChartCache(chartDefId)` | `lib/services/rbac-charts-service.ts` | 🟡 Medium |
| Dashboard updated | None (client-side layout) | N/A | N/A | N/A |
| **Organization** |
| Organization settings changed | User contexts (all org members) | `invalidateOrganizationMembers(orgId)` | `lib/services/rbac-organizations-service.ts` | 🟡 Medium |

---

### Time-Based Expiration (TTL)

**TTL Reference Table:**

| Cache Type | TTL | Rationale | Trade-offs |
|------------|-----|-----------|------------|
| **Authentication** |
| Token blacklist (not blacklisted) | 1 min | Balance between freshness and performance | Very low: Could serve valid token for 1 min after blacklist |
| Token blacklist (blacklisted) | 1 hour | Once blacklisted, stays blacklisted | None: Blacklisted tokens stay blacklisted |
| JWT payload | 5 min | Token expires anyway (24 hrs) | Low: Logged out user could access for 5 min if token not blacklisted |
| User basic info | 5 min | Rarely changes, safe to cache | Low: Name change takes 5 min to propagate |
| **RBAC** |
| User context | 5 min | Contains roles/permissions | Medium: Permission changes take 5 min (mitigated by manual invalidation) |
| Role permissions | 24 hours | Changes trigger manual invalidation | None: Manual invalidation on every change |
| **Rate Limiting** |
| Rate limit counters | Window duration | Sliding window expiry | None: Intrinsic to algorithm |
| **Dashboard** |
| Chart data (today) | 1 min | Real-time requirement | None: Fresh enough for real-time |
| Chart data (this week) | 5 min | Recent but not real-time | None: Good balance |
| Chart data (historical) | 1 hour | Static historical data | None: Historical data doesn't change |
| **Session** |
| Session validation | 1 min | Frequent changes unlikely | Low: Session revocation takes 1 min |

---

### Cache Warming Strategy (Optional)

**When to Warm Cache:**
- Application startup
- After deployment
- During low-traffic periods

**What to Warm:**
1. **Common role permissions** (super_admin, practice_admin, user)
2. **Active user contexts** (top 100 most active users)
3. **Popular chart data** (default dashboard charts)

**Implementation:**

```typescript
/**
 * lib/cache/cache-warmer.ts
 * Pre-populate cache with frequently accessed data
 */

import { log } from '@/lib/logger';
import { getCachedUserContext } from '@/lib/rbac/cached-user-context';
import { getCachedRolePermissions } from '@/lib/cache/redis-rbac-cache';
import { db, roles } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function warmCache(): Promise<void> {
  const startTime = Date.now();

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
      await getCachedRolePermissions(role.role_id);
    }

    log.info('Cache warming completed', {
      component: 'cache-warmer',
      rolesWarmed: commonRoles.length,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    log.error(
      'Cache warming failed',
      error instanceof Error ? error : new Error(String(error)),
      {
        component: 'cache-warmer',
        duration: Date.now() - startTime,
      }
    );
  }
}

// Call on application startup
if (process.env.NODE_ENV === 'production') {
  warmCache();
}
```

---

## 📈 Monitoring & Observability

### Metrics to Track

**Performance Metrics:**
```typescript
// Track in CloudWatch or custom dashboard
{
  "cache_hit_rate": {
    "token_blacklist": 0.95,
    "user_basic": 0.90,
    "user_context": 0.85,
    "role_permissions": 0.95,
    "chart_data": 0.65
  },
  "response_times": {
    "p50": 250,
    "p95": 500,
    "p99": 750
  },
  "database_queries": {
    "per_dashboard": 25,
    "per_api_request": 2.5
  },
  "redis_operations": {
    "gets_per_second": 150,
    "sets_per_second": 15,
    "avg_latency_ms": 1.2
  }
}
```

**Health Metrics:**
```typescript
{
  "redis_status": "healthy",
  "redis_connection_errors": 0,
  "cache_fallback_triggers": 0,
  "invalidation_failures": 0
}
```

**Business Metrics:**
```typescript
{
  "dashboard_load_time_improvement": "68%",
  "user_satisfaction_score": 4.5,
  "support_tickets_performance": -40
}
```

### CloudWatch Dashboards

Create custom CloudWatch dashboard with:

1. **Redis Performance Panel:**
   - Cache hit rates (by cache type)
   - Redis operation latencies
   - Connection errors
   - Memory usage

2. **Application Performance Panel:**
   - API response times (p50, p95, p99)
   - Database query counts
   - Dashboard load times
   - Error rates

3. **Business Metrics Panel:**
   - Active users
   - Dashboards loaded
   - Charts rendered
   - User satisfaction proxy (repeat visits)

### Alerts

**Critical Alerts (PagerDuty):**
- Redis connection failures > 5% for 5 minutes
- Cache fallback rate > 10% for 10 minutes
- Dashboard load time > 5s (p95) for 10 minutes
- Database query spike > 200% baseline

**Warning Alerts (Email):**
- Cache hit rate < 80% for any cache type
- Redis memory usage > 80%
- Response time degradation > 20%
- Invalidation failures > 1% of operations

### Monitoring Queries

**CloudWatch Logs Insights:**

```sql
-- Cache Hit Rate by Type
fields @timestamp, message, component
| filter component = "redis-cache" and message like /cache hit|cache miss/
| stats count(*) as total by message
| sort total desc

-- User Context Performance
fields @timestamp, duration, userId
| filter message = "User context loaded"
| stats avg(duration) as avg_ms, max(duration) as max_ms, count(*) as total
| sort avg_ms desc

-- Dashboard Load Times
fields @timestamp, totalDuration, chartCount
| filter message = "Batch chart data request completed"
| stats avg(totalDuration) as avg_ms, max(totalDuration) as max_ms, count(*) as requests
| sort avg_ms desc

-- Cache Invalidation Events
fields @timestamp, message, userId, roleId, reason
| filter message like /invalidated/
| stats count(*) as invalidations by reason
| sort invalidations desc
```

**SQL Queries (Database Monitoring):**

```sql
-- Query frequency by table
SELECT
  table_name,
  COUNT(*) as query_count,
  AVG(duration) as avg_duration_ms
FROM query_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY table_name
ORDER BY query_count DESC;

-- Most expensive queries
SELECT
  query_text,
  COUNT(*) as executions,
  AVG(duration) as avg_ms,
  MAX(duration) as max_ms
FROM query_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY query_text
ORDER BY avg_ms DESC
LIMIT 10;
```

---

## 🧪 Testing Strategy

### Performance Testing

**Before Implementation - Establish Baseline:**

```bash
# 1. Single dashboard load test
ab -n 100 -c 10 \
   -H "Cookie: access-token=..." \
   http://localhost:4001/dashboard/30d9570d-5a7f-4553-a72b-0a54430daa43

# Record metrics:
# - Requests per second
# - Time per request (mean)
# - Time per request (mean, across all concurrent requests)
# - Database queries (from logs)
# - Response time distribution (p50, p95, p99)

# 2. Concurrent user test
artillery run load-test.yml

# Record:
# - Concurrent users supported
# - Error rate at capacity
# - Database connection pool usage
```

**After Phase 1 - Verify 30-40% Improvement:**

```bash
# Run same tests, expect:
# - 30-40% faster response times
# - 40-50% fewer database queries
# - Cache hit rate >90% for token/user lookups
```

**After Phase 2 - Verify 60-70% Improvement:**

```bash
# Run same tests, expect:
# - 60-70% faster response times
# - 70-80% fewer database queries
# - Cache hit rate >85% for RBAC lookups
```

**After Phase 4 - Verify 68% Total Improvement:**

```bash
# Run same tests, expect:
# - 68% faster dashboard loads
# - 78% fewer database queries
# - Single batch request per dashboard
# - Chart cache hit rate >60%
```

### Load Testing Script

**Create `load-test.yml`:**

```yaml
config:
  target: 'http://localhost:4001'
  phases:
    - duration: 60
      arrivalRate: 5
      name: "Warm up"
    - duration: 300
      arrivalRate: 20
      name: "Sustained load"
    - duration: 60
      arrivalRate: 50
      name: "Spike"
  variables:
    accessToken: "{{ $processEnvironment.ACCESS_TOKEN }}"
scenarios:
  - name: "Dashboard viewing"
    flow:
      - get:
          url: "/dashboard/30d9570d-5a7f-4553-a72b-0a54430daa43"
          headers:
            Cookie: "access-token={{ accessToken }}"
          capture:
            - json: "$.dashboard_id"
              as: "dashboardId"
      - think: 3
      - post:
          url: "/api/admin/analytics/chart-data-batch"
          headers:
            Cookie: "access-token={{ accessToken }}"
            Content-Type: "application/json"
          json:
            charts:
              - chartType: "bar"
                measure: "appointments"
                frequency: "monthly"
      - think: 5
```

**Run test:**
```bash
artillery run load-test.yml --output report.json
artillery report report.json
```

### Functional Testing

**Create `tests/integration/redis-caching.test.ts`:**

```typescript
describe('Redis Caching Integration Tests', () => {
  describe('Token Blacklist Caching', () => {
    it('should cache not-blacklisted tokens', async () => {
      const tokenId = 'test-token-123';

      // First check (cache miss)
      const result1 = await isTokenBlacklisted(tokenId);
      expect(result1).toBe(false);

      // Second check (cache hit)
      const result2 = await isTokenBlacklisted(tokenId);
      expect(result2).toBe(false);

      // Verify only 1 DB query made
      expect(mockDb.queries.length).toBe(1);
    });

    it('should invalidate cache when token blacklisted', async () => {
      const tokenId = 'test-token-456';

      // Cache as not blacklisted
      await isTokenBlacklisted(tokenId);

      // Blacklist token
      await blacklistToken(tokenId);

      // Verify cache invalidated
      const cached = await redisGet(`token_bl:${tokenId}`);
      expect(cached).toEqual({ blacklisted: true });
    });
  });

  describe('User Context Caching', () => {
    it('should cache user context', async () => {
      const userId = 'test-user-123';

      // First load (cache miss)
      const context1 = await getCachedUserContext(userId);
      expect(context1).toBeDefined();

      // Second load (cache hit)
      const context2 = await getCachedUserContext(userId);
      expect(context2).toEqual(context1);

      // Verify only 1 DB query
      expect(mockDb.queries.filter(q => q.includes('users')).length).toBe(1);
    });

    it('should invalidate on role change', async () => {
      const userId = 'test-user-456';

      // Load context
      await getCachedUserContext(userId);

      // Change role
      await assignUserRole(userId, 'new-role-id');

      // Verify cache cleared
      const cached = await redisGet(`user_context:${userId}`);
      expect(cached).toBeNull();
    });
  });

  describe('Chart Data Batch Endpoint', () => {
    it('should load multiple charts in single request', async () => {
      const response = await apiClient.post('/api/admin/analytics/chart-data-batch', {
        charts: [
          { measure: 'appointments', frequency: 'monthly' },
          { measure: 'revenue', frequency: 'weekly' },
        ],
      });

      expect(response.charts).toHaveLength(2);
      expect(response.metadata.totalCharts).toBe(2);
    });

    it('should cache chart data', async () => {
      const config = { measure: 'appointments', frequency: 'monthly' };

      // First request (cache miss)
      const response1 = await apiClient.post('/api/admin/analytics/chart-data-batch', {
        charts: [config],
      });
      expect(response1.charts[0].fromCache).toBe(false);

      // Second request (cache hit)
      const response2 = await apiClient.post('/api/admin/analytics/chart-data-batch', {
        charts: [config],
      });
      expect(response2.charts[0].fromCache).toBe(true);
    });
  });
});
```

### Cache Invalidation Testing

**Create `tests/integration/cache-invalidation.test.ts`:**

```typescript
describe('Cache Invalidation Tests', () => {
  it('should invalidate user context when role assigned', async () => {
    const userId = 'test-user';

    // Load and cache
    await getCachedUserContext(userId);
    let cached = await redisGet(`user_context:${userId}`);
    expect(cached).not.toBeNull();

    // Assign role
    await assignUserRole(userId, 'new-role');

    // Verify invalidated
    cached = await redisGet(`user_context:${userId}`);
    expect(cached).toBeNull();
  });

  it('should invalidate all users when role permissions change', async () => {
    const roleId = 'test-role';
    const users = ['user1', 'user2', 'user3'];

    // Load contexts
    for (const userId of users) {
      await getCachedUserContext(userId);
    }

    // Update role permissions
    await updateRolePermissions(roleId, ['new:permission']);

    // Verify all invalidated
    for (const userId of users) {
      const cached = await redisGet(`user_context:${userId}`);
      expect(cached).toBeNull();
    }
  });
});
```

### Security Testing

**Create `tests/security/cache-security.test.ts`:**

```typescript
describe('Cache Security Tests', () => {
  it('should not serve stale permissions after role update', async () => {
    const userId = 'test-user';
    const roleId = 'test-role';

    // User has read permission
    await assignUserRole(userId, roleId);
    const context1 = await getCachedUserContext(userId);
    expect(context1.all_permissions.some(p => p.name === 'data:read')).toBe(true);

    // Add write permission to role
    await updateRolePermissions(roleId, ['data:read', 'data:write']);

    // Verify user gets new permissions immediately (cache invalidated)
    const context2 = await getCachedUserContext(userId);
    expect(context2.all_permissions.some(p => p.name === 'data:write')).toBe(true);
  });

  it('should respect cache TTL for security-sensitive data', async () => {
    const tokenId = 'test-token';

    // Cache token as not blacklisted
    await isTokenBlacklisted(tokenId);

    // Blacklist in database
    await db.insert(token_blacklist).values({ jti: tokenId, ... });

    // Should still be cached as not blacklisted (1 min TTL acceptable)
    const cached = await getCachedTokenBlacklistStatus(tokenId);
    expect(cached).toBe(false);

    // After manual invalidation, should be blacklisted
    await invalidateTokenCache(tokenId);
    const updated = await isTokenBlacklisted(tokenId);
    expect(updated).toBe(true);
  });
});
```

---

## 🚦 Rollout Strategy

### Feature Flagging

**Environment Variables:**

```bash
# .env.local / Secrets Manager
ENABLE_REDIS_CACHE=true              # Master switch
ENABLE_TOKEN_CACHE=true              # Phase 1
ENABLE_USER_CACHE=true               # Phase 1
ENABLE_JWT_CACHE=true                # Phase 1
ENABLE_RBAC_CACHE=true               # Phase 2
ENABLE_RATE_LIMIT_REDIS=true         # Phase 3
ENABLE_CHART_CACHE=true              # Phase 4
ENABLE_BATCH_ENDPOINT=true           # Phase 4
```

**Implementation:**

```typescript
// lib/config/feature-flags.ts
export const featureFlags = {
  redisCache: {
    enabled: process.env.ENABLE_REDIS_CACHE === 'true',
    token: process.env.ENABLE_TOKEN_CACHE === 'true',
    user: process.env.ENABLE_USER_CACHE === 'true',
    jwt: process.env.ENABLE_JWT_CACHE === 'true',
    rbac: process.env.ENABLE_RBAC_CACHE === 'true',
    rateLimit: process.env.ENABLE_RATE_LIMIT_REDIS === 'true',
    chart: process.env.ENABLE_CHART_CACHE === 'true',
    batch: process.env.ENABLE_BATCH_ENDPOINT === 'true',
  },
};

// Usage in code
if (featureFlags.redisCache.enabled && featureFlags.redisCache.token) {
  const cached = await getCachedTokenBlacklistStatus(tokenId);
  if (cached !== null) return cached;
}

// Always fallback to database
return await queryDatabase();
```

### Deployment Phases

**Week 1: Development Environment**

```bash
# Day 1-2: Phase 1 implementation
- [ ] Implement token cache
- [ ] Implement user cache
- [ ] Implement JWT cache
- [ ] Unit tests passing
- [ ] Integration tests passing

# Day 3-4: Dev deployment
- [ ] Deploy to dev with feature flags ON
- [ ] Monitor logs for errors
- [ ] Verify 30-40% improvement
- [ ] Load testing passed

# Day 5: Dev validation
- [ ] Security review passed
- [ ] Performance metrics collected
- [ ] Ready for staging
```

**Week 2: Staging Environment**

```bash
# Day 1-2: Phase 2 implementation
- [ ] Implement RBAC cache
- [ ] Implement cache invalidation
- [ ] Phase 3 rate limiting
- [ ] All tests passing

# Day 3-4: Staging deployment
- [ ] Deploy Phase 1 + 2 + 3 to staging
- [ ] Load testing with production-like data
- [ ] Cache hit rate >85%
- [ ] No stale data issues
- [ ] Security audit passed

# Day 5: Staging validation
- [ ] Performance improvement 60-70%
- [ ] All functional tests passed
- [ ] Ready for production
```

**Week 3: Production Rollout (Gradual)**

```bash
# Day 1: 10% rollout
- [ ] Deploy with ENABLE_REDIS_CACHE=true for 10% of requests
- [ ] Monitor error rates (target: <0.1%)
- [ ] Monitor cache hit rates (target: >85%)
- [ ] Monitor response times (target: 30% improvement)
- [ ] If stable for 24 hours, proceed

# Day 2: 50% rollout
- [ ] Increase to 50% of requests
- [ ] Monitor for 24 hours
- [ ] Compare metrics to baseline
- [ ] Verify no degradation for other 50%
- [ ] If stable, proceed

# Day 3: 100% rollout
- [ ] Enable for all requests
- [ ] Monitor for 48 hours
- [ ] Document final metrics
- [ ] Celebrate success! 🎉

# Day 4-5: Phase 4 (Dashboard optimization)
- [ ] Deploy batch endpoint
- [ ] Update frontend to use batch
- [ ] Monitor dashboard load times
- [ ] Verify 68% total improvement
```

**Week 4: Monitoring & Optimization**

```bash
# Day 1-2: Metrics analysis
- [ ] Analyze CloudWatch metrics
- [ ] Identify any bottlenecks
- [ ] Tune cache TTLs if needed
- [ ] Document lessons learned

# Day 3-4: Documentation & training
- [ ] Update runbooks
- [ ] Train support team
- [ ] Update architecture docs
- [ ] Create troubleshooting guide

# Day 5: Project closeout
- [ ] Final performance report
- [ ] Cost savings analysis
- [ ] Stakeholder presentation
- [ ] Plan Phase 2 optimizations
```

### Rollback Plan

**Immediate Rollback (< 5 minutes):**

```bash
# Set environment variable in Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id bcos/production/env \
  --secret-string '{"ENABLE_REDIS_CACHE": "false", ...}'

# Restart ECS tasks to pick up new config
aws ecs update-service \
  --cluster bcos-production \
  --service bcos-app \
  --force-new-deployment
```

**Partial Rollback (Disable specific features):**

```bash
# Disable only problematic feature
ENABLE_RBAC_CACHE=false  # Keep other caches enabled

# Application automatically falls back to database
```

**Rollback Triggers:**

- Error rate > 1% for 5 minutes
- Dashboard load time > 3s (p95)
- Cache connection failures > 10%
- Database query spike > 200% baseline
- User-reported auth issues

---

## 🤔 Open Questions for Discussion

### Question 1: Chart Data Caching Strategy

**Trade-off:** Freshness vs Performance

**Options:**

**A) Aggressive Caching (Recommended):**
- Today's data: 1 min TTL
- This week: 5 min TTL
- Historical: 1 hour TTL
- **Pros:** Best performance, 60-80% cache hit rate
- **Cons:** Data could be 1-5 minutes stale

**B) Minimal Caching:**
- All data: 30 seconds TTL
- **Pros:** Fresh data
- **Cons:** Lower cache hit rate (40-60%)

**C) No Caching:**
- Fresh queries every time
- **Pros:** Always fresh
- **Cons:** No performance improvement

**Decision Needed:** Which option aligns with business requirements?

---

### Question 2: Session Caching TTL

**Current:** Sessions validated on every request (DB query)

**Proposed:** 1-minute cache for session validation

**Risk:** Revoked session could remain active for up to 1 minute

**Mitigation:**
- Manual invalidation on logout (immediate)
- Manual invalidation on session revoke (immediate)
- Only TTL affects natural expiry

**Decision Needed:** Is 1-minute acceptable for session validation?

---

### Question 3: Batch Endpoint Backwards Compatibility

**Options:**

**A) Keep Both Endpoints (Recommended):**
- Old: `/api/admin/analytics/chart-data` (single chart)
- New: `/api/admin/analytics/chart-data-batch` (multiple charts)
- **Pros:** Gradual migration, no breaking changes
- **Cons:** Maintain two endpoints

**B) Deprecate Old Endpoint:**
- Sunset old endpoint after 3 months
- **Pros:** Single endpoint to maintain
- **Cons:** Breaking change for API consumers

**Decision Needed:** Keep both or deprecate old?

---

### Question 4: Redis High Availability

**Current:** Single Valkey Serverless instance per environment

**Options:**

**A) Valkey Serverless (Current - Recommended):**
- Auto-scaling
- No cluster management
- AWS handles availability
- **Cost:** ~$47/month per environment
- **Pros:** Simple, serverless
- **Cons:** AWS-managed failover only

**B) Redis Cluster (Multi-AZ):**
- 3-node cluster
- Manual failover control
- **Cost:** ~$200/month per environment
- **Pros:** More control, guaranteed HA
- **Cons:** More expensive, more complex

**Decision Needed:** Is Serverless sufficient or need cluster?

---

### Question 5: Cache Warming Strategy

**Should we pre-warm cache on deployment?**

**Options:**

**A) No Warming (Recommended for MVP):**
- Let cache naturally warm up
- **Pros:** Simpler deployment
- **Cons:** First requests after deployment slower

**B) Warm Common Data:**
- Pre-load role permissions, active users
- **Pros:** Better first-request performance
- **Cons:** Longer deployment time, complexity

**Decision Needed:** Warm cache or let it naturally populate?

---

### Question 6: Cache Monitoring Alerts

**How aggressive should alerting be?**

**Options:**

**A) Conservative (Recommended):**
- Alert on cache failures > 10% for 10 minutes
- Alert on hit rate < 70% for 30 minutes
- **Pros:** Fewer false alarms
- **Cons:** Might miss gradual degradation

**B) Aggressive:**
- Alert on cache failures > 5% for 5 minutes
- Alert on hit rate < 85% for 10 minutes
- **Pros:** Catch issues early
- **Cons:** More pages, potential alert fatigue

**Decision Needed:** Alert threshold preferences?

---

## 📚 Additional Documentation Needs

### Before Implementation

- [ ] **Architecture Decision Record (ADR)** - Document Redis decision
- [ ] **Security Review** - Audit caching strategy
- [ ] **Cost Analysis** - Detailed cost projections
- [ ] **Capacity Planning** - Redis sizing and scaling

### During Implementation

- [ ] **Implementation Guide** - Step-by-step for developers
- [ ] **Testing Guide** - How to test caching locally
- [ ] **Monitoring Guide** - Dashboard setup and alerts
- [ ] **Troubleshooting Guide** - Common issues and fixes

### After Implementation

- [ ] **Performance Report** - Before/after metrics
- [ ] **Lessons Learned** - What went well, what didn't
- [ ] **Runbook Updates** - Operational procedures
- [ ] **Architecture Diagrams** - Update with Redis layer

---

## 🎯 Success Criteria Summary

### Technical Metrics

**Phase 1 (Week 1):**
- [ ] Token blacklist cache hit rate >95%
- [ ] User cache hit rate >90%
- [ ] Database queries reduced by 40-50%
- [ ] Response time improved by 30%

**Phase 2 (Week 2):**
- [ ] RBAC cache hit rate >85%
- [ ] Database queries reduced by 70%
- [ ] Response time improved by 60%
- [ ] Cache invalidation working correctly

**Phase 3 (Week 2):**
- [ ] Rate limiting consistent across instances
- [ ] No rate limit bypass detected
- [ ] Graceful fallback working

**Phase 4 (Week 3):**
- [ ] Dashboard load time improved by 68%
- [ ] Single batch request per dashboard
- [ ] Chart cache hit rate >60%
- [ ] Total DB queries reduced by 78%

### Business Metrics

- [ ] User satisfaction improved (faster dashboards)
- [ ] Support tickets reduced (fewer performance complaints)
- [ ] Infrastructure costs reduced by $300-400/month
- [ ] Ability to support more concurrent users

### Operational Metrics

- [ ] Zero security incidents related to caching
- [ ] <0.1% error rate attributed to Redis
- [ ] Cache monitoring dashboards created
- [ ] Team trained on Redis operations

---

## 📞 Support & Escalation

### Implementation Team

**Development:**
- Lead: [Name]
- Backend: [Name]
- Frontend: [Name]

**Operations:**
- DevOps: [Name]
- Database: [Name]

**Security:**
- Security Review: [Name]
- Compliance: [Name]

### Escalation Path

**Level 1:** Development team resolves (< 1 hour)
**Level 2:** Engineering manager involved (< 4 hours)
**Level 3:** CTO notified (< 24 hours)

### Office Hours

**Implementation Questions:**
- Slack: #redis-implementation
- Daily standups: 9am EST
- Office hours: Tuesdays/Thursdays 2-3pm EST

---

## 🚀 Next Steps

### Immediate Actions (This Week)

1. **Review this plan** with team
2. **Discuss open questions** and make decisions
3. **Get security approval** for caching strategy
4. **Estimate effort** for each phase
5. **Assign tasks** to team members

### Phase 1 Kickoff (Next Week)

1. **Create feature branch** `feature/redis-phase-1`
2. **Set up dev Redis** (already done ✅)
3. **Implement token caching**
4. **Implement user caching**
5. **Implement JWT caching**
6. **Write tests**
7. **Deploy to dev**
8. **Validate metrics**

### Ongoing

- **Daily standups** to track progress
- **Weekly metrics review**
- **Bi-weekly stakeholder updates**
- **Monthly cost review**

---

## 📝 Conclusion

This comprehensive Redis implementation plan provides a clear, phased approach to dramatically improving the performance of BendCare OS. With an expected **68% improvement in dashboard load times** and **78% reduction in database queries**, this project will significantly enhance user experience while reducing infrastructure costs.

The plan prioritizes:
- **Security** - Cache invalidation strategy ensures no stale permissions
- **Reliability** - Graceful fallback to database if Redis fails
- **Observability** - Comprehensive monitoring and alerting
- **Gradual rollout** - Phased deployment minimizes risk

**Estimated Timeline:** 4 weeks
**Estimated ROI:** Positive after 1 month
**Risk Level:** Low-Medium (with proper testing and rollout)

**Ready to proceed? Let's discuss open questions and begin Phase 1!** 🚀
