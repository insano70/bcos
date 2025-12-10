# RBAC Service Optimization Plan

## Executive Summary

This document outlines a plan to reduce code duplication across 24 RBAC service files (estimated ~8,000+ lines) by introducing a generic CRUD service infrastructure. The goal is to maintain full backward compatibility while reducing boilerplate by ~40-50%.

**Note:** Not all services will fit the generic pattern. Complex services with multi-table transactions, specialized operations, or heavy join queries will remain custom implementations.

---

## Current State Analysis

### Files Identified (24 RBAC Services)

| Service | Lines | CRUD Operations | Complexity |
|---------|-------|-----------------|------------|
| rbac-users-service.ts | ~821 | Full CRUD + specialized | High |
| rbac-practices-service.ts | ~682 | Full CRUD + images | High |
| rbac-roles-service.ts | ~627 | Full CRUD + permissions | High |
| rbac-staff-members-service.ts | ~633 | Full CRUD + reorder | Medium |
| rbac-data-sources-service.ts | ~620 | Full CRUD + introspection | Medium |
| rbac-charts-service.ts | ~567 | Full CRUD + dashboard | Medium |
| rbac-work-item-types-service.ts | ~462 | Full CRUD | Medium |
| rbac-work-item-attachments-service.ts | ~459 | Full CRUD + S3 | Medium |
| rbac-work-item-statuses-service.ts | ~385 | Full CRUD | Low |
| rbac-work-item-comments-service.ts | ~361 | Full CRUD + nesting | Low |
| rbac-work-item-fields-service.ts | ~338 | Full CRUD | Low |
| rbac-templates-service.ts | ~320 | Full CRUD | Low |
| rbac-favorites-service.ts | ~167 | Partial CRUD | Low |
| rbac-categories-service.ts | ~133 | Partial CRUD | Low |
| rbac-chart-definitions-service.ts | ~400 | Full CRUD | Medium |
| rbac-practice-attributes-service.ts | ~150 | Update only | Low |
| rbac-work-item-activity-service.ts | ~300 | Read + Create | Low |
| rbac-work-item-field-values-service.ts | ~250 | CRUD | Low |
| rbac-data-source-columns-service.ts | ~350 | Full CRUD | Low |
| rbac-work-item-type-relationships-service.ts | ~300 | Full CRUD | Low |
| rbac-work-item-watchers-service.ts | ~200 | Add/Remove | Low |
| rbac-work-item-status-transitions-service.ts | ~250 | Full CRUD | Low |
| rbac-practices-images-service.ts | ~200 | Full CRUD + S3 | Low |
| rbac-practice-utils.ts | ~100 | Utilities | N/A |

**Total Estimated Lines**: ~8,000+

### Services That Will Remain Custom (Not Migrate)

These services have complexity or patterns that don't fit the generic CRUD model:

| Service | Lines | Reason |
|---------|-------|--------|
| `rbac-users-service.ts` | 821 | Multi-table transactions, security record init, role assignment |
| `rbac-practices-service.ts` | 682 | Initialization transactions, image handling, complex joins |
| `rbac-roles-service.ts` | 627 | Permission aggregation, complex grouping queries |
| `rbac-favorites-service.ts` | 167 | Join queries, non-standard operations (add/remove vs create/delete) |
| `rbac-practice-utils.ts` | 100 | Utility functions, not a CRUD service |

**Total kept custom**: ~2,400 lines (these benefit from shared utilities but not full abstraction)

### Duplicated Patterns Identified

#### 1. Permission Checking (~20 lines per service)
```typescript
// Repeated in every service method
this.requirePermission('resource:action:scope', resourceId, organizationId);
```

#### 2. Query Timing & Logging (~15 lines per method)
```typescript
const startTime = Date.now();
// ... operation ...
log.info('Operation completed', {
  count: results.length,
  duration: Date.now() - startTime,
  userId: this.userContext.user_id,
});
```

#### 3. Soft Delete Filtering (~5 lines per query)
```typescript
.where(and(
  eq(table.id, id),
  isNull(table.deleted_at)
))
```

#### 4. Pagination (~10 lines per list method)
```typescript
.limit(options.limit || 100)
.offset(options.offset || 0)
// Plus count query for total
```

#### 5. Factory Functions (~5 lines per service)
```typescript
export function createRBAC*Service(userContext: UserContext): RBAC*Service {
  return new RBAC*Service(userContext);
}
```

#### 6. getById Pattern (~25-40 lines per service)
```typescript
async getById(id: string): Promise<Entity | null> {
  const startTime = Date.now();
  this.requirePermission('resource:read:scope');

  const [result] = await db
    .select({ /* fields */ })
    .from(table)
    .where(and(eq(table.id, id), isNull(table.deleted_at)));

  log.info('Entity retrieved', { id, found: !!result, duration: Date.now() - startTime });
  return result || null;
}
```

