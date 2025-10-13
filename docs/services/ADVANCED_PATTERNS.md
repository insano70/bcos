# Advanced Service Patterns

**Status**: Reference | **Last Updated**: 2025-01-13 | **Version**: 3.0

> **Start with basics?** Read [STANDARDS.md](./STANDARDS.md) first. This document is a reference for advanced patterns.

---

## Implementation Status Legend

- ✅ **Implemented** - Pattern is used in our codebase, see linked files
- 📝 **Partial** - Pattern exists but needs updates to match these examples
- ⚠️ **Not Implemented** - Reference for future use, not yet in codebase

---

## Table of Contents

1. [Performance Optimization](#performance-optimization) ✅
2. [Pagination Patterns](#pagination-patterns) ✅
3. [Caching Strategy](#caching-strategy) 📝
4. [Testing Strategy](#testing-strategy) ✅
5. [Service Composition](#service-composition) ✅
6. [Idempotency](#idempotency) ⚠️
7. [Bulk Operations](#bulk-operations) ⚠️
8. [Rate Limiting](#rate-limiting) 📝
9. [Circuit Breakers](#circuit-breakers) ⚠️
10. [Monitoring & Alerting](#monitoring--alerting) 📝
11. [Database Optimization](#database-optimization) ✅
12. [Migration Guide](#migration-guide) ✅

---

## Performance Optimization

### Problem: Users with Many Organizations (100+)

**Symptom**: Slow queries when users have access to many organizations.

```sql
-- Slow for 100+ orgs
WHERE organization_id IN (uuid1, uuid2, ... uuid100)
```

**Solution 1: JOIN Strategy**

```typescript
async getResourcesOptimized(filters: ResourceFilters): Promise<Resource[]> {
  // For users with many organizations, use JOIN instead of IN
  if (this.accessibleOrgIds.length > 100 && !this.canReadAll) {
    return await db
      .select()
      .from(resources)
      .innerJoin(
        userOrganizations,
        and(
          eq(resources.organization_id, userOrganizations.organization_id),
          eq(userOrganizations.user_id, this.userContext.user_id)
        )
      )
      .where(isNull(resources.deleted_at));
  }

  // Standard IN clause for normal case
  return await db
    .select()
    .from(resources)
    .where(and(
      inArray(resources.organization_id, this.accessibleOrgIds),
      isNull(resources.deleted_at)
    ));
}
```

**Solution 2: Temporary Table (for 200+ orgs)**

```typescript
async getResourcesWithTempTable(filters: ResourceFilters): Promise<Resource[]> {
  if (this.accessibleOrgIds.length > 200 && !this.canReadAll) {
    return await db.transaction(async (tx) => {
      // Create temp table
      await tx.execute(sql`
        CREATE TEMP TABLE temp_accessible_orgs (
          organization_id UUID PRIMARY KEY
        ) ON COMMIT DROP
      `);

      // Insert org IDs
      await tx.execute(sql`
        INSERT INTO temp_accessible_orgs (organization_id)
        SELECT * FROM UNNEST(${this.accessibleOrgIds}::uuid[])
      `);

      // Query with JOIN
      return await tx
        .select()
        .from(resources)
        .innerJoin(
          sql`temp_accessible_orgs`,
          eq(resources.organization_id, sql`temp_accessible_orgs.organization_id`)
        )
        .where(isNull(resources.deleted_at));
    });
  }

  // Standard approach
  return await this.getResources(filters);
}
```

### Problem: N+1 Queries

**❌ Bad**: Loading related data in loops

```typescript
const resources = await getResources();
for (const resource of resources) {
  resource.owner = await usersService.getUserById(resource.owner_id); // N queries!
}
```

**✅ Good Solution 1: Eager Loading with JOIN**

```typescript
async getResourcesWithOwners(): Promise<ResourceWithOwner[]> {
  const results = await db
    .select({
      resource_id: resources.resource_id,
      resource_name: resources.name,
      owner_id: users.user_id,
      owner_name: users.name,
      owner_email: users.email,
    })
    .from(resources)
    .leftJoin(users, eq(resources.owner_id, users.user_id))
    .where(isNull(resources.deleted_at));

  return results.map(row => ({
    resource_id: row.resource_id,
    name: row.resource_name,
    owner: {
      user_id: row.owner_id,
      name: row.owner_name,
      email: row.owner_email,
    },
  }));
}
```

**✅ Good Solution 2: Batch Loading**

```typescript
async getResourcesWithOwners(): Promise<ResourceWithOwner[]> {
  const resources = await this.getResources();
  
  // Get unique owner IDs
  const ownerIds = [...new Set(resources.map(r => r.owner_id))];
  
  // Batch fetch all owners in one query
  const owners = await db
    .select()
    .from(users)
    .where(inArray(users.user_id, ownerIds));
  
  // Create lookup map
  const ownersMap = new Map(owners.map(o => [o.user_id, o]));
  
  // Attach owners to resources
  return resources.map(resource => ({
    ...resource,
    owner: ownersMap.get(resource.owner_id),
  }));
}
```

### Query Performance Monitoring

```typescript
async function executeWithMonitoring<T>(
  queryFn: () => Promise<T>,
  context: { operation: string; threshold?: number }
): Promise<T> {
  const startTime = Date.now();
  const threshold = context.threshold || SLOW_THRESHOLDS.DB_QUERY;

  try {
    const result = await queryFn();
    const duration = Date.now() - startTime;

    if (duration > threshold) {
      log.warn('slow query detected', {
        operation: context.operation,
        duration,
        threshold,
        component: 'database',
      });
    }

    return result;
  } catch (error) {
    log.error('query failed', error, {
      operation: context.operation,
      duration: Date.now() - startTime,
      component: 'database',
    });
    throw error;
  }
}

// Usage
const users = await executeWithMonitoring(
  () => db.select().from(users).where(eq(users.organization_id, orgId)),
  { operation: 'get_users_by_org' }
);
```

---

## Pagination Patterns

### When to Use Each Method

| Method | Best For | Pros | Cons |
|--------|----------|------|------|
| **Offset** | Admin UIs, small datasets (<10k rows), page numbers | Simple, jump to any page | Slow for large offsets, inconsistent with concurrent writes |
| **Cursor** | APIs, infinite scroll, large datasets (>10k rows) | Fast at any position, consistent | Can't jump to arbitrary page, more complex |

### Cursor Pagination Implementation

```typescript
interface CursorPaginationOptions {
  limit?: number;
  cursor?: string; // Base64 encoded
  sortOrder?: 'asc' | 'desc';
  filters?: Partial<ResourceFilters>;
}

interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

async getResourcesPaginated(
  options: CursorPaginationOptions = {}
): Promise<PaginatedResult<Resource>> {
  const startTime = Date.now();

  try {
    const limit = options.limit || 50;
    const whereConditions = this.buildRBACWhereConditions();

    // Apply filters
    if (options.filters?.is_active !== undefined) {
      whereConditions.push(eq(resources.is_active, options.filters.is_active));
    }

    // Decode cursor
    let decodedCursor: { id: string; created_at: string } | null = null;
    if (options.cursor) {
      try {
        decodedCursor = JSON.parse(
          Buffer.from(options.cursor, 'base64').toString()
        );
      } catch {
        throw ValidationError('Invalid cursor format');
      }
    }

    // Apply cursor condition for pagination
    if (decodedCursor) {
      const cursorDate = new Date(decodedCursor.created_at);
      // Use tuple comparison for efficiency
      whereConditions.push(
        sql`(${resources.created_at}, ${resources.resource_id}) < (${cursorDate}, ${decodedCursor.id})`
      );
    }

    // Fetch limit + 1 to check for more results
    const queryStart = Date.now();
    const results = await db
      .select()
      .from(resources)
      .where(and(...whereConditions))
      .orderBy(desc(resources.created_at), desc(resources.resource_id)) // Stable sort
      .limit(limit + 1);

    const queryDuration = Date.now() - queryStart;

    // Check if there are more results
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    // Generate next cursor
    let nextCursor: string | null = null;
    if (hasMore && data.length > 0) {
      const lastItem = data[data.length - 1];
      const cursorData = {
        id: lastItem.resource_id,
        created_at: lastItem.created_at.toISOString(),
      };
      nextCursor = Buffer.from(JSON.stringify(cursorData)).toString('base64');
    }

    const duration = Date.now() - startTime;

    log.info('resources paginated list retrieved', {
      operation: 'list_resources_paginated',
      userId: this.userContext.user_id,
      results: { returned: data.length, hasMore, limit },
      duration,
      queryDuration,
      component: 'service',
    });

    return {
      data: data as Resource[],
      nextCursor,
      hasMore,
    };
  } catch (error) {
    log.error('list resources paginated failed', error, {
      operation: 'list_resources_paginated',
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
      component: 'service',
    });
    throw error;
  }
}
```

**Client Usage**:

```typescript
// First page
const page1 = await service.getResourcesPaginated({ limit: 50 });

// Next page
if (page1.hasMore && page1.nextCursor) {
  const page2 = await service.getResourcesPaginated({
    limit: 50,
    cursor: page1.nextCursor,
  });
}
```

---

## Caching Strategy

**Status**: 📝 Partial - We use AWS ElastiCache, see our implementations below

### When to Cache

**✅ Cache These**:
- Reference data (rarely changes)
- User permissions (TTL: 5 min)
- Organization settings (TTL: 15 min)
- Computed aggregations
- Chart data (TTL: 5 min)

**❌ Don't Cache These**:
- Transactional data
- Real-time analytics
- Frequently changing data

### Our Cache Implementations

**We use AWS ElastiCache with two specialized cache services:**

1. **Chart Data Cache** - See [lib/cache/chart-data-cache.ts](../../lib/cache/chart-data-cache.ts)
   - Caches chart query results
   - 5-minute default TTL
   - Pattern-based invalidation
   - Graceful degradation (fail-open)

2. **Rate Limit Cache** - See [lib/cache/rate-limit-cache.ts](../../lib/cache/rate-limit-cache.ts)
   - Redis-based rate limiting
   - Atomic INCR operations
   - Multi-instance safe
   - Sliding window algorithm

### Cache Service Pattern (Reference Implementation)

Use this pattern when creating new cache services:

```typescript
// lib/cache/example-cache.ts
import { getRedisClient } from '@/lib/redis';
import { log } from '@/lib/logger';

export class ExampleCacheService {
  private readonly DEFAULT_TTL = 300; // 5 minutes
  private readonly KEY_PREFIX = 'example:';

  async get<T>(key: string): Promise<T | null> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis unavailable, skipping cache', { key });
        return null; // Fail open
      }

      const fullKey = this.KEY_PREFIX + key;
      const cached = await redis.get(fullKey);

      if (!cached) return null;

      return JSON.parse(cached) as T;
    } catch (error) {
      log.error('cache get failed', error, { key });
      return null; // Fail open - don't break the app
    }
  }

  async set<T>(key: string, value: T, ttl: number = this.DEFAULT_TTL): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) return;

      const fullKey = this.KEY_PREFIX + key;
      await redis.setex(fullKey, ttl, JSON.stringify(value));
    } catch (error) {
      log.error('cache set failed', error, { key });
      // Fail open - don't throw
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) return;

      await redis.del(this.KEY_PREFIX + key);
    } catch (error) {
      log.error('cache delete failed', error, { key });
    }
  }

  async invalidate(pattern: string): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) return;

      const fullPattern = this.KEY_PREFIX + pattern;
      const keys = await redis.keys(fullPattern);

      if (keys.length > 0) {
        await redis.del(...keys);
      }

      log.info('cache invalidated', { pattern, keysDeleted: keys.length });
    } catch (error) {
      log.error('cache invalidation failed', error, { pattern });
    }
  }
}
```

### Using Cache in Services

```typescript
class ResourceService {
  constructor(
    private readonly userContext: UserContext,
    private readonly dependencies?: {
      cacheService?: CacheServiceInterface;
    }
  ) {}

  async getResourceById(id: string): Promise<Resource | null> {
    // Check cache first
    if (this.dependencies?.cacheService) {
      const cached = await this.dependencies.cacheService.get<Resource>(`resource:${id}`);
      if (cached) {
        log.info('cache hit', { resourceId: id, component: 'service' });
        return cached;
      }
    }

    // Cache miss - fetch from database
    const resource = await db
      .select()
      .from(resources)
      .where(eq(resources.resource_id, id))
      .limit(1);

    if (resource && this.dependencies?.cacheService) {
      // Cache for 5 minutes
      await this.dependencies.cacheService.set(`resource:${id}`, resource, 300);
    }

    return resource;
  }

  async updateResource(id: string, data: UpdateResourceData): Promise<Resource> {
    const updated = await db.update(resources).set(data).returning();

    // Invalidate cache
    if (this.dependencies?.cacheService) {
      await this.dependencies.cacheService.delete(`resource:${id}`);
    }

    return updated[0];
  }
}
```

### Cache Invalidation Patterns

```typescript
// Pattern 1: Direct invalidation on update
async updateResource(id: string, data: UpdateResourceData) {
  const resource = await db.update(resources).set(data).returning();
  await this.cacheService?.delete(`resource:${id}`);
  return resource;
}

// Pattern 2: Tag-based invalidation
async updateOrganization(id: string, data: UpdateOrgData) {
  const org = await db.update(organizations).set(data).returning();
  
  // Invalidate all caches for this organization
  await this.cacheService?.clear(`org:${id}:*`);
  
  return org;
}

// Pattern 3: Write-through cache
async createResource(data: CreateResourceData): Promise<Resource> {
  const resource = await db.insert(resources).values(data).returning();
  
  // Immediately cache the new resource
  await this.cacheService?.set(`resource:${resource.resource_id}`, resource, 300);
  
  return resource;
}
```

---

## Testing Strategy

### Unit Testing Services

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createRBACUsersService } from './rbac-users-service';
import type { UserContext } from '@/lib/types/rbac';

describe('createRBACUsersService', () => {
  let mockUserContext: UserContext;

  beforeEach(() => {
    mockUserContext = {
      user_id: 'user-123',
      email: 'test@example.com',
      current_organization_id: 'org-1',
      is_super_admin: false,
      accessible_organizations: [
        { organization_id: 'org-1', organization_name: 'Org 1' },
      ],
      all_permissions: [
        { permission_id: 'perm-1', name: 'users:read:organization' },
      ],
    };
  });

  describe('getUsers', () => {
    it('filters by accessible organizations', async () => {
      const service = createRBACUsersService(mockUserContext);
      const users = await service.getUsers();

      expect(users.every(u => u.organization_id === 'org-1')).toBe(true);
    });

    it('returns empty array when no accessible organizations', async () => {
      mockUserContext.accessible_organizations = [];
      const service = createRBACUsersService(mockUserContext);
      const users = await service.getUsers();

      expect(users).toEqual([]);
    });

    it('returns all users for super admin', async () => {
      mockUserContext.is_super_admin = true;
      const service = createRBACUsersService(mockUserContext);
      const users = await service.getUsers();

      const orgIds = [...new Set(users.map(u => u.organization_id))];
      expect(orgIds.length).toBeGreaterThan(1);
    });
  });

  describe('permission scoping', () => {
    it('respects read:own permission', async () => {
      mockUserContext.all_permissions = [
        { permission_id: 'perm-1', name: 'users:read:own' },
      ];
      
      const service = createRBACUsersService(mockUserContext);
      const users = await service.getUsers();

      expect(users.every(u => u.created_by === mockUserContext.user_id)).toBe(true);
    });
  });
});
```

### Integration Testing

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { createRBACUsersService } from './rbac-users-service';

describe('UsersService Integration Tests', () => {
  let testOrgId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Set up test data
    const [org] = await db.insert(organizations).values({
      name: 'Test Org',
    }).returning();
    testOrgId = org.organization_id;

    const [user] = await db.insert(users).values({
      email: 'test@example.com',
      name: 'Test User',
      organization_id: testOrgId,
    }).returning();
    testUserId = user.user_id;
  });

  afterAll(async () => {
    // Clean up
    await db.delete(users).where(eq(users.user_id, testUserId));
    await db.delete(organizations).where(eq(organizations.organization_id, testOrgId));
  });

  it('successfully creates and retrieves user', async () => {
    const userContext = createTestUserContext(testUserId, testOrgId);
    const service = createRBACUsersService(userContext);

    const newUser = await service.createUser({
      email: 'integration@example.com',
      name: 'Integration Test',
      organization_id: testOrgId,
    });

    const retrieved = await service.getUserById(newUser.user_id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.email).toBe('integration@example.com');
  });
});
```

---

## Service Composition

### Dependency Injection Pattern

```typescript
class OrdersService {
  constructor(
    private readonly userContext: UserContext,
    private readonly dependencies: {
      usersService: UsersServiceInterface;
      productsService: ProductsServiceInterface;
      paymentsService: PaymentsServiceInterface;
    }
  ) {}

  async createOrder(data: CreateOrderData): Promise<Order> {
    // Validate user exists
    const user = await this.dependencies.usersService.getUserById(data.user_id);
    if (!user) {
      throw NotFoundError('User');
    }

    // Validate products exist
    const products = await this.dependencies.productsService.getProductsByIds(
      data.product_ids
    );
    
    if (products.length !== data.product_ids.length) {
      throw ValidationError('One or more products not found');
    }

    // Create order atomically
    return await db.transaction(async (tx) => {
      const [order] = await tx.insert(orders).values({
        user_id: data.user_id,
        total: products.reduce((sum, p) => sum + p.price, 0),
      }).returning();

      // Process payment
      await this.dependencies.paymentsService.processPayment({
        order_id: order.order_id,
        amount: order.total,
      });

      return order;
    });
  }
}

export function createRBACOrdersService(
  userContext: UserContext,
  dependencies: {
    usersService: UsersServiceInterface;
    productsService: ProductsServiceInterface;
    paymentsService: PaymentsServiceInterface;
  }
): OrdersServiceInterface {
  return new OrdersService(userContext, dependencies);
}
```

### Service Factory Pattern

```typescript
// lib/services/factory.ts
export function createServices(userContext: UserContext) {
  const cacheService = new RedisCacheService(process.env.REDIS_URL!);

  const users = createRBACUsersService(userContext, { cacheService });
  const products = createRBACProductsService(userContext);
  const payments = createRBACPaymentsService(userContext);
  
  const orders = createRBACOrdersService(userContext, {
    usersService: users,
    productsService: products,
    paymentsService: payments,
  });

  return { users, products, payments, orders };
}

// Usage in API route
export async function POST(request: Request) {
  const userContext = await getUserContext(request);
  const services = createServices(userContext);
  
  const order = await services.orders.createOrder(orderData);
  return Response.json(order);
}
```

---

## Idempotency

### Implementation

```typescript
interface CreateResourceData {
  name: string;
  organization_id: string;
  idempotency_key?: string; // Client-provided
}

async createResource(data: CreateResourceData): Promise<Resource> {
  // Check for existing resource with same idempotency key
  if (data.idempotency_key) {
    const [existing] = await db
      .select()
      .from(resources)
      .where(and(
        eq(resources.idempotency_key, data.idempotency_key),
        isNull(resources.deleted_at)
      ))
      .limit(1);

    if (existing) {
      log.info('idempotent create - returning existing', {
        resourceId: existing.resource_id,
        idempotencyKey: data.idempotency_key,
        userId: this.userContext.user_id,
        component: 'service',
      });
      return existing as Resource;
    }
  }

  // Create new resource
  const [resource] = await db.insert(resources).values(data).returning();
  return resource as Resource;
}
```

### Required Database Index

```sql
CREATE UNIQUE INDEX idx_resources_idempotency_key_not_deleted 
ON resources(idempotency_key) 
WHERE deleted_at IS NULL AND idempotency_key IS NOT NULL;
```

### Client Usage

```typescript
import { v4 as uuidv4 } from 'uuid';

async function createResource(data: CreateResourceData) {
  const idempotencyKey = uuidv4();
  
  // Safe to retry - will return same resource
  return await fetch('/api/resources', {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      idempotency_key: idempotencyKey,
    }),
  });
}
```

---

## Bulk Operations

### Bulk Create Pattern

```typescript
async bulkCreateResources(items: CreateResourceData[]): Promise<Resource[]> {
  const startTime = Date.now();

  try {
    if (!this.canCreate) {
      throw AuthorizationError('You do not have permission to create resources');
    }

    if (items.length === 0) return [];

    // Verify all organizations are accessible
    const uniqueOrgIds = [...new Set(items.map(item => item.organization_id))];
    for (const orgId of uniqueOrgIds) {
      if (!this.canAccessOrganization(orgId)) {
        throw AuthorizationError(`Access denied to organization: ${orgId}`);
      }
    }

    // Use transaction for atomicity
    const results = await db.transaction(async (tx) => {
      const created: Resource[] = [];

      // Check idempotency for items with keys
      const itemsWithKeys = items.filter(item => item.idempotency_key);
      if (itemsWithKeys.length > 0) {
        const keys = itemsWithKeys.map(item => item.idempotency_key!);
        const existing = await tx
          .select()
          .from(resources)
          .where(and(
            inArray(resources.idempotency_key, keys),
            isNull(resources.deleted_at)
          ));

        created.push(...(existing as Resource[]));
      }

      // Filter out items that already exist
      const existingKeys = new Set(created.map(r => r.idempotency_key));
      const itemsToCreate = items.filter(
        item => !item.idempotency_key || !existingKeys.has(item.idempotency_key)
      );

      // Bulk insert remaining items
      if (itemsToCreate.length > 0) {
        const newResources = await tx
          .insert(resources)
          .values(itemsToCreate.map(item => ({
            ...item,
            created_by: this.userContext.user_id,
            is_active: true,
          })))
          .returning();

        created.push(...(newResources as Resource[]));
      }

      return created;
    });

    const duration = Date.now() - startTime;

    log.info('bulk resources created', {
      operation: 'bulk_create_resources',
      requestedCount: items.length,
      createdCount: results.length,
      userId: this.userContext.user_id,
      duration,
      component: 'service',
    });

    return results;
  } catch (error) {
    log.error('bulk create resources failed', error, {
      operation: 'bulk_create_resources',
      itemCount: items.length,
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
      component: 'service',
    });
    throw error;
  }
}
```

---

## Rate Limiting

**Status**: 📝 Partial - We have a rate limit cache, see [lib/cache/rate-limit-cache.ts](../../lib/cache/rate-limit-cache.ts)

### Our Rate Limit Implementation

We use Redis-based rate limiting with atomic operations for multi-instance safety:

```typescript
import { rateLimitCache } from '@/lib/cache/rate-limit-cache';

// In your service or API route
async function createResource(data: CreateResourceData): Promise<Resource> {
  // Check rate limit: 10 creates per minute per user
  const result = await rateLimitCache.checkUserRateLimit(
    userContext.user_id,
    10,  // 10 requests
    60   // per 60 seconds
  );

  if (!result.allowed) {
    throw new Error(
      `Rate limit exceeded. Try again in ${result.resetAt - Math.floor(Date.now() / 1000)} seconds.`
    );
  }

  // Proceed with creation
  // ...
}
```

### Available Rate Limit Types

```typescript
// IP-based rate limiting (for unauthenticated requests)
await rateLimitCache.checkIpRateLimit(ipAddress, 100, 60);

// User-based rate limiting (for authenticated requests)
await rateLimitCache.checkUserRateLimit(userId, 50, 60);

// Endpoint-based rate limiting (for specific routes)
await rateLimitCache.checkEndpointRateLimit('/api/expensive-op', 10, 60);

// Global API rate limiting
await rateLimitCache.checkGlobalRateLimit(10000, 60);
```

### Rate Limit Response Format

```typescript
interface RateLimitResult {
  allowed: boolean;      // Whether request should be allowed
  current: number;       // Current request count in window
  limit: number;         // Maximum allowed requests
  remaining: number;     // Requests remaining in window
  resetTime: number;     // When window resets (milliseconds)
  resetAt: number;       // When window resets (unix timestamp)
}
```

### Features

- **Atomic Operations**: Uses Redis INCR for thread-safe counting
- **Multi-Instance Safe**: Works correctly across multiple server instances
- **Fail-Open**: Allows requests if Redis is unavailable (graceful degradation)
- **Sliding Window**: More accurate than fixed windows
- **Auto-Expiry**: Keys automatically expire after 2x window duration
```

---

## Circuit Breakers

**Status**: ⚠️ Not Implemented - Reference for future external service integration

Circuit breakers prevent cascading failures when external services are down. Use this pattern when integrating with external APIs (payment processors, email services, etc.).

### When to Implement

Consider circuit breakers when:
- Calling external services (Stripe, SendGrid, etc.)
- Service calls can fail intermittently
- You need to fail fast rather than wait for timeouts
- You want to prevent overwhelming a degraded service

### Reference Implementation

```typescript
// lib/services/circuit-breaker.ts
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime: number | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly options: {
      failureThreshold: number;           // Open circuit after N failures
      resetTimeoutMs: number;              // Try again after N ms
      halfOpenSuccessThreshold: number;    // Close after N successes
    }
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime! > this.options.resetTimeoutMs) {
        this.state = 'half-open';
        log.info('circuit breaker half-open', { component: 'circuit_breaker' });
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();

      if (this.state === 'half-open') {
        this.failures = 0;
        this.state = 'closed';
        log.info('circuit breaker closed', { component: 'circuit_breaker' });
      }

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.options.failureThreshold) {
        this.state = 'open';
        log.error('circuit breaker opened', error, {
          failures: this.failures,
          threshold: this.options.failureThreshold,
          component: 'circuit_breaker',
        });
      }

      throw error;
    }
  }
}
```

### Example Usage (Future)

```typescript
// When we integrate with external payment API
const paymentCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,        // Open after 5 failures
  resetTimeoutMs: 60000,      // Try again after 1 minute
  halfOpenSuccessThreshold: 2,
});

async function processPayment(data: PaymentData) {
  try {
    return await paymentCircuitBreaker.execute(async () => {
      return await externalPaymentAPI.charge(data);
    });
  } catch (error) {
    log.error('payment failed', error, {
      operation: 'process_payment',
      component: 'service',
    });
    throw new Error('Payment service unavailable');
  }
}
```

**Note**: Don't implement this until we have actual external service dependencies that warrant it.

---

## Feature Flags

**Status**: ⚠️ Not Implemented - Consider LaunchDarkly or Flagsmith when needed

Feature flags allow gradual rollouts, A/B testing, and quick feature toggles without deployments.

### When to Implement

Consider feature flags when you need:
- Gradual feature rollouts (10% → 50% → 100%)
- A/B testing different implementations
- Quick rollback capability without deployment
- Per-user or per-organization feature access
- Beta features for specific customers

### Current Alternative

For now, use environment variables for simple feature toggles:

```typescript
// .env.local
FEATURE_NEW_DASHBOARD=true
FEATURE_ADVANCED_FILTERS=false

// In code
const isEnabled = process.env.FEATURE_NEW_DASHBOARD === 'true';
```

### Future Implementation (Reference)

When we need proper feature flags, use LaunchDarkly or Flagsmith:

```typescript
// lib/services/feature-flags.ts
export interface FeatureFlagsInterface {
  isEnabled(flagName: string, context?: {
    userId?: string;
    organizationId?: string;
  }): Promise<boolean>;
}

export class FeatureFlags implements FeatureFlagsInterface {
  async isEnabled(flagName: string, context?: {
    userId?: string;
    organizationId?: string;
  }): Promise<boolean> {
    // LaunchDarkly integration example
    // return await ldClient.variation(flagName, context, false);

    // For now: simple env var check
    return process.env[`FEATURE_${flagName.toUpperCase()}`] === 'true';
  }
}
```

**Note**: Don't implement this until we have a business need for gradual rollouts or A/B testing.

---

## Monitoring & Alerting

**Status**: 📝 Partial - Check if we have health endpoints implemented

### Health Check Pattern

Health checks help monitoring systems detect issues:

```typescript
// app/api/health/route.ts
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { getRedisClient } from '@/lib/redis';
import { log } from '@/lib/logger';

export async function GET() {
  const startTime = Date.now();
  const checks = {
    database: false,
    cache: false,
  };

  // Database health
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = true;
  } catch (error) {
    log.error('database health check failed', error, {
      component: 'health_check',
    });
  }

  // Cache health (if Redis available)
  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.ping();
      checks.cache = true;
    } else {
      checks.cache = true; // No Redis = not an error
    }
  } catch (error) {
    log.error('cache health check failed', error, {
      component: 'health_check',
    });
  }

  const duration = Date.now() - startTime;
  const healthy = checks.database; // Database is critical, cache is optional

  return Response.json(
    {
      status: healthy ? 'healthy' : 'unhealthy',
      checks,
      duration,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
```

### CloudWatch Logs Integration

We use CloudWatch Logs for monitoring. All logs include:
- `correlationId` - Trace complete requests
- `operation` - Filter by operation type
- `component` - Filter by component (api, service, database, cache)
- `duration` - Track performance
- `slow` - Flag slow operations

**Example CloudWatch Insights Queries:**

```sql
-- Find all slow operations
fields @timestamp, message, operation, duration
| filter slow = true
| sort duration desc
| limit 100

-- Find errors by service
fields @timestamp, message, level, operation, component
| filter level = "ERROR" and component = "service"
| stats count() by operation

-- Trace a specific request
fields @timestamp, message, level
| filter correlationId = "abc-123-def"
| sort @timestamp asc
```

---

## Sensitive Data Handling

**Status**: ✅ Implemented - See audit logs and PII protection in logger

### PII/PHI Protection

Our logger automatically sanitizes sensitive data. See [lib/logger/index.ts](../../lib/logger/index.ts):

- **Automatically sanitized**: emails, phone numbers, SSNs, credit cards, UUIDs
- **Never log**: passwords, tokens, API keys, session IDs

```typescript
// DON'T DO THIS
log.info('user data', { password: user.password }); // ❌ Never log passwords

// DO THIS
log.info('user data', {
  userId: user.user_id,
  email: user.email, // Automatically sanitized in logs
});
```

### Audit Logging

Use the AuditLogger for compliance-critical operations:

```typescript
import { AuditLogger } from '@/lib/logger/audit-logger';

async deleteUser(userId: string): Promise<void> {
  // Perform operation
  await db.update(users).set({ deleted_at: new Date() });

  // Audit log (never sampled, always preserved)
  await AuditLogger.logUserAction({
    action: 'user_deleted',
    userId: this.userContext.user_id,
    resourceType: 'user',
    resourceId: userId,
    ipAddress: requestContext.ipAddress,
    metadata: { reason: 'admin_action' },
  });
}
```

### Data Classification

| Classification | Examples | Logging | Caching |
|----------------|----------|---------|---------|
| **Public** | Organization name, public URLs | ✅ Full | ✅ 15 min |
| **Internal** | User IDs, resource IDs | ✅ Sanitized | ✅ 5 min |
| **Confidential** | Email, phone, dates of birth | ✅ Masked | ❌ No cache |
| **Restricted** | Passwords, tokens, SSNs | ❌ Never | ❌ Never |

---

## Database Optimization

### Connection Pooling

```typescript
// lib/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!, {
  max: 20,                    // Maximum pool size
  idle_timeout: 20,           // Close idle after 20s
  connect_timeout: 10,        // Connection timeout
  prepare: true,              // Use prepared statements
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
});

export const db = drizzle(client);
```

### Deadlock Handling with Retry

```typescript
async function withDeadlockRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialBackoffMs?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries || 3;
  const initialBackoffMs = options.initialBackoffMs || 100;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      const isDeadlock = error.code === '40P01';
      const isLastAttempt = attempt === maxRetries - 1;

      if (isDeadlock && !isLastAttempt) {
        const backoffMs = initialBackoffMs * Math.pow(2, attempt);
        
        log.warn('deadlock detected, retrying', {
          attempt: attempt + 1,
          maxRetries,
          backoffMs,
          component: 'service',
        });

        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}

// Usage
async updateResource(id: string, data: UpdateResourceData): Promise<Resource> {
  return await withDeadlockRetry(
    async () => {
      return await db.transaction(async (tx) => {
        // Complex transaction logic
      });
    },
    { maxRetries: 5, operationName: 'update_resource' }
  );
}
```

---

## Migration Guide

### Migrating to Hybrid Pattern

**Step 1: Convert to internal class**

```typescript
// Old - Pure factory
export function createRBACUsersService(userContext: UserContext) {
  const canRead = ...;
  return { async getUsers() { ... } };
}

// New - Hybrid
class UsersService {
  private readonly canRead: boolean;
  constructor(private readonly userContext: UserContext) {
    this.canRead = ...;
  }
  async getUsers() { ... }
}

export function createRBACUsersService(userContext: UserContext) {
  return new UsersService(userContext);
}
```

**Step 2: Add dependencies**

```typescript
export function createRBACUsersService(
  userContext: UserContext,
  dependencies?: {
    cacheService?: CacheServiceInterface;
  }
) {
  return new UsersService(userContext, dependencies);
}
```

---

## Summary of Implementations

| Pattern | Status | Our Implementation | Priority to Adopt |
|---------|--------|-------------------|------------------|
| Performance Optimization | ✅ | N+1 prevention, JOINs | Continue using |
| Pagination | ✅ | Offset-based (working) | Add cursor when needed |
| Caching | 📝 | chart-data-cache.ts, rate-limit-cache.ts | ✅ Update to match patterns |
| Testing | ✅ | Vitest, integration tests | Continue using |
| Service Composition | ✅ | Dependency injection | Continue using |
| **Idempotency** | ⚠️ | **Not implemented** | ⚠️ High - Add for critical ops |
| **Bulk Operations** | ⚠️ | **Not implemented** | Medium - Add when needed |
| Rate Limiting | 📝 | rate-limit-cache.ts | ✅ Update to match patterns |
| Circuit Breakers | ⚠️ | Not needed yet | Low - Only for external APIs |
| Feature Flags | ⚠️ | Use env vars for now | Low - Only if A/B testing needed |
| Monitoring | 📝 | CloudWatch Logs | ✅ Add health endpoints |
| Database Optimization | ✅ | Connection pooling, deadlock handling | Continue using |

---

**Questions?** See [README.md](./README.md) for navigation or ask in #engineering.

**Version**: 3.0 | **Last Updated**: 2025-01-13
