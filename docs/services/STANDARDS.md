# Service Layer Development Standards

**Status**: Active | **Last Updated**: 2025-01-14 | **Version**: 3.2

**What's New in v3.2:**
- 🆕 Very Complex Services section (rbac-work-items-service as new gold standard)
- 🎯 3-way timing tracking pattern (count + query + custom fields)
- 🔧 Query builder pattern for reducing duplication
- 📦 Service splitting guidelines for 1,000+ line services

**What's New in v3.1:**
- ✨ Advanced Logging Patterns section (calculateChanges, separate query timing, RBAC scope visibility)
- 📏 File Size Guidelines with decision framework (when to split, acceptable exceptions)
- 🏆 Gold Standard Reference Examples (rbac-chart-definitions-service, rbac-staff-members-service)

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
13. [Advanced Logging Patterns](#advanced-logging-patterns) 🆕
14. [File Size Guidelines](#file-size-guidelines) 🆕
15. [Quick Checklist](#quick-checklist)
16. [Gold Standard Reference Examples](#gold-standard-reference-examples) 🆕

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

## Advanced Logging Patterns

### Separate Query Timing

Track individual queries separately for detailed performance insights:

```typescript
// ✅ EXCELLENT - Separate timing for count vs list
async getStaffMembers(practiceId: string, filters: StaffFilters) {
  const startTime = Date.now();

  try {
    // Track count query separately
    const countStart = Date.now();
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(staff_members)
      .where(...conditions);
    const countDuration = Date.now() - countStart;

    // Track list query separately
    const queryStart = Date.now();
    const staff = await db
      .select()
      .from(staff_members)
      .where(...conditions)
      .limit(filters.limit || 100);
    const queryDuration = Date.now() - queryStart;

    const duration = Date.now() - startTime;  // Total operation

    const template = logTemplates.crud.list('staff_members', {
      userId: this.userContext.user_id,
      filters,
      results: { returned: staff.length, total: Number(countResult.count) },
      duration,
      metadata: {
        countDuration,        // Count query timing
        queryDuration,        // List query timing
        slowCount: countDuration > SLOW_THRESHOLDS.DB_QUERY,
        slowQuery: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
      },
    });

    log.info(template.message, template.context);
    return { staff, total: Number(countResult.count) };
  } catch (error) {
    log.error('list staff members failed', error, {...});
    throw error;
  }
}
```

**Why this matters:**
- Identifies whether count or list query is the bottleneck
- Enables CloudWatch queries like: `filter slowCount = true | stats count() by operation`
- Helps diagnose missing indexes

### calculateChanges Integration

Track what fields changed in updates for audit trails:

```typescript
// ✅ EXCELLENT - Audit trail with calculateChanges
async updateStaffMember(
  practiceId: string,
  staffId: string,
  data: UpdateStaffData
): Promise<StaffMember> {
  const startTime = Date.now();

  try {
    // Fetch existing record
    const [existing] = await db
      .select()
      .from(staff_members)
      .where(...)
      .limit(1);

    if (!existing) {
      throw NotFoundError('Staff member');
    }

    // Prepare update data
    const updateData = {
      ...data,
      updated_at: new Date(),
    };

    // Calculate changes for audit logging
    const changes = calculateChanges(
      existing as Record<string, unknown>,
      updateData as Record<string, unknown>,
      Object.keys(data) as (keyof typeof existing)[]
    );

    // Perform update
    const updateStart = Date.now();
    const [updated] = await db
      .update(staff_members)
      .set(updateData)
      .where(...)
      .returning();
    const updateDuration = Date.now() - updateStart;

    const duration = Date.now() - startTime;

    // Log with changes
    const template = logTemplates.crud.update('staff_member', {
      resourceId: staffId,
      resourceName: updated.name,
      userId: this.userContext.user_id,
      changes,  // 🎯 Audit trail of what changed
      duration,
      metadata: {
        updateDuration,
        slow: updateDuration > SLOW_THRESHOLDS.DB_QUERY,
        fieldsChanged: Object.keys(changes).length,  // Count of changed fields
      },
    });

    log.info(template.message, template.context);
    return parsedMember;
  } catch (error) {
    log.error('update staff member failed', error, {...});
    throw error;
  }
}
```

**Type Casting Pattern:**
```typescript
// calculateChanges requires Record<string, unknown>
const changes = calculateChanges(
  existing as Record<string, unknown>,        // Cast Drizzle type
  updateData as Record<string, unknown>,      // Cast update data
  Object.keys(data) as (keyof typeof existing)[]  // Only track updated fields
);
```

**Why this matters:**
- Compliance and audit requirements
- Debugging - see exactly what changed
- Analytics - track most-modified fields

### RBAC Scope Visibility

Include RBAC scope in logs for security analysis:

```typescript
// ✅ EXCELLENT - RBAC scope visibility
async getChartDefinitions(filters?: ChartFilters) {
  const startTime = Date.now();

  try {
    const whereConditions = this.buildRBACWhereConditions();
    const results = await db.select()...;
    const duration = Date.now() - startTime;

    const template = logTemplates.crud.list('chart_definitions', {
      userId: this.userContext.user_id,
      filters: filters || {},
      results: { returned: results.length },
      duration,
      metadata: {
        rbacScope: this.canReadAll ? 'all' : 'own',  // 🎯 Security visibility
      },
    });

    log.info(template.message, template.context);
    return results;
  } catch (error) {
    log.error('list chart definitions failed', error, {...});
    throw error;
  }
}
```

**CloudWatch query example:**
```
fields @timestamp, message, duration, userId, metadata.rbacScope
| filter component = "service" and operation = "list_chart_definitions"
| filter metadata.rbacScope = "own" and duration > 1000
| stats count() by userId
```

**Why this matters:**
- Security auditing - who accessed what with which scope
- Performance analysis - do "own" queries perform differently than "all" queries?
- Compliance - prove data access was appropriately scoped

### Transaction Timing

Track transaction duration separately:

```typescript
// ✅ EXCELLENT - Transaction timing
async reorderStaff(
  practiceId: string,
  staffOrder: { staff_id: string; display_order: number }[]
): Promise<boolean> {
  const startTime = Date.now();

  try {
    // Track transaction separately
    const txStart = Date.now();
    await db.transaction(async (tx) => {
      for (const item of staffOrder) {
        await tx.update(staff_members).set({
          display_order: item.display_order,
          updated_at: new Date(),
        }).where(...);
      }
    });
    const txDuration = Date.now() - txStart;

    const duration = Date.now() - startTime;

    log.info('staff reordered successfully', {
      operation: 'reorder_staff',
      practiceId,
      userId: this.userContext.user_id,
      staffCount: staffOrder.length,
      duration,
      metadata: {
        txDuration,  // Just the transaction
        slow: txDuration > SLOW_THRESHOLDS.DB_QUERY,
        updatesPerSecond: staffOrder.length / (txDuration / 1000),
      },
    });

    return true;
  } catch (error) {
    log.error('reorder staff failed', error, {...});
    throw error;
  }
}
```

**Why this matters:**
- Transaction lock time visibility
- Bulk operation performance
- Helps tune batch sizes

### Custom Operation Logging

For non-CRUD operations, use structured manual logging:

```typescript
// ✅ GOOD - Custom operation with structured logging
async reorderStaff(...) {
  // ... operation logic

  log.info('staff reordered successfully', {
    operation: 'reorder_staff',  // snake_case
    practiceId,
    userId: this.userContext.user_id,
    staffCount: staffOrder.length,  // Operation-specific metadata
    duration,
    component: 'service',
    metadata: {
      txDuration,
      slow: txDuration > SLOW_THRESHOLDS.DB_QUERY,
    },
  });
}
```

**When to use manual logging:**
- Bulk operations (reorder, batch update)
- Business operations (calculate, process, transform)
- Operations that don't fit CRUD pattern

**Always include:**
- `operation` (snake_case)
- `userId`
- `duration`
- `component: 'service'`

---

## File Size Guidelines

### Target: 500 Lines or Less

**General Rule**: Services should be 500 lines or less for maintainability.

### When to Split

If a service exceeds 500 lines, consider splitting:

```typescript
// ❌ BAD - One massive service
// rbac-practices-service.ts (913 lines)
class PracticesService {
  async getPractices() { ... }
  async createPractice() { ... }
  // ... 20 CRUD methods
  async getAnalytics() { ... }
  async getMetrics() { ... }
  async generateReport() { ... }
  // ... 10 analytics methods
}

// ✅ GOOD - Split by responsibility
// rbac-practices-service.ts (~450 lines)
class PracticesService {
  async getPractices() { ... }
  async createPractice() { ... }
  // ... Only CRUD methods
}

// practice-analytics-service.ts (~400 lines)
class PracticeAnalyticsService {
  async getAnalytics() { ... }
  async getMetrics() { ... }
  async generateReport() { ... }
  // ... Only analytics methods
}
```

### Acceptable Exceptions

Services **may exceed 500 lines** if:

1. **Comprehensive Observability** - Extensive performance tracking justified
2. **Multiple CRUD Operations** - 6+ CRUD methods with full logging
3. **Complex Business Logic** - Domain complexity cannot be reasonably split
4. **Helper Methods Included** - Helper methods already reduce duplication

**Example: rbac-staff-members-service.ts (632 lines) ✅ ACCEPTABLE**

This service is 132 lines over the limit, but it's justified because:
- **6 CRUD methods** (list, read, create, update, delete, reorder)
- **8+ query operations** with separate performance tracking
- **calculateChanges integration** for audit trails
- **Transaction handling** for reorderStaff
- **2 helper methods** that reduce duplication across methods
- **Comprehensive metadata** in all logTemplates

```typescript
// Each operation tracks separate query timing
const countStart = Date.now();
const [countResult] = await db.select({ count: sql`count(*)` })...;
const countDuration = Date.now() - countStart;  // Count query timing

const queryStart = Date.now();
const staff = await db.select()...;
const queryDuration = Date.now() - queryStart;  // List query timing

const duration = Date.now() - startTime;  // Total operation timing

metadata: {
  countDuration,
  queryDuration,
  slowCount: countDuration > SLOW_THRESHOLDS.DB_QUERY,
  slowQuery: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
}
```

**Alternative would sacrifice observability** - We prioritize comprehensive performance tracking over arbitrary line counts.

### Decision Framework

**Ask these questions:**

1. **Can I split without scattering related operations?**
   - ✅ Yes → Split (e.g., CRUD + Analytics = 2 services)
   - ❌ No → Keep together

2. **Is the file size due to comprehensive tracking?**
   - ✅ Yes → Acceptable (observability is critical)
   - ❌ No → Refactor and reduce

3. **Would splitting improve or harm maintainability?**
   - ✅ Improve → Split
   - ❌ Harm → Keep together

4. **Are there 6+ CRUD methods?**
   - ✅ Yes → May exceed 500 lines if tracking is comprehensive
   - ❌ No → Should stay under 500 lines

### Rule of Thumb

**Prioritize observability over arbitrary line counts for complex services.**

If you have 3-5 simple methods, stay under 500 lines.
If you have 6+ methods with comprehensive tracking, 600-700 lines may be acceptable.
If you exceed 700 lines, strongly consider splitting.

---

## Quick Checklist

Use this before submitting a PR:

### Architecture
- [ ] Uses hybrid pattern (internal class + factory)
- [ ] Exports service interface
- [ ] File under 500 lines (see File Size Guidelines section for exceptions)

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
- [ ] Separate query timing for complex operations (count vs list)
- [ ] Uses calculateChanges for update operations
- [ ] Includes RBAC scope in metadata where applicable
- [ ] Transaction timing tracked separately

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

## Gold Standard Reference Examples

Use these production services as reference templates:

### Simple Services (1-3 Methods, Read-Only or Simple CRUD)

**📄 [rbac-chart-definitions-service.ts](../../lib/services/rbac-chart-definitions-service.ts)** (283 lines)
- **Grade**: A+ (98%)
- **Use for**: Read-only services, simple CRUD
- **Highlights**:
  - Perfect hybrid pattern
  - Clean RBAC documentation
  - RBAC scope visibility in logs (`rbacScope: 'all' | 'own'`)
  - Early return optimization for no permission
  - Handles not found gracefully with `found: false` logging

**Key Patterns:**
```typescript
// Early return for no permission
if (!this.canReadAll && !this.canReadOwn) {
  const template = logTemplates.crud.list('chart_definitions', {
    userId: this.userContext.user_id,
    filters: filters || {},
    results: { returned: 0, total: 0, page: 1 },
    duration: Date.now() - startTime,
    metadata: { noPermission: true },
  });
  log.info(template.message, template.context);
  return [];
}

// RBAC scope visibility
metadata: {
  rbacScope: this.canReadAll ? 'all' : 'own',
}
```

---

### Complex Services (5-7 Methods, Full CRUD + Transactions)

**📄 [rbac-staff-members-service.ts](../../lib/services/rbac-staff-members-service.ts)** (632 lines)
- **Grade**: A (95%)
- **Use for**: Complex CRUD services, multiple operations
- **Highlights**:
  - 6 CRUD methods with comprehensive logging
  - First service to use `calculateChanges` for audit trails
  - Separate count vs query timing (8+ tracked queries)
  - Transaction handling with timing
  - 2 helper methods reducing duplication

**Key Patterns:**
```typescript
// Separate count vs list timing
const countStart = Date.now();
const [countResult] = await db.select({ count: sql`count(*)` })...;
const countDuration = Date.now() - countStart;

const queryStart = Date.now();
const staff = await db.select()...;
const queryDuration = Date.now() - queryStart;

metadata: {
  countDuration,
  queryDuration,
  slowCount: countDuration > SLOW_THRESHOLDS.DB_QUERY,
  slowQuery: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
}

// calculateChanges for audit trail
const changes = calculateChanges(
  existing as Record<string, unknown>,
  updateData as Record<string, unknown>,
  Object.keys(data) as (keyof typeof existing)[]
);

metadata: {
  fieldsChanged: Object.keys(changes).length,
}

// Transaction timing
const txStart = Date.now();
await db.transaction(async (tx) => { ... });
const txDuration = Date.now() - txStart;

metadata: {
  txDuration,
  slow: txDuration > SLOW_THRESHOLDS.DB_QUERY,
}
```

---

### Very Complex Services (8+ Methods, Rich Domain Models, Multiple Concerns)

**📄 [rbac-work-items-service.ts](../../lib/services/rbac-work-items-service.ts)** (1,198 lines) 🆕
- **Grade**: A+ (100% - Gold Standard for Complex Services)
- **Use for**: Very complex CRUD services, rich domain models, hierarchy management
- **Highlights**:
  - 8 CRUD methods with comprehensive observability
  - 3-way timing tracking (count + query + custom fields)
  - calculateChanges integration for audit trails
  - Query builder pattern eliminates 125+ lines of duplication
  - Shared types file for consistency
  - Helper methods for RBAC and mapping
  - Complex business logic (hierarchy, status transitions, custom fields)

**Key Patterns:**
```typescript
// 3-way timing for complex list operations
const countStart = Date.now();
const [countResult] = await db.select({ count: count() })...;
const countDuration = Date.now() - countStart;

const queryStart = Date.now();
const results = await getWorkItemQueryBuilder()...;
const queryDuration = Date.now() - queryStart;

const customFieldsStart = Date.now();
const customFieldsMap = await this.getCustomFieldValues(workItemIds);
const customFieldsDuration = Date.now() - customFieldsStart;

metadata: {
  countDuration,
  queryDuration,
  customFieldsDuration,
  slowCount: countDuration > SLOW_THRESHOLDS.DB_QUERY,
  slowQuery: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
  slowCustomFields: customFieldsDuration > SLOW_THRESHOLDS.DB_QUERY,
}

// Query builder pattern for reusability
import { getWorkItemQueryBuilder } from './work-items/query-builder';
const results = await getWorkItemQueryBuilder()
  .where(and(...whereConditions))
  .orderBy(orderByClause);

// Shared types across services
import type { WorkItemWithDetails, CreateWorkItemData } from '@/lib/types/work-items';
```

**Supporting Services** (Created alongside):
- **work-item-hierarchy-service.ts** (369 lines) - Hierarchy operations
- **work-item-automation-service.ts** (371 lines) - Auto-creation with templates
- **lib/types/work-items.ts** (69 lines) - Shared type definitions
- **lib/services/work-items/query-builder.ts** (97 lines) - Query helpers

**When to Split:**
If your service exceeds 1,000 lines, consider:
1. Extracting hierarchy/tree operations → separate hierarchy service
2. Extracting automation/templates → separate automation service
3. Extracting complex queries → query builder utility
4. Extracting types → shared types file

---

### Quick Reference

| Service Type | Template | Lines | Methods | Complexity |
|--------------|----------|-------|---------|------------|
| **Read-only** | rbac-chart-definitions-service.ts | 283 | 2 | Low |
| **Simple CRUD** | (Use chart definitions as base) | ~300 | 3-4 | Low-Medium |
| **Complex CRUD** | rbac-staff-members-service.ts | 632 | 6 | High |
| **Very Complex CRUD** 🆕 | rbac-work-items-service.ts | 1,198 | 8 | Very High |

**When starting a new service:**
1. Identify complexity (1-3 methods = simple, 5+ methods = complex)
2. Copy the appropriate reference file
3. Replace resource names and interfaces
4. Adapt permission model to your resource
5. Run `pnpm tsc` and `pnpm lint`

---

## Next Steps

**For advanced patterns**, see:
- [ADVANCED_PATTERNS.md](./ADVANCED_PATTERNS.md) for pagination, caching, circuit breakers, etc.
- [README.md](./README.md) for navigation guide

**Questions?** Ask in #engineering or tag @service-standards-team

---

**Version**: 3.2 | **Last Updated**: 2025-01-14 | **Read Time**: 20-25 minutes