#### 7. Create Pattern (~40-60 lines per service)
```typescript
async create(data: CreateData): Promise<Entity> {
  const startTime = Date.now();
  this.requirePermission('resource:create:scope');

  const [result] = await db
    .insert(table)
    .values({ /* data mapping */ })
    .returning();

  if (!result) throw new DatabaseError('Failed to create');

  log.info('Entity created', { id: result.id, duration: Date.now() - startTime });
  return result;
}
```

#### 8. Update Pattern (~50-70 lines per service)
```typescript
async update(id: string, data: UpdateData): Promise<Entity> {
  const startTime = Date.now();
  this.requirePermission('resource:update:scope');

  const existing = await this.getById(id);
  if (!existing) throw new NotFoundError('Entity', id);

  const [result] = await db
    .update(table)
    .set({ ...data, updated_at: new Date() })
    .where(eq(table.id, id))
    .returning();

  log.info('Entity updated', { id, duration: Date.now() - startTime });
  return result;
}
```

#### 9. Delete Pattern (~40-50 lines per service)
```typescript
async delete(id: string): Promise<void> {
  const startTime = Date.now();
  this.requirePermission('resource:delete:scope');

  const existing = await this.getById(id);
  if (!existing) throw new NotFoundError('Entity', id);

  await db
    .update(table)
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where(eq(table.id, id));

  log.info('Entity deleted', { id, duration: Date.now() - startTime });
}
```

---

## Proposed Solution: Generic CRUD Service Infrastructure

### Architecture Overview

```
lib/services/crud/
├── index.ts                      # Public exports
├── types.ts                      # Generic type definitions
├── base-crud-service.ts          # Abstract generic CRUD service
├── crud-operations.ts            # Reusable CRUD operation builders
├── query-helpers.ts              # WHERE condition builders
├── logging-helpers.ts            # Standardized logging
└── pagination-helpers.ts         # Pagination utilities

lib/services/
├── rbac-*.ts                     # Existing services (refactored)
└── ...
```

### Core Components

#### 1. Generic Type Definitions (`types.ts`)

```typescript
import type { PgTable, PgColumn, InferSelectModel } from 'drizzle-orm/pg-core';
import type { UserContext, PermissionName } from '@/lib/types/rbac';

/**
 * Configuration for a CRUD service
 *
 * @template TTable - Drizzle table type
 * @template TEntity - Entity type (use InferSelectModel<TTable> or custom type)
 * @template TCreateData - Data type for create operations
 * @template TUpdateData - Data type for update operations
 * @template TQueryOptions - Query options type extending BaseQueryOptions
 */
export interface CrudServiceConfig<
  TTable extends PgTable,
  TEntity,
  TCreateData,
  TUpdateData,
  TQueryOptions extends BaseQueryOptions = BaseQueryOptions
> {
  /** The drizzle table schema */
  table: TTable;

  /** Resource name for permissions (e.g., 'work-items', 'templates') */
  resourceName: string;

  /** Display name for logging (e.g., 'work item', 'template') */
  displayName: string;

  /** Primary key column name (string, not column reference) */
  primaryKeyName: keyof InferSelectModel<TTable>;

  /** Deleted at column name (for soft deletes) - undefined if hard delete */
  deletedAtColumnName?: string;

  /** Updated at column name */
  updatedAtColumnName?: string;

  /** Permission configuration */
  permissions: {
    read: PermissionName | PermissionName[];
    create?: PermissionName | PermissionName[];
    update?: PermissionName | PermissionName[];
    delete?: PermissionName | PermissionName[];
  };

  /** Organization scoping configuration */
  organizationScoping?: {
    /** Column name that contains organization_id */
    columnName: string;
    /** Whether to apply org filtering automatically */
    autoFilter: boolean;
  };

  /**
   * Parent resource configuration for cascading permission checks
   * Used when this resource belongs to a parent (e.g., status -> work_item_type)
   */
  parentResource?: {
    /** The parent table */
    table: PgTable;
    /** Foreign key column name on THIS table pointing to parent */
    foreignKeyColumnName: string;
    /** Primary key column name on parent table */
    parentPrimaryKeyName: string;
    /** Organization column name on parent (for access validation) */
    parentOrgColumnName?: string;
    /** Permission to check for parent access */
    parentPermission?: PermissionName;
  };

  /** Custom validators */
  validators?: {
    beforeCreate?: (data: TCreateData, ctx: UserContext) => Promise<void>;
    beforeUpdate?: (id: string | number, data: TUpdateData, existing: TEntity, ctx: UserContext) => Promise<void>;
    beforeDelete?: (id: string | number, existing: TEntity, ctx: UserContext) => Promise<void>;
  };

  /** Lifecycle hooks (run after successful operations) */
  hooks?: {
    afterCreate?: (entity: TEntity, ctx: UserContext) => Promise<void>;
    afterUpdate?: (entity: TEntity, ctx: UserContext) => Promise<void>;
    afterDelete?: (id: string | number, ctx: UserContext) => Promise<void>;
  };

  /** Custom transformers */
  transformers?: {
    /** Transform database row to entity (for custom field mapping) */
    toEntity?: (row: InferSelectModel<TTable>) => TEntity;
    /** Transform create data to insert values */
    toCreateValues?: (data: TCreateData, ctx: UserContext) => Partial<InferSelectModel<TTable>>;
    /** Transform update data to update values */
    toUpdateValues?: (data: TUpdateData, ctx: UserContext) => Partial<InferSelectModel<TTable>>;
  };
}

/**
 * Base query options for list operations
 */
export interface BaseQueryOptions {
  limit?: number;
  offset?: number;
  search?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Standard list response with pagination metadata
 */
export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * CRUD operation result with timing
 */
export interface OperationResult<T> {
  data: T;
  duration: number;
}
```

