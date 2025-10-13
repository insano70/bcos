# Service Layer Development Standards

**Status**: Active | **Last Updated**: 2025-01-13 | **Version**: 3.0

> **New to services?** Read this document completely. For advanced patterns, see [ADVANCED_PATTERNS.md](./ADVANCED_PATTERNS.md).

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Pattern](#architecture-pattern)
3. [Gold Standard Template](#gold-standard-template)
4. [Import Order](#import-order)
5. [Naming Conventions](#naming-conventions)
6. [Permission Checking](#permission-checking)
7. [Logging Requirements](#logging-requirements)
8. [Error Handling](#error-handling)
9. [Type Safety](#type-safety)
10. [Transaction Handling](#transaction-handling)
11. [Database Requirements](#database-requirements)
12. [Anti-Patterns](#anti-patterns)
13. [Quick Checklist](#quick-checklist)

---

## Overview

All services must follow these core patterns. This ensures:
- **Security** - Automatic RBAC enforcement
- **Consistency** - Uniform structure across codebase
- **Observability** - Structured logging and performance tracking
- **Maintainability** - Clear patterns, easy to understand

### Core Principles

1. **Filter at database level** - Apply RBAC in queries, not after fetching
2. **Check permissions once** - Cache in constructor, not per-method
3. **Log everything** - Use logTemplates for structured logging
4. **Fail fast** - Validate early, throw meaningful errors
5. **Type everything** - No `any` types, explicit return types

---

## Architecture Pattern

### Hybrid Pattern (Recommended)

**Internal class + factory function** - Best of both worlds.

```typescript
/**
 * Internal implementation - not exported
 * Uses class for memory efficiency (methods shared via prototype)
 */
class UsersService {
  // Permission checks cached once in constructor
  private readonly canReadAll: boolean;
  private readonly canReadOrganization: boolean;
  private readonly accessibleOrgIds: string[];

  constructor(private readonly userContext: UserContext) {
    this.canReadAll = 
      userContext.is_super_admin ||
      userContext.all_permissions?.some(p => p.name === 'users:read:all') || false;
    
    this.canReadOrganization = 
      userContext.all_permissions?.some(p => p.name === 'users:read:organization') || false;
    
    this.accessibleOrgIds = userContext.accessible_organizations
      .map(org => org.organization_id);
  }

  private buildRBACWhereConditions(): any[] {
    const conditions = [isNull(users.deleted_at)];

    if (!this.canReadAll) {
      if (this.canReadOrganization && this.accessibleOrgIds.length > 0) {
        conditions.push(inArray(users.organization_id, this.accessibleOrgIds));
      } else {
        conditions.push(sql`FALSE`); // No permission
      }
    }

    return conditions;
  }

  async getUsers(filters: UserFilters = {}): Promise<User[]> {
    const startTime = Date.now();

    try {
      const whereConditions = this.buildRBACWhereConditions();
      
      const results = await db
        .select()
        .from(users)
        .where(and(...whereConditions))
        .limit(filters.limit || 100);

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.list('users', {
        userId: this.userContext.user_id,
        results: { returned: results.length },
        duration,
      });

      log.info(template.message, template.context);

      return results as User[];
    } catch (error) {
      log.error('list users failed', error, {
        operation: 'list_users',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }
}

/**
 * Public factory function
 * 
 * Creates a new RBAC Users Service.
 * 
 * @param userContext - User context with RBAC permissions
 * @returns Service interface
 * 
 * @example
 * ```typescript
 * const service = createRBACUsersService(userContext);
 * const users = await service.getUsers({ is_active: true });
 * ```
 */
export function createRBACUsersService(
  userContext: UserContext
): UsersServiceInterface {
  return new UsersService(userContext);
}
```

**Why This Pattern?**
- ✅ Memory efficient (methods shared via prototype)
- ✅ Permission caching in constructor
- ✅ Familiar to developers (class-based)
- ✅ Consistent API (factory pattern)
- ✅ Testable (dependency injection)

---

## Gold Standard Template

```typescript
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resources } from '@/lib/db/schema';
import { log, logTemplates, calculateChanges, SLOW_THRESHOLDS } from '@/lib/logger';
import { NotFoundError, ValidationError, AuthorizationError } from '@/lib/api/responses/error';
import type { UserContext } from '@/lib/types/rbac';

// ============================================================
// INTERFACES
// ============================================================

export interface ResourceServiceInterface {
  getResources(filters?: ResourceFilters): Promise<Resource[]>;
  getResourceById(id: string): Promise<Resource | null>;
  createResource(data: CreateResourceData): Promise<Resource>;
  updateResource(id: string, data: UpdateResourceData): Promise<Resource>;
  deleteResource(id: string): Promise<boolean>;
}

export interface ResourceFilters {
  search?: string;
  is_active?: boolean;
  organization_id?: string;
  limit?: number;
  offset?: number;
}

export interface CreateResourceData {
  name: string;
  organization_id: string;
}

export interface UpdateResourceData {
  name?: string;
  is_active?: boolean;
}

export interface Resource {
  resource_id: string;
  name: string;
  organization_id: string;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// ============================================================
// IMPLEMENTATION
// ============================================================

class ResourceService {
  private readonly canReadAll: boolean;
  private readonly canReadOrganization: boolean;
  private readonly canCreate: boolean;
  private readonly canUpdate: boolean;
  private readonly canDelete: boolean;
  private readonly accessibleOrgIds: string[];

  constructor(private readonly userContext: UserContext) {
    // Cache all permission checks once
    this.canReadAll = 
      userContext.is_super_admin ||
      userContext.all_permissions?.some(p => p.name === 'resources:read:all') || false;
    
    this.canReadOrganization = 
      userContext.all_permissions?.some(p => p.name === 'resources:read:organization') || false;
    
    this.canCreate =
      userContext.is_super_admin ||
      userContext.all_permissions?.some(p => p.name === 'resources:create:organization') || false;
    
    this.canUpdate =
      userContext.is_super_admin ||
      userContext.all_permissions?.some(p => 
        p.name === 'resources:update:organization' || p.name === 'resources:manage:all'
      ) || false;
    
    this.canDelete =
      userContext.is_super_admin ||
      userContext.all_permissions?.some(p => p.name === 'resources:manage:all') || false;
    
    this.accessibleOrgIds = userContext.accessible_organizations
      .map(org => org.organization_id);
  }

  private buildRBACWhereConditions(): any[] {
    const conditions = [isNull(resources.deleted_at)];

    if (!this.canReadAll) {
      if (this.canReadOrganization && this.accessibleOrgIds.length > 0) {
        conditions.push(inArray(resources.organization_id, this.accessibleOrgIds));
      } else {
        conditions.push(sql`FALSE`);
      }
    }

    return conditions;
  }

  private canAccessOrganization(organizationId: string): boolean {
    if (this.userContext.is_super_admin) return true;
    return this.accessibleOrgIds.includes(organizationId);
  }

  async getResources(filters: ResourceFilters = {}): Promise<Resource[]> {
    const startTime = Date.now();

    try {
      const whereConditions = this.buildRBACWhereConditions();

      if (filters.is_active !== undefined) {
        whereConditions.push(eq(resources.is_active, filters.is_active));
      }

      if (filters.organization_id) {
        if (!this.canAccessOrganization(filters.organization_id)) {
          throw AuthorizationError('Access denied to organization');
        }
        whereConditions.push(eq(resources.organization_id, filters.organization_id));
      }

      const queryStart = Date.now();
      const results = await db
        .select()
        .from(resources)
        .where(and(...whereConditions))
        .limit(filters.limit || 100)
        .offset(filters.offset || 0);

      const queryDuration = Date.now() - queryStart;
      const duration = Date.now() - startTime;

      const template = logTemplates.crud.list('resources', {
        userId: this.userContext.user_id,
        filters,
        results: { returned: results.length },
        duration,
        metadata: { queryDuration, slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY },
      });

      log.info(template.message, template.context);

      return results as Resource[];
    } catch (error) {
      log.error('list resources failed', error, {
        operation: 'list_resources',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  async getResourceById(id: string): Promise<Resource | null> {
    const startTime = Date.now();

    try {
      const [resource] = await db
        .select()
        .from(resources)
        .where(and(eq(resources.resource_id, id), isNull(resources.deleted_at)))
        .limit(1);

      if (!resource) return null;

      // Check RBAC access
      if (!this.canReadAll && !this.canAccessOrganization(resource.organization_id)) {
        throw NotFoundError('Resource');
      }

      const duration = Date.now() - startTime;

      log.info('resource retrieved', {
        operation: 'get_resource_by_id',
        resourceId: id,
        userId: this.userContext.user_id,
        duration,
        component: 'service',
      });

      return resource as Resource;
    } catch (error) {
      log.error('get resource by id failed', error, {
        operation: 'get_resource_by_id',
        resourceId: id,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  async createResource(data: CreateResourceData): Promise<Resource> {
    const startTime = Date.now();

    try {
      if (!this.canCreate) {
        throw AuthorizationError('You do not have permission to create resources');
      }

      if (!this.canAccessOrganization(data.organization_id)) {
        throw AuthorizationError('Access denied to organization');
      }

      const [newResource] = await db
        .insert(resources)
        .values({
          ...data,
          created_by: this.userContext.user_id,
          is_active: true,
        })
        .returning();

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.create('resource', {
        resourceId: newResource.resource_id,
        resourceName: newResource.name,
        userId: this.userContext.user_id,
        organizationId: data.organization_id,
        duration,
      });

      log.info(template.message, template.context);

      return newResource as Resource;
    } catch (error) {
      log.error('create resource failed', error, {
        operation: 'create_resource',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  async updateResource(id: string, data: UpdateResourceData): Promise<Resource> {
    const startTime = Date.now();

    try {
      if (!this.canUpdate) {
        throw AuthorizationError('You do not have permission to update resources');
      }

      const existing = await this.getResourceById(id);
      if (!existing) {
        throw NotFoundError('Resource');
      }

      const changes = calculateChanges(existing, data);

      const [updated] = await db
        .update(resources)
        .set({ ...data, updated_at: new Date() })
        .where(eq(resources.resource_id, id))
        .returning();

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.update('resource', {
        resourceId: id,
        resourceName: updated.name,
        userId: this.userContext.user_id,
        changes,
        duration,
      });

      log.info(template.message, template.context);

      return updated as Resource;
    } catch (error) {
      log.error('update resource failed', error, {
        operation: 'update_resource',
        resourceId: id,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  async deleteResource(id: string): Promise<boolean> {
    const startTime = Date.now();

    try {
      if (!this.canDelete) {
        throw AuthorizationError('You do not have permission to delete resources');
      }

      const existing = await this.getResourceById(id);
      if (!existing) {
        throw NotFoundError('Resource');
      }

      await db
        .update(resources)
        .set({ deleted_at: new Date(), updated_at: new Date() })
        .where(eq(resources.resource_id, id));

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.delete('resource', {
        resourceId: id,
        resourceName: existing.name,
        userId: this.userContext.user_id,
        duration,
      });

      log.info(template.message, template.context);

      return true;
    } catch (error) {
      log.error('delete resource failed', error, {
        operation: 'delete_resource',
        resourceId: id,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create RBAC Resource Service
 * 
 * @param userContext - User context with RBAC permissions
 * @returns Service interface
 * 
 * @example
 * ```typescript
 * const service = createRBACResourceService(userContext);
 * const resources = await service.getResources({ is_active: true });
 * ```
 */
export function createRBACResourceService(
  userContext: UserContext
): ResourceServiceInterface {
  return new ResourceService(userContext);
}
```

---

## Import Order

**Always organize imports in this exact order:**

```typescript
// 1. Drizzle ORM
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

// 2. Database
import { db } from '@/lib/db';
import { resources, users } from '@/lib/db/schema';

// 3. Logging
import { log, logTemplates, calculateChanges, SLOW_THRESHOLDS } from '@/lib/logger';

// 4. Errors
import { NotFoundError, ValidationError, AuthorizationError } from '@/lib/api/responses/error';

// 5. Types
import type { UserContext } from '@/lib/types/rbac';

// 6. Other services (for composition)
import type { CacheServiceInterface } from '@/lib/services/interfaces';
```

---

## Naming Conventions

### Service Functions
**Format**: `createRBAC[Resource]Service`

```typescript
// ✅ Correct
export function createRBACUsersService(userContext: UserContext) {}
export function createRBACPracticesService(userContext: UserContext) {}

// ❌ Incorrect
export function usersService() {}
export function getUsersService() {}
```

### Interfaces
**Format**: `[Resource]ServiceInterface`

```typescript
// ✅ Correct
export interface UsersServiceInterface {}
export interface PracticesServiceInterface {}

// ❌ Incorrect
export interface IUsersService {} // Don't use "I" prefix
export interface UserService {} // Use plural
```

### Methods
Follow standard CRUD pattern:

```typescript
// ✅ Standard CRUD
getResources(filters): Promise<Resource[]>
getResourceById(id): Promise<Resource | null>
createResource(data): Promise<Resource>
updateResource(id, data): Promise<Resource>
deleteResource(id): Promise<boolean>

// ❌ Incorrect
getAllResources() // Should be getResources
addResource() // Should be createResource
removeResource() // Should be deleteResource
```

---

## Permission Checking

### Check Once in Constructor

```typescript
class ResourceService {
  private readonly canReadAll: boolean;
  private readonly canReadOrganization: boolean;

  constructor(private readonly userContext: UserContext) {
    // ✅ Check permissions ONCE in constructor
    this.canReadAll = 
      userContext.is_super_admin ||
      userContext.all_permissions?.some(p => p.name === 'resources:read:all') || false;
    
    this.canReadOrganization = 
      userContext.all_permissions?.some(p => p.name === 'resources:read:organization') || false;
  }

  async getResources() {
    // ✅ Use cached permission
    if (!this.canReadAll) {
      // Apply RBAC filtering
    }
  }
}
```

### Filter at Database Level

```typescript
// ✅ GOOD - Filter in query
private buildRBACWhereConditions(): any[] {
  const conditions = [isNull(resources.deleted_at)];

  if (!this.canReadAll) {
    if (this.canReadOrganization) {
      conditions.push(inArray(resources.organization_id, this.accessibleOrgIds));
    } else {
      conditions.push(sql`FALSE`);
    }
  }

  return conditions;
}

// ❌ BAD - Filter after fetching
async getResources() {
  const all = await db.select().from(resources);
  return all.filter(r => this.accessibleOrgIds.includes(r.organization_id));
}
```

---

## Logging Requirements

### Use logTemplates for CRUD

**MANDATORY**: All CRUD operations must use `logTemplates`:

```typescript
// ✅ CORRECT
async getResources(filters: ResourceFilters) {
  const startTime = Date.now();

  try {
    const results = await db.select()...;
    const duration = Date.now() - startTime;

    const template = logTemplates.crud.list('resources', {
      userId: this.userContext.user_id,
      filters,
      results: { returned: results.length },
      duration,
    });

    log.info(template.message, template.context);
    return results;
  } catch (error) {
    log.error('list resources failed', error, {
      operation: 'list_resources',
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
      component: 'service',
    });
    throw error;
  }
}

// ❌ INCORRECT - Manual logging
log.info('Resources retrieved', { count: results.length });
```

### Required Log Context

```typescript
{
  operation: 'operation_name',      // Required: snake_case
  userId: this.userContext.user_id, // Required: who
  duration: Date.now() - startTime, // Required: performance
  component: 'service',              // Required: source
}
```

---

## Error Handling

### Standard Error Types

```typescript
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  AuthorizationError,
} from '@/lib/api/responses/error';

// ✅ Use factory functions
throw NotFoundError('Resource');
throw ValidationError('Invalid email format');
throw ConflictError('Resource already exists');
throw AuthorizationError('Access denied');

// ❌ Don't use generic Error
throw new Error('Resource not found');
```

### Try-Catch Structure

**Every method must have try-catch:**

```typescript
async getResource(id: string): Promise<Resource | null> {
  const startTime = Date.now();

  try {
    const resource = await db.select()...;

    log.info('resource retrieved', {
      operation: 'get_resource',
      resourceId: id,
      duration: Date.now() - startTime,
      component: 'service',
    });

    return resource;
  } catch (error) {
    log.error('get resource failed', error, {
      operation: 'get_resource',
      resourceId: id,
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
      component: 'service',
    });
    throw error;
  }
}
```

---

## Type Safety

### No `any` Types Ever

```typescript
// ✅ CORRECT
async getResources(filters: ResourceFilters): Promise<Resource[]> {
  const results = await db.select()...;
  return results as Resource[];
}

// ❌ INCORRECT
async getResources(filters: any): Promise<any[]> {
  return await db.select()...;
}
```

### Export All Interfaces

```typescript
// ✅ CORRECT
export interface ResourceServiceInterface { ... }
export interface Resource { ... }
export interface ResourceFilters { ... }
export interface CreateResourceData { ... }

// ❌ INCORRECT - Inline types
export function createRBACResourceService(): {
  getResources(filters: { search?: string }): Promise<unknown[]>
} { ... }
```

### Explicit Return Types

```typescript
// ✅ CORRECT
async getResource(id: string): Promise<Resource | null> {
  // ...
}

// ❌ INCORRECT - Inferred
async getResource(id: string) {
  // ...
}
```

---

## Transaction Handling

### Atomic Multi-Step Operations

```typescript
// ✅ GOOD - Use transactions
async updateResourceWithRelations(id: string, data: UpdateData, relationIds: string[]) {
  return await db.transaction(async (tx) => {
    const [resource] = await tx.update(resources).set(data).returning();
    await tx.delete(resourceRelations).where(eq(resourceRelations.resource_id, id));
    
    if (relationIds.length > 0) {
      await tx.insert(resourceRelations).values(
        relationIds.map(relId => ({ resource_id: id, relation_id: relId }))
      );
    }
    
    return resource;
  });
}

// ❌ BAD - Separate transactions
async updateResourceWithRelations(id: string, data: UpdateData, relationIds: string[]) {
  const resource = await db.update(resources).set(data).returning();
  await db.delete(resourceRelations).where(...);
  await db.insert(resourceRelations).values(...);
  return resource;
}
```

---

## Database Requirements

### Required Indexes

**Every service table must have these indexes:**

```sql
-- Soft delete index (CRITICAL)
CREATE INDEX idx_resources_deleted_at 
ON resources(deleted_at) 
WHERE deleted_at IS NOT NULL;

-- Organization filtering
CREATE INDEX idx_resources_org_not_deleted 
ON resources(organization_id) 
WHERE deleted_at IS NULL;

-- User ownership
CREATE INDEX idx_resources_created_by_not_deleted 
ON resources(created_by) 
WHERE deleted_at IS NULL;

-- Unique constraint respecting soft deletes
CREATE UNIQUE INDEX idx_resources_name_org_unique 
ON resources(name, organization_id) 
WHERE deleted_at IS NULL;
```

---

## Anti-Patterns

### ❌ Post-Fetch RBAC Filtering

```typescript
// ❌ BAD - Fetch all, then filter
async getResources() {
  const all = await db.select().from(resources);
  return all.filter(r => this.accessibleOrgIds.includes(r.organization_id));
}

// ✅ GOOD - Filter at database level
async getResources() {
  return await db
    .select()
    .from(resources)
    .where(inArray(resources.organization_id, this.accessibleOrgIds));
}
```

### ❌ Permission Checks Per Method

```typescript
// ❌ BAD - Check every time
async getResources() {
  const canRead = this.userContext.all_permissions?.some(...); // Slow!
  if (!canRead) return [];
}

// ✅ GOOD - Check once in constructor
constructor(private readonly userContext: UserContext) {
  this.canRead = this.userContext.all_permissions?.some(...);
}
```

### ❌ Missing logTemplates

```typescript
// ❌ BAD - Manual logging
async createResource(data: CreateResourceData) {
  const resource = await db.insert(resources).values(data);
  log.info('Resource created');
  return resource;
}

// ✅ GOOD - Use logTemplates
async createResource(data: CreateResourceData) {
  const startTime = Date.now();
  const [resource] = await db.insert(resources).values(data).returning();
  const duration = Date.now() - startTime;

  const template = logTemplates.crud.create('resource', {
    resourceId: resource.resource_id,
    userId: this.userContext.user_id,
    duration,
  });

  log.info(template.message, template.context);
  return resource;
}
```

### ❌ Missing Transactions

```typescript
// ❌ BAD - Not atomic
async createOrderWithItems(order: Order, items: OrderItem[]) {
  const newOrder = await db.insert(orders).values(order);
  await db.insert(orderItems).values(items); // Could fail!
  return newOrder;
}

// ✅ GOOD - Atomic
async createOrderWithItems(order: Order, items: OrderItem[]) {
  return await db.transaction(async (tx) => {
    const [newOrder] = await tx.insert(orders).values(order).returning();
    await tx.insert(orderItems).values(items);
    return newOrder;
  });
}
```

---

## Quick Checklist

Use this before submitting a PR:

### Architecture
- [ ] Uses hybrid pattern (internal class + factory)
- [ ] Exports service interface
- [ ] File under 500 lines (split if larger)

### Type Safety
- [ ] No `any` types anywhere
- [ ] All interfaces exported
- [ ] Explicit return types

### Security & RBAC
- [ ] Permissions checked in constructor
- [ ] RBAC filtering at database level
- [ ] Organization access verified

### Logging
- [ ] Uses logTemplates for CRUD
- [ ] Has startTime/duration tracking
- [ ] Logs on success and error

### Error Handling
- [ ] Try-catch in every method
- [ ] Uses standard error factories
- [ ] Re-throws for API handler

### Database
- [ ] Uses transactions for multi-step ops
- [ ] Required indexes documented
- [ ] Soft deletes implemented

### Testing
- [ ] Has unit tests for permission logic
- [ ] Testable (dependencies injectable)

---

## Next Steps

**For advanced patterns**, see:
- [ADVANCED_PATTERNS.md](./ADVANCED_PATTERNS.md) for pagination, caching, circuit breakers, etc.
- [README.md](./README.md) for navigation guide

**Questions?** Ask in #engineering or tag @service-standards-team

---

**Version**: 3.0 | **Lines**: ~600 | **Read Time**: 15-20 minutes