#### 2. Base CRUD Service (`base-crud-service.ts`)

```typescript
import { and, eq, isNull, inArray, asc, desc, or, count, type SQL } from 'drizzle-orm';
import type { PgTable, InferSelectModel } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { NotFoundError, DatabaseError, ForbiddenError } from '@/lib/errors/domain-errors';
import { log, logTemplates, calculateChanges } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import type { CrudServiceConfig, BaseQueryOptions, ListResponse } from './types';

/**
 * Generic CRUD Service with automatic RBAC, logging, and soft delete support.
 *
 * IMPORTANT: All logging uses logTemplates for consistency.
 * See lib/logger/templates.ts for available templates.
 *
 * @template TTable - Drizzle table type
 * @template TEntity - Entity type returned by read operations
 * @template TCreateData - Data type for create operations
 * @template TUpdateData - Data type for update operations
 * @template TQueryOptions - Query options type for list operations
 */
export abstract class BaseCrudService<
  TTable extends PgTable,
  TEntity,
  TCreateData,
  TUpdateData,
  TQueryOptions extends BaseQueryOptions = BaseQueryOptions
> extends BaseRBACService {

  protected abstract config: CrudServiceConfig<TTable, TEntity, TCreateData, TUpdateData, TQueryOptions>;

  constructor(userContext: UserContext) {
    super(userContext);
  }

  /**
   * Get paginated list of entities
   */
  async getList(options: TQueryOptions = {} as TQueryOptions): Promise<ListResponse<TEntity>> {
    const startTime = Date.now();
    const { config } = this;

    // Check permission
    this.requireAnyPermission(
      Array.isArray(config.permissions.read)
        ? config.permissions.read
        : [config.permissions.read]
    );

    // Validate parent access if configured
    await this.validateParentAccess(options);

    // Build WHERE conditions
    const conditions = this.buildBaseConditions(options);

    // Get total count
    const [countResult] = await db
      .select({ count: count() })
      .from(config.table)
      .where(and(...conditions));

    const total = Number(countResult?.count || 0);

    // Get paginated data
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const rows = await db
      .select()
      .from(config.table)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)
      .$dynamic();

    // Note: Sorting applied via $dynamic() - see buildSortClause()

    // Transform rows to entities
    const items = config.transformers?.toEntity
      ? rows.map((row) => config.transformers!.toEntity!(row as InferSelectModel<TTable>))
      : (rows as unknown as TEntity[]);

    const duration = Date.now() - startTime;

    // REQUIRED: Use logTemplates for consistent logging
    const template = logTemplates.crud.list(config.displayName, {
      userId: this.userContext.user_id,
      filters: options as Record<string, unknown>,
      results: { returned: items.length, total, page: Math.floor(offset / limit) + 1 },
      duration,
      metadata: {
        component: 'crud-service',
        resourceType: config.resourceName,
      },
    });
    log.info(template.message, template.context);

    return {
      items,
      total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Get single entity by ID
   */
  async getById(id: string | number): Promise<TEntity | null> {
    const startTime = Date.now();
    const { config } = this;

    this.requireAnyPermission(
      Array.isArray(config.permissions.read)
        ? config.permissions.read
        : [config.permissions.read]
    );

    const conditions: SQL[] = [eq(config.table[config.primaryKeyName], id)];
    if (config.deletedAtColumnName) {
      conditions.push(isNull(config.table[config.deletedAtColumnName]));
    }

    const [row] = await db
      .select()
      .from(config.table)
      .where(and(...conditions));

    if (!row) {
      const duration = Date.now() - startTime;
      const template = logTemplates.crud.read(config.displayName, {
        resourceId: String(id),
        found: false,
        userId: this.userContext.user_id,
        duration,
      });
      log.info(template.message, template.context);
      return null;
    }

    // Validate parent access if configured
    if (config.parentResource) {
      await this.validateParentAccessForEntity(row as InferSelectModel<TTable>);
    }

    const entity = config.transformers?.toEntity
      ? config.transformers.toEntity(row as InferSelectModel<TTable>)
      : (row as unknown as TEntity);

    const duration = Date.now() - startTime;

    const template = logTemplates.crud.read(config.displayName, {
      resourceId: String(id),
      found: true,
      userId: this.userContext.user_id,
      duration,
    });
    log.info(template.message, template.context);

    return entity;
  }

  /**
   * Get count of entities matching options
   */
  async getCount(options: TQueryOptions = {} as TQueryOptions): Promise<number> {
    const { config } = this;

    this.requireAnyPermission(
      Array.isArray(config.permissions.read)
        ? config.permissions.read
        : [config.permissions.read]
    );

    const conditions = this.buildBaseConditions(options);

    const [countResult] = await db
      .select({ count: count() })
      .from(config.table)
      .where(and(...conditions));

    return Number(countResult?.count || 0);
  }

  /**
   * Create new entity
   */
  async create(data: TCreateData): Promise<TEntity> {
    const startTime = Date.now();
    const { config } = this;

    if (config.permissions.create) {
      this.requireAnyPermission(
        Array.isArray(config.permissions.create)
          ? config.permissions.create
          : [config.permissions.create]
      );
    }

    // Validate parent access if configured
    await this.validateParentAccessForCreate(data);

    // Run custom validator
    if (config.validators?.beforeCreate) {
      await config.validators.beforeCreate(data, this.userContext);
    }

    // Transform data to insert values
    const values = config.transformers?.toCreateValues
      ? config.transformers.toCreateValues(data, this.userContext)
      : (data as Partial<InferSelectModel<TTable>>);

    // Use .returning() without arguments to get all columns (Drizzle default)
    const [row] = await db
      .insert(config.table)
      .values(values as InferSelectModel<TTable>)
      .returning();

    if (!row) {
      throw new DatabaseError(`Failed to create ${config.displayName}`, 'write');
    }

    const entity = config.transformers?.toEntity
      ? config.transformers.toEntity(row as InferSelectModel<TTable>)
      : (row as unknown as TEntity);

    const duration = Date.now() - startTime;

    const template = logTemplates.crud.create(config.displayName, {
      resourceId: String((row as Record<string, unknown>)[config.primaryKeyName as string]),
      userId: this.userContext.user_id,
      duration,
      metadata: {
        component: 'crud-service',
        resourceType: config.resourceName,
      },
    });
    log.info(template.message, template.context);

    // Run after hook
    if (config.hooks?.afterCreate) {
      await config.hooks.afterCreate(entity, this.userContext);
    }

    return entity;
  }

  /**
   * Update existing entity
   */
  async update(id: string | number, data: TUpdateData): Promise<TEntity> {
    const startTime = Date.now();
    const { config } = this;

    if (config.permissions.update) {
      this.requireAnyPermission(
        Array.isArray(config.permissions.update)
          ? config.permissions.update
          : [config.permissions.update]
      );
    }

    // Verify entity exists (also validates parent access)
    const existing = await this.getById(id);
    if (!existing) {
      throw new NotFoundError(config.displayName, String(id));
    }

    // Run custom validator
    if (config.validators?.beforeUpdate) {
      await config.validators.beforeUpdate(id, data, existing, this.userContext);
    }

    // Transform data to update values
    const values = config.transformers?.toUpdateValues
      ? config.transformers.toUpdateValues(data, this.userContext)
      : ({ ...data } as Partial<InferSelectModel<TTable>>);

    // Add updated_at if configured
    if (config.updatedAtColumnName) {
      (values as Record<string, unknown>)[config.updatedAtColumnName] = new Date();
    }

    const [row] = await db
      .update(config.table)
      .set(values as InferSelectModel<TTable>)
      .where(eq(config.table[config.primaryKeyName], id))
      .returning();

    if (!row) {
      throw new DatabaseError(`Failed to update ${config.displayName}`, 'write');
    }

    const entity = config.transformers?.toEntity
      ? config.transformers.toEntity(row as InferSelectModel<TTable>)
      : (row as unknown as TEntity);

    const duration = Date.now() - startTime;

    const changes = calculateChanges(
      existing as Record<string, unknown>,
      data as Record<string, unknown>
    );

    const template = logTemplates.crud.update(config.displayName, {
      resourceId: String(id),
      userId: this.userContext.user_id,
      changes,
      duration,
      metadata: {
        component: 'crud-service',
        resourceType: config.resourceName,
        fieldsChanged: Object.keys(changes).length,
      },
    });
    log.info(template.message, template.context);

    // Run after hook
    if (config.hooks?.afterUpdate) {
      await config.hooks.afterUpdate(entity, this.userContext);
    }

    return entity;
  }

  /**
   * Delete entity (soft delete by default)
   */
  async delete(id: string | number): Promise<void> {
    const startTime = Date.now();
    const { config } = this;

    if (config.permissions.delete) {
      this.requireAnyPermission(
        Array.isArray(config.permissions.delete)
          ? config.permissions.delete
          : [config.permissions.delete]
      );
    }

    // Verify entity exists (also validates parent access)
    const existing = await this.getById(id);
    if (!existing) {
      throw new NotFoundError(config.displayName, String(id));
    }

    // Run custom validator (e.g., check for child records)
    if (config.validators?.beforeDelete) {
      await config.validators.beforeDelete(id, existing, this.userContext);
    }

    if (config.deletedAtColumnName) {
      // Soft delete
      const values: Record<string, unknown> = {
        [config.deletedAtColumnName]: new Date(),
      };
      if (config.updatedAtColumnName) {
        values[config.updatedAtColumnName] = new Date();
      }

      await db
        .update(config.table)
        .set(values as InferSelectModel<TTable>)
        .where(eq(config.table[config.primaryKeyName], id));
    } else {
      // Hard delete
      await db
        .delete(config.table)
        .where(eq(config.table[config.primaryKeyName], id));
    }

    const duration = Date.now() - startTime;

    const template = logTemplates.crud.delete(config.displayName, {
      resourceId: String(id),
      userId: this.userContext.user_id,
      soft: !!config.deletedAtColumnName,
      duration,
      metadata: {
        component: 'crud-service',
        resourceType: config.resourceName,
      },
    });
    log.info(template.message, template.context);

    // Run after hook
    if (config.hooks?.afterDelete) {
      await config.hooks.afterDelete(id, this.userContext);
    }
  }

  /**
   * Build base WHERE conditions including soft delete and org scoping
   */
  protected buildBaseConditions(options: TQueryOptions): SQL[] {
    const { config } = this;
    const conditions: SQL[] = [];

    // Soft delete filter
    if (config.deletedAtColumnName) {
      conditions.push(isNull(config.table[config.deletedAtColumnName]));
    }

    // Organization scoping - use inArray (not raw SQL)
    if (config.organizationScoping?.autoFilter && !this.isSuperAdmin()) {
      const accessibleOrgIds = this.getAccessibleOrganizationIds();
      if (accessibleOrgIds.length > 0) {
        conditions.push(
          inArray(config.table[config.organizationScoping.columnName], accessibleOrgIds)
        );
      } else {
        // No accessible orgs = no results (fail-closed)
        conditions.push(eq(config.table[config.primaryKeyName], '__impossible__'));
      }
    }

    // Search filter (override in subclass for custom search)
    if (options.search) {
      const searchConditions = this.buildSearchConditions(options.search);
      if (searchConditions.length > 0) {
        conditions.push(or(...searchConditions)!);
      }
    }

    return conditions;
  }

  /**
   * Build search conditions - override in subclass for custom search fields
   */
  protected buildSearchConditions(_search: string): SQL[] {
    return []; // Subclasses implement custom search
  }

  /**
   * Validate access to parent resource (for list operations with parent filter)
   */
  protected async validateParentAccess(_options: TQueryOptions): Promise<void> {
    // Override in subclass if parent validation needed for list
  }

  /**
   * Validate parent access for an existing entity
   */
  protected async validateParentAccessForEntity(row: InferSelectModel<TTable>): Promise<void> {
    const { config } = this;
    if (!config.parentResource) return;

    const parentId = (row as Record<string, unknown>)[config.parentResource.foreignKeyColumnName];
    if (!parentId) return;

    // Fetch parent to check organization
    const [parent] = await db
      .select()
      .from(config.parentResource.table)
      .where(eq(config.parentResource.table[config.parentResource.parentPrimaryKeyName], parentId));

    if (!parent) {
      throw new NotFoundError('Parent resource', String(parentId));
    }

    // Check organization access on parent
    if (config.parentResource.parentOrgColumnName) {
      const parentOrgId = (parent as Record<string, unknown>)[config.parentResource.parentOrgColumnName];
      if (parentOrgId && !this.canAccessOrganization(String(parentOrgId))) {
        throw new ForbiddenError('Access denied to parent resource organization');
      }
    }
  }

  /**
   * Validate parent access for create operation
   */
  protected async validateParentAccessForCreate(data: TCreateData): Promise<void> {
    const { config } = this;
    if (!config.parentResource) return;

    const parentId = (data as Record<string, unknown>)[config.parentResource.foreignKeyColumnName];
    if (!parentId) return;

    // Fetch parent to check organization
    const [parent] = await db
      .select()
      .from(config.parentResource.table)
      .where(eq(config.parentResource.table[config.parentResource.parentPrimaryKeyName], parentId));

    if (!parent) {
      throw new NotFoundError('Parent resource', String(parentId));
    }

    // Check organization access on parent
    if (config.parentResource.parentOrgColumnName) {
      const parentOrgId = (parent as Record<string, unknown>)[config.parentResource.parentOrgColumnName];
      if (parentOrgId && !this.canAccessOrganization(String(parentOrgId))) {
        throw new ForbiddenError('Access denied to parent resource organization');
      }
    }

    // Check parent-specific permission if configured
    if (config.parentResource.parentPermission) {
      this.requirePermission(config.parentResource.parentPermission, String(parentId), String(parentOrgId));
    }
  }
}
```

#### 3. Example Refactored Service

**Before** (`rbac-templates-service.ts` - 320 lines):
```typescript
// Full service with all boilerplate...
export class RBACTemplatesService extends BaseRBACService {
  // ~320 lines of CRUD operations with manual logging, permission checks, etc.
}
```

**After** (`rbac-templates-service.ts` - ~100 lines):
```typescript
import { like, type SQL } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm/pg-core';
import { templates } from '@/lib/db';
import { ConflictError } from '@/lib/errors/domain-errors';
import type { UserContext } from '@/lib/types/rbac';
import { BaseCrudService, type CrudServiceConfig, type BaseQueryOptions } from './crud';

// Use Drizzle's InferSelectModel for type-safe entity
export type TemplateEntity = InferSelectModel<typeof templates>;

export interface CreateTemplateData {
  name: string;
  slug: string;
  description?: string;
  preview_image_url?: string;
  is_active?: boolean;
}

export interface UpdateTemplateData {
  name?: string;
  slug?: string;
  description?: string;
  preview_image_url?: string;
  is_active?: boolean;
}

export interface TemplateQueryOptions extends BaseQueryOptions {
  is_active?: boolean;
}

export class RBACTemplatesService extends BaseCrudService<
  typeof templates,
  TemplateEntity,
  CreateTemplateData,
  UpdateTemplateData,
  TemplateQueryOptions
> {
  protected config: CrudServiceConfig<
    typeof templates,
    TemplateEntity,
    CreateTemplateData,
    UpdateTemplateData,
    TemplateQueryOptions
  > = {
    table: templates,
    resourceName: 'templates',
    displayName: 'template',
    primaryKeyName: 'template_id',
    deletedAtColumnName: 'deleted_at',
    updatedAtColumnName: 'updated_at',
    permissions: {
      read: 'templates:read:organization',
      create: 'templates:manage:all',
      update: 'templates:manage:all',
      delete: 'templates:manage:all',
    },
    validators: {
      beforeCreate: async (data) => {
        const existing = await this.getBySlug(data.slug);
        if (existing) {
          throw new ConflictError('Template with this slug already exists');
        }
      },
      beforeUpdate: async (_id, data, existing) => {
        if (data.slug && data.slug !== existing.slug) {
          const slugExists = await this.getBySlug(data.slug);
          if (slugExists) {
            throw new ConflictError('Template with this slug already exists');
          }
        }
      },
    },
    transformers: {
      toCreateValues: (data) => ({
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        preview_image_url: data.preview_image_url || null,
        is_active: data.is_active !== undefined ? data.is_active : true,
      }),
    },
  };

  protected buildSearchConditions(search: string): SQL[] {
    return [
      like(templates.name, `%${search}%`),
      like(templates.description, `%${search}%`),
    ];
  }

  // Custom method specific to templates
  async getBySlug(slug: string): Promise<TemplateEntity | null> {
    const results = await this.getList({ search: slug, limit: 1 });
    return results.items.find((t) => t.slug === slug) || null;
  }
}

export function createRBACTemplatesService(userContext: UserContext): RBACTemplatesService {
  return new RBACTemplatesService(userContext);
}
```

#### 4. Example: Parent Resource Configuration (Work Item Statuses)

```typescript
import { work_item_statuses, work_item_types } from '@/lib/db/schema';
import { BaseCrudService, type CrudServiceConfig, type BaseQueryOptions } from './crud';

export interface StatusQueryOptions extends BaseQueryOptions {
  work_item_type_id?: string;
}

export class RBACWorkItemStatusesService extends BaseCrudService<...> {
  protected config: CrudServiceConfig<...> = {
    table: work_item_statuses,
    resourceName: 'work-item-statuses',
    displayName: 'work item status',
    primaryKeyName: 'work_item_status_id',
    // No soft delete for statuses
    deletedAtColumnName: undefined,
    updatedAtColumnName: 'updated_at',
    permissions: {
      read: 'work-items:read:organization',
      create: 'work-items:manage:organization',
      update: 'work-items:manage:organization',
      delete: 'work-items:manage:organization',
    },
    // Parent resource configuration for cascading access checks
    parentResource: {
      table: work_item_types,
      foreignKeyColumnName: 'work_item_type_id',
      parentPrimaryKeyName: 'work_item_type_id',
      parentOrgColumnName: 'organization_id',
    },
    validators: {
      beforeDelete: async (id, existing, ctx) => {
        // Check if any work items use this status
        const workItemCount = await this.countWorkItemsWithStatus(id);
        if (workItemCount > 0) {
          throw new ConflictError(
            `Cannot delete status with existing work items (${workItemCount} found)`
          );
        }
      },
    },
  };

  // Custom method for status-specific logic
  private async countWorkItemsWithStatus(statusId: string | number): Promise<number> {
    // Implementation...
  }
}
```

---

## Implementation Plan

### Phase 1: Infrastructure Setup (Foundation)

**Tasks:**
1. Create `lib/services/crud/` directory structure
2. Implement `types.ts` with generic type definitions (using `InferSelectModel`)
3. Implement `base-crud-service.ts` with core CRUD operations
4. Add comprehensive test coverage for base service
5. Document patterns in `STANDARDS.md`
6. **Validate Drizzle behaviors:**
   - Test `returning()` type inference
   - Test `inArray` with empty arrays (fail-closed behavior)
   - Test integer vs string primary keys
   - Test hard delete vs soft delete
7. **Establish logging standards:**
   - Verify `logTemplates.crud.*` templates exist for all operations
   - Document required logging pattern in code comments

**Files to Create:**
- `lib/services/crud/index.ts` - Public exports
- `lib/services/crud/types.ts` - Generic type definitions
- `lib/services/crud/base-crud-service.ts` - Abstract base class
- `lib/services/crud/__tests__/base-crud-service.test.ts` - Unit tests
- `lib/services/crud/__tests__/integration.test.ts` - Integration tests with real DB

**Validation Checklist (must pass before Phase 2):**
- [ ] `logTemplates` logging works correctly in all CRUD operations
- [ ] `returning()` provides proper type inference
- [ ] `inArray` organization scoping works with empty arrays (fail-closed)
- [ ] Parent resource validation correctly cascades permissions
- [ ] Integer and string primary keys both work
- [ ] Hard delete and soft delete both work

**Estimated Effort:** Medium

### Phase 2: Pilot Migration (Low-Risk Services)

**Target Services (2 services):**
1. `rbac-categories-service.ts` (133 lines) - Simplest, no soft delete, hard delete, integer PK
2. `rbac-templates-service.ts` (320 lines) - Standard CRUD with soft delete, string PK

**Why these two:**
- `rbac-categories-service.ts` tests: hard delete, integer primary key, simple permissions
- `rbac-templates-service.ts` tests: soft delete, string primary key, slug uniqueness validation

**NOT migrating in Phase 2:**
- `rbac-favorites-service.ts` - Requires join queries, non-standard operations (add/remove)

**Approach:**
- Refactor one service at a time
- Maintain backward compatibility (same exports, same method signatures)
- Run existing tests to verify behavior unchanged
- Add new tests for generic functionality
- Compare logging output before/after (should use `logTemplates` after)

**Estimated Effort:** Low per service

### Phase 3: Work Item Services Migration

**Target Services:**
1. `rbac-work-item-statuses-service.ts` (385 lines)
2. `rbac-work-item-fields-service.ts` (338 lines)
3. `rbac-work-item-comments-service.ts` (361 lines)
4. `rbac-work-item-watchers-service.ts` (~200 lines)
5. `rbac-work-item-status-transitions-service.ts` (~250 lines)
6. `rbac-work-item-type-relationships-service.ts` (~300 lines)

**Special Considerations:**
- Type-scoped operations (status belongs to type)
- Cascade permission checking (type -> status)
- Custom validators for deletion (check for usage)

**Estimated Effort:** Medium

### Phase 4: Analytics Services Migration

**Target Services:**
1. `rbac-data-sources-service.ts` (620 lines)
2. `rbac-data-source-columns-service.ts` (~350 lines)
3. `rbac-chart-definitions-service.ts` (~400 lines)
4. `rbac-charts-service.ts` (567 lines)

**Special Considerations:**
- Connection testing delegation
- Introspection operations
- Cache invalidation hooks
- Complex joins for metadata

**Estimated Effort:** Medium-High

### Phase 5: Complex Services (Kept Custom)

**Services NOT migrated (5 services, ~2,400 lines):**
1. `rbac-users-service.ts` (821 lines) - Multi-table transactions, security record init
2. `rbac-practices-service.ts` (682 lines) - Initialization transactions, image handling
3. `rbac-roles-service.ts` (627 lines) - Permission aggregation, complex grouping
4. `rbac-favorites-service.ts` (167 lines) - Join queries, non-standard operations
5. `rbac-practice-utils.ts` (100 lines) - Utilities, not a CRUD service

**Why keep custom:**
- Transaction support needed (users, practices)
- Multi-table join queries (favorites, roles)
- Complex permission logic beyond simple RBAC
- Specialized methods that don't fit CRUD pattern (reorder, aggregate)

**Future consideration:**
- These services can still benefit from shared utilities (logging helpers, error handling)
- May extract common patterns into helper functions without full abstraction
- `rbac-staff-members-service.ts` could be hybrid (CRUD base + custom reorder method)

**Estimated Effort:** None (kept as-is)

### Phase 6: Cleanup & Documentation

**Tasks:**
1. Remove any dead code
2. Update CLAUDE.md with new patterns
3. Create migration guide for new services
4. Performance benchmarking
5. Final code review

---

## Risk Analysis

### Low Risk
- Generic infrastructure is additive (doesn't break existing code)
- Phased migration allows rollback per service
- Existing tests catch regressions

### Medium Risk
- Performance regression in complex queries (mitigated by benchmarking)
- Type complexity with generics (mitigated by good documentation)

### High Risk Items (Require Extra Caution)
- `rbac-users-service.ts` - Security-critical, complex logic
- `rbac-roles-service.ts` - Permission system foundation
- Cache invalidation - Must maintain existing behavior

---

## Success Metrics

| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| Total RBAC service lines | ~8,000 | ~4,500 (-44%) | Excludes 5 custom services |
| Services fully migrated | 0 | 14-16 | Out of 24 total |
| Services kept custom | 0 | 5 | users, practices, roles, favorites, utils |
| Lines per migrated service (avg) | ~330 | ~100 | Config + custom methods only |
| Time to add new CRUD service | 2-4 hours | 30-60 min | Using base service |
| Bug fix locations for CRUD | 24 files | 1 file (base) | Core CRUD logic centralized |
| Test coverage | Varies | 90%+ for base | Base service is critical path |

### Phase 1 Validation Criteria

Before proceeding past Phase 1, confirm:
- [ ] `logTemplates` logging works correctly in all CRUD operations
- [ ] `returning()` provides proper type inference
- [ ] `inArray` organization scoping works with empty arrays (fail-closed)
- [ ] Parent resource validation correctly cascades permissions
- [ ] Integer and string primary keys both work
- [ ] Hard delete and soft delete both work

---

## Alternative Approaches Considered

### 1. Code Generation
**Pros:** Zero runtime overhead, full customization
**Cons:** Build complexity, harder to maintain, type drift risk
**Decision:** Not chosen - generic base class provides similar benefits with less complexity

### 2. Higher-Order Functions
**Pros:** Functional composition, no class hierarchy
**Cons:** Less familiar pattern, harder debugging, awkward with RBAC context
**Decision:** Not chosen - class-based approach better fits existing codebase

### 3. Full Service Rewrite
**Pros:** Clean slate, optimal design
**Cons:** High risk, long timeline, potential for regressions
**Decision:** Not chosen - incremental refactoring is safer

---

## Dependencies & Prerequisites

1. **TypeScript 5.9** - Required for generic type inference
2. **Drizzle ORM 0.44** - Table type exports
3. **Existing BaseRBACService** - Foundation for generic service
4. **Logger Templates** - Standardized logging patterns

---

## Open Questions

1. **Transaction Support**: Should base service support transactions or delegate to specialized methods?
   - **Decision**: Delegate to specialized methods. Services needing transactions stay custom.
   - Complex services (users, practices) kept custom for this reason.

2. **Cache Integration**: Should cache invalidation be part of base service?
   - **Decision**: Use `hooks.afterCreate/Update/Delete` for cache operations.
   - Services define cache invalidation in hooks, base service calls them.

3. **API Response Format**: Should base service return standardized API responses or raw entities?
   - **Decision**: Return raw entities. API layer transforms using existing patterns.
   - Maintains separation of concerns.

4. **Nested Resources**: How to handle parent-child relationships (e.g., work_item_type -> status)?
   - **Decision**: Added `parentResource` config for cascading permission checks.
   - See example in "Parent Resource Configuration" section.

---

## Next Steps

1. Review and approve this plan
2. Create Phase 1 infrastructure (base service + tests)
3. Pilot with `rbac-categories-service.ts`
4. Iterate based on learnings
5. Continue phased migration

---

## Appendix: File Impact Summary

| Phase | Files Modified | Files Created | Lines Removed | Lines Added | Net Change |
|-------|---------------|---------------|---------------|-------------|------------|
| 1 | 0 | 5 | 0 | ~600 | +600 (infrastructure) |
| 2 | 2 | 0 | ~450 | ~200 | -250 |
| 3 | 6 | 0 | ~1,800 | ~600 | -1,200 |
| 4 | 4 | 0 | ~1,600 | ~500 | -1,100 |
| 5 | 0 | 0 | 0 | 0 | 0 (kept custom) |
| 6 | 2 | 1 | ~100 | ~200 | +100 (docs) |
| **Total** | **14** | **6** | **~3,950** | **~2,100** | **~-1,850** |

### Services by Migration Status

**Phase 2 - Pilot (2 services):**
- `rbac-categories-service.ts` - Simplest, no soft delete, read-heavy
- `rbac-templates-service.ts` - Standard CRUD with soft delete

**Phase 3 - Work Items (6 services):**
- `rbac-work-item-statuses-service.ts`
- `rbac-work-item-fields-service.ts`
- `rbac-work-item-watchers-service.ts`
- `rbac-work-item-status-transitions-service.ts`
- `rbac-work-item-type-relationships-service.ts`
- `rbac-work-item-activity-service.ts`

**Phase 4 - Analytics (4 services):**
- `rbac-data-sources-service.ts`
- `rbac-data-source-columns-service.ts`
- `rbac-chart-definitions-service.ts`
- `rbac-charts-service.ts`

**Kept Custom (5 services):**
- `rbac-users-service.ts` - Multi-table transactions, security
- `rbac-practices-service.ts` - Initialization, image handling
- `rbac-roles-service.ts` - Permission aggregation
- `rbac-favorites-service.ts` - Join queries, non-standard ops
- `rbac-practice-utils.ts` - Utilities, not CRUD

**Remaining (migrated in later phases or kept hybrid):**
- `rbac-staff-members-service.ts` - Reordering logic (may need hybrid)
- `rbac-work-item-types-service.ts` - Complex validation
- `rbac-work-item-comments-service.ts` - Nesting, auto-watcher
- `rbac-work-item-attachments-service.ts` - S3 integration
- `rbac-work-item-field-values-service.ts` - Field type handling
- `rbac-practice-attributes-service.ts` - JSON parsing
- `rbac-practices-images-service.ts` - S3 integration

**Net Reduction: ~1,850 lines (23%) + standardized patterns**

*Note: The real value is in standardization and reduced bug surface area, not just line count reduction.*
