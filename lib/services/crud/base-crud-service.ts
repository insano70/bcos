/**
 * Base CRUD Service
 *
 * Generic CRUD service with automatic RBAC, logging, and soft delete support.
 * Extend this class to create resource-specific services with minimal boilerplate.
 *
 * IMPORTANT: All logging uses logTemplates for consistency.
 * See lib/logger/message-templates.ts for available templates.
 *
 * @example
 * ```typescript
 * export class RBACTemplatesService extends BaseCrudService<
 *   typeof templates,
 *   TemplateEntity,
 *   CreateTemplateData,
 *   UpdateTemplateData,
 *   TemplateQueryOptions
 * > {
 *   protected config: CrudServiceConfig<...> = { ... };
 *
 *   protected buildSearchConditions(search: string): SQL[] {
 *     return [like(templates.name, `%${search}%`)];
 *   }
 * }
 * ```
 */

import { and, asc, count, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { PgTable, TableConfig } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import { DatabaseError, ForbiddenError, NotFoundError } from '@/lib/errors/domain-errors';
import { calculateChanges, log, logTemplates } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { validatePagination } from '@/lib/utils/validators';

import type { BaseQueryOptions, CrudServiceConfig, JoinQueryConfig, ListResponse } from './types';

// =============================================================================
// Pagination Defaults
// =============================================================================

/**
 * Default pagination limits for CRUD services.
 * These can be overridden per-service via CrudServiceConfig.pagination.
 */
const CRUD_PAGINATION_DEFAULTS = {
  /** Maximum allowed limit to prevent DoS via huge page requests */
  MAX_LIMIT: 500,
  /** Default limit when not specified in query options */
  DEFAULT_LIMIT: 100,
} as const;

// Type alias for Drizzle table to simplify casting
type AnyPgTable = PgTable<TableConfig>;

// Type alias for dynamic Drizzle values (insert/update operations)
// Generic CRUD services operate on dynamic tables where specific column types aren't known at compile time.
type DrizzleValues = Record<string, unknown>;

/**
 * Interface for Drizzle's chainable query builder.
 * Drizzle types each join statically, but we build queries dynamically based on config.
 * This interface captures the methods we need without using 'any'.
 */
interface ChainableQuery {
  innerJoin(joinTable: AnyPgTable, on: SQL): ChainableQuery;
  leftJoin(joinTable: AnyPgTable, on: SQL): ChainableQuery;
  where(condition: SQL | undefined): ChainableQuery;
  orderBy(column: SQL): ChainableQuery;
  limit(n: number): ChainableQuery;
  offset(n: number): ChainableQuery;
  then<T>(onfulfilled?: (value: Record<string, unknown>[]) => T | PromiseLike<T>): Promise<T>;
}

/**
 * Abstract base class for CRUD services with RBAC support.
 *
 * @template TTable - Drizzle table type
 * @template TEntity - Entity type returned by read operations
 * @template TCreateData - Data type for create operations
 * @template TUpdateData - Data type for update operations
 * @template TQueryOptions - Query options type extending BaseQueryOptions
 */
export abstract class BaseCrudService<
  TTable extends PgTable,
  TEntity,
  TCreateData,
  TUpdateData,
  TQueryOptions extends BaseQueryOptions = BaseQueryOptions,
> extends BaseRBACService {
  /**
   * Configuration for this CRUD service.
   * Must be defined by subclasses.
   */
  protected abstract config: CrudServiceConfig<
    TTable,
    TEntity,
    TCreateData,
    TUpdateData,
    TQueryOptions
  >;

  /** Flag to ensure config is only validated once */
  private _configValidated = false;

  /**
   * Validate configuration on first use.
   * Called lazily since abstract config is set by subclasses after construction.
   */
  protected validateConfig(): void {
    if (this._configValidated) return;

    const { config } = this;
    const errors: string[] = [];

    if (!config.table) {
      errors.push('table is required');
    }
    if (!config.resourceName) {
      errors.push('resourceName is required');
    }
    if (!config.displayName) {
      errors.push('displayName is required');
    }
    if (!config.primaryKeyName) {
      errors.push('primaryKeyName is required');
    }
    if (!config.permissions?.read) {
      errors.push('permissions.read is required');
    }

    if (errors.length > 0) {
      throw new Error(
        `Invalid CrudServiceConfig for ${config.resourceName || 'unknown'}: ${errors.join(', ')}`
      );
    }

    this._configValidated = true;
  }

  // ===========================================================================
  // Public CRUD Operations
  // ===========================================================================

  /**
   * Get paginated list of entities.
   *
   * @param options - Query options (filters, pagination, sorting)
   * @returns Paginated list of entities
   */
  async getList(options: TQueryOptions = {} as TQueryOptions): Promise<ListResponse<TEntity>> {
    this.validateConfig();
    const startTime = Date.now();
    const { config } = this;

    // Check permission
    this.requireAnyPermission(
      Array.isArray(config.permissions.read) ? config.permissions.read : [config.permissions.read]
    );

    // Validate parent access if configured
    await this.validateParentAccess(options);

    // Build WHERE conditions
    const conditions = this.buildBaseConditions(options);
    const table = config.table as AnyPgTable;

    // Get total count (always from main table, no JOINs needed)
    const [countResult] = await db
      .select({ count: count() })
      .from(table)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = Number(countResult?.count || 0);

    // Validate and clamp pagination to prevent DoS via huge page requests
    const { limit, offset } = validatePagination(
      options.limit,
      options.offset,
      config.pagination?.maxLimit ?? CRUD_PAGINATION_DEFAULTS.MAX_LIMIT,
      config.pagination?.defaultLimit ?? CRUD_PAGINATION_DEFAULTS.DEFAULT_LIMIT
    );

    // Check if subclass defines JOINs for enriched queries
    const joinConfig = this.buildJoinQuery();
    let rows: Record<string, unknown>[];

    // Build ORDER BY clause
    const orderBy = this.buildOrderBy(options);

    if (joinConfig) {
      // Use JOIN query with custom select fields
      rows = await this.executeJoinQuery(joinConfig, conditions, limit, offset, orderBy);
    } else {
      // Standard query (backwards compatible)
      const query = db
        .select()
        .from(table)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      // Apply ordering if specified
      const orderedQuery = orderBy ? query.orderBy(orderBy) : query;

      rows = await orderedQuery.limit(limit).offset(offset);
    }

    // Transform rows to entities
    const toEntityFn = config.transformers?.toEntity;
    const items = toEntityFn
      ? rows.map((row) => toEntityFn(row as Record<string, unknown>))
      : (rows as unknown as TEntity[]);

    const duration = Date.now() - startTime;

    // Log using standardized template
    const template = logTemplates.crud.list(config.displayName, {
      userId: this.userContext.user_id,
      ...this.getOrgIdForLogging(),
      filters: options as Record<string, unknown>,
      results: {
        returned: items.length,
        total,
        page: Math.floor(offset / limit) + 1,
      },
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
   * Get single entity by ID.
   *
   * @param id - Entity ID (string or number)
   * @returns Entity or null if not found
   */
  async getById(id: string | number): Promise<TEntity | null> {
    this.validateConfig();
    const startTime = Date.now();
    const { config } = this;

    // Check permission
    this.requireAnyPermission(
      Array.isArray(config.permissions.read) ? config.permissions.read : [config.permissions.read]
    );

    // Build conditions
    const conditions: SQL[] = [this.getPrimaryKeyCondition(id)];
    if (config.deletedAtColumnName) {
      conditions.push(this.getSoftDeleteCondition());
    }

    // Check if subclass defines JOINs for enriched queries
    const joinConfig = this.buildJoinQuery();
    let row: Record<string, unknown> | undefined;

    if (joinConfig) {
      // Use JOIN query with custom select fields
      const rows = await this.executeJoinQuery(joinConfig, conditions, 1, 0);
      row = rows[0];
    } else {
      // Standard query (backwards compatible)
      const table = config.table as AnyPgTable;
      const [result] = await db
        .select()
        .from(table)
        .where(and(...conditions));
      row = result as Record<string, unknown> | undefined;
    }

    if (!row) {
      const duration = Date.now() - startTime;
      const template = logTemplates.crud.read(config.displayName, {
        resourceId: String(id),
        found: false,
        userId: this.userContext.user_id,
        ...this.getOrgIdForLogging(),
        duration,
      });
      log.info(template.message, template.context);
      return null;
    }

    // Validate parent access if configured
    if (config.parentResource) {
      await this.validateParentAccessForEntity(row);
    }

    const entity = config.transformers?.toEntity
      ? config.transformers.toEntity(row)
      : (row as unknown as TEntity);

    const duration = Date.now() - startTime;

    const template = logTemplates.crud.read(config.displayName, {
      resourceId: String(id),
      found: true,
      userId: this.userContext.user_id,
      ...this.getOrgIdForLogging(),
      duration,
    });
    log.info(template.message, template.context);

    return entity;
  }

  /**
   * Get count of entities matching options.
   *
   * @param options - Query options (filters only, pagination ignored)
   * @returns Count of matching entities
   */
  async getCount(options: TQueryOptions = {} as TQueryOptions): Promise<number> {
    this.validateConfig();
    const { config } = this;

    // Check permission
    this.requireAnyPermission(
      Array.isArray(config.permissions.read) ? config.permissions.read : [config.permissions.read]
    );

    const conditions = this.buildBaseConditions(options);
    const table = config.table as AnyPgTable;

    const [countResult] = await db
      .select({ count: count() })
      .from(table)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return Number(countResult?.count || 0);
  }

  /**
   * Create new entity.
   *
   * @param data - Data for creating the entity
   * @returns Created entity
   * @throws DatabaseError if creation fails
   */
  async create(data: TCreateData): Promise<TEntity> {
    this.validateConfig();
    const startTime = Date.now();
    const { config } = this;

    // Check permission
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
      : (data as Record<string, unknown>);

    // Insert and return all columns
    // Type safety note: Generic CRUD service operates on dynamic tables. The values Record
    // has been constructed from TCreateData via transformer, matching the table schema.
    // Using unknown cast to bridge generic table typing while maintaining runtime correctness.
    const table = config.table as AnyPgTable;
    const insertResult = await db
      .insert(table)
      .values(values as unknown as DrizzleValues)
      .returning();
    const row = (insertResult as unknown as Record<string, unknown>[])[0];

    if (!row) {
      throw new DatabaseError(`Failed to create ${config.displayName}`, 'write');
    }

    const entity = config.transformers?.toEntity
      ? config.transformers.toEntity(row as Record<string, unknown>)
      : (row as unknown as TEntity);

    const duration = Date.now() - startTime;

    const template = logTemplates.crud.create(config.displayName, {
      resourceId: String((row as Record<string, unknown>)[config.primaryKeyName]),
      userId: this.userContext.user_id,
      ...this.getOrgIdForLogging(),
      duration,
      metadata: {
        component: 'crud-service',
        resourceType: config.resourceName,
      },
    });
    log.info(template.message, template.context);

    // Run after hook (fire-and-forget, errors logged but don't fail operation)
    if (config.hooks?.afterCreate) {
      config.hooks.afterCreate(entity, this.userContext).catch((error) => {
        log.error('afterCreate hook failed', error, {
          resourceType: config.resourceName,
          resourceId: (row as Record<string, unknown>)[config.primaryKeyName],
        });
      });
    }

    return entity;
  }

  /**
   * Update existing entity.
   *
   * @param id - Entity ID
   * @param data - Data for updating the entity
   * @returns Updated entity
   * @throws NotFoundError if entity doesn't exist
   * @throws DatabaseError if update fails
   */
  async update(id: string | number, data: TUpdateData): Promise<TEntity> {
    this.validateConfig();
    const startTime = Date.now();
    const { config } = this;

    // Check permission
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
      : ({ ...data } as Record<string, unknown>);

    // Add updated_at if configured
    if (config.updatedAtColumnName) {
      values[config.updatedAtColumnName] = new Date();
    }

    // Type safety note: Generic CRUD service operates on dynamic tables. The values Record
    // has been constructed from TUpdateData via transformer, matching the table schema.
    // Using unknown cast to bridge generic table typing while maintaining runtime correctness.
    const table = config.table as AnyPgTable;
    const updateResult = await db
      .update(table)
      .set(values as unknown as DrizzleValues)
      .where(this.getPrimaryKeyCondition(id))
      .returning();
    const row = (updateResult as unknown as Record<string, unknown>[])[0];

    if (!row) {
      throw new DatabaseError(`Failed to update ${config.displayName}`, 'write');
    }

    const entity = config.transformers?.toEntity
      ? config.transformers.toEntity(row as Record<string, unknown>)
      : (row as unknown as TEntity);

    const duration = Date.now() - startTime;

    // Calculate changes for audit trail
    const changes = calculateChanges(
      existing as Record<string, unknown>,
      data as Record<string, unknown>
    );

    const template = logTemplates.crud.update(config.displayName, {
      resourceId: String(id),
      userId: this.userContext.user_id,
      ...this.getOrgIdForLogging(),
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
      config.hooks.afterUpdate(entity, this.userContext).catch((error) => {
        log.error('afterUpdate hook failed', error, {
          resourceType: config.resourceName,
          resourceId: id,
        });
      });
    }

    return entity;
  }

  /**
   * Delete entity (soft delete if configured, hard delete otherwise).
   *
   * @param id - Entity ID
   * @throws NotFoundError if entity doesn't exist
   */
  async delete(id: string | number): Promise<void> {
    this.validateConfig();
    const startTime = Date.now();
    const { config } = this;

    // Check permission
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

    const table = config.table as AnyPgTable;

    if (config.deletedAtColumnName) {
      // Soft delete - set deleted_at timestamp
      const softDeleteValues: Record<string, unknown> = {
        [config.deletedAtColumnName]: new Date(),
      };
      if (config.updatedAtColumnName) {
        softDeleteValues[config.updatedAtColumnName] = new Date();
      }

      // Type safety note: Soft delete values are a known subset (deleted_at, updated_at).
      // Using unknown cast to bridge generic table typing while maintaining runtime correctness.
      await db
        .update(table)
        .set(softDeleteValues as unknown as DrizzleValues)
        .where(this.getPrimaryKeyCondition(id));
    } else {
      // Hard delete
      await db.delete(table).where(this.getPrimaryKeyCondition(id));
    }

    const duration = Date.now() - startTime;

    const template = logTemplates.crud.delete(config.displayName, {
      resourceId: String(id),
      userId: this.userContext.user_id,
      ...this.getOrgIdForLogging(),
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
      config.hooks.afterDelete(id, this.userContext).catch((error) => {
        log.error('afterDelete hook failed', error, {
          resourceType: config.resourceName,
          resourceId: id,
        });
      });
    }
  }

  // ===========================================================================
  // Protected Methods - Can be overridden by subclasses
  // ===========================================================================

  /**
   * Check permission for a CRUD operation using config.
   * Helper method to reduce boilerplate in custom implementations.
   *
   * @param operation - The CRUD operation ('create', 'update', or 'delete')
   * @throws ForbiddenError if permission check fails
   *
   * @example
   * ```typescript
   * // In custom create method:
   * this.checkConfigPermission('create');
   * ```
   */
  protected checkConfigPermission(operation: 'create' | 'update' | 'delete'): void {
    const permission = this.config.permissions[operation];
    if (permission) {
      this.requireAnyPermission(Array.isArray(permission) ? permission : [permission]);
    }
  }

  /**
   * Build base WHERE conditions including soft delete and org scoping.
   * Override in subclass to add custom filter conditions.
   */
  protected buildBaseConditions(options: TQueryOptions): SQL[] {
    const { config } = this;
    const conditions: SQL[] = [];

    // Soft delete filter
    if (config.deletedAtColumnName) {
      conditions.push(this.getSoftDeleteCondition());
    }

    // Organization scoping - use inArray (not raw SQL)
    if (config.organizationScoping?.autoFilter && !this.isSuperAdmin()) {
      const accessibleOrgIds = this.getAccessibleOrganizationIds();
      if (accessibleOrgIds.length > 0) {
        const tableColumns = config.table as unknown as Record<string, unknown>;
        const orgColumn = tableColumns[config.organizationScoping.columnName] as Parameters<
          typeof inArray
        >[0];
        conditions.push(inArray(orgColumn, accessibleOrgIds));
      } else {
        // No accessible orgs = no results (fail-closed security)
        // Use SQL FALSE to ensure no results are returned
        conditions.push(sql`FALSE`);
      }
    }

    // Search filter (override in subclass for custom search)
    if (options.search) {
      const searchConditions = this.buildSearchConditions(options.search);
      if (searchConditions.length > 0) {
        const orCondition = or(...searchConditions);
        if (orCondition) {
          conditions.push(orCondition);
        }
      }
    }

    // Add custom conditions from subclass
    const customConditions = this.buildCustomConditions(options);
    conditions.push(...customConditions);

    return conditions;
  }

  /**
   * Build search conditions for text-based filtering.
   * Override in subclass to define searchable fields.
   *
   * @param _search - Search term
   * @returns Array of SQL conditions (will be OR'd together)
   */
  protected buildSearchConditions(_search: string): SQL[] {
    return []; // Subclasses implement custom search
  }

  /**
   * Build custom filter conditions based on query options.
   * Override in subclass to add resource-specific filters.
   *
   * @param _options - Query options
   * @returns Array of SQL conditions
   */
  protected buildCustomConditions(_options: TQueryOptions): SQL[] {
    return []; // Subclasses implement custom filters
  }

  /**
   * Build ORDER BY clause from query options.
   * Override in subclass for custom sorting logic.
   *
   * @param options - Query options with sortField and sortOrder
   * @returns SQL ordering clause or undefined
   */
  protected buildOrderBy(options: TQueryOptions): SQL | undefined {
    const { sortField, sortOrder } = options;

    if (!sortField) {
      return undefined;
    }

    const { config } = this;
    const tableColumns = config.table as unknown as Record<string, unknown>;
    const column = tableColumns[sortField];

    if (!column) {
      // Invalid sort field - log warning and skip sorting
      log.warn('Invalid sort field requested', {
        sortField,
        resourceType: config.resourceName,
        userId: this.userContext.user_id,
      });
      return undefined;
    }

    // Build order expression
    const columnRef = column as Parameters<typeof asc>[0];
    return sortOrder === 'desc' ? desc(columnRef) : asc(columnRef);
  }

  /**
   * Validate access to parent resource (for list operations with parent filter).
   * Override in subclass if parent validation needed for list.
   */
  protected async validateParentAccess(_options: TQueryOptions): Promise<void> {
    // Override in subclass if parent validation needed for list
  }

  /**
   * Build JOIN query configuration for enriched entities.
   * Override in subclass to define JOINs and custom select fields.
   *
   * Returns null by default (backwards compatible - uses standard query).
   * When overridden, returns JoinQueryConfig with:
   * - selectFields: Record of column aliases to columns/SQL
   * - joins: Array of JoinDefinition with table, on condition, and type
   *
   * For self-joins, use Drizzle's alias() to create a table alias:
   *
   * @example
   * ```typescript
   * import { alias } from 'drizzle-orm/pg-core';
   * import { getTableColumns } from 'drizzle-orm';
   *
   * // Create alias for self-join (defined at class level)
   * const parentType = alias(work_item_types, 'parent_type');
   *
   * protected buildJoinQuery(): JoinQueryConfig {
   *   return {
   *     selectFields: {
   *       ...getTableColumns(work_item_types),
   *       created_by_name: users.full_name,
   *       parent_name: parentType.name,  // Use aliased column
   *     },
   *     joins: [
   *       { table: users, on: eq(work_item_types.created_by, users.user_id), type: 'left' },
   *       { table: parentType, on: eq(work_item_types.parent_type_id, parentType.work_item_type_id), type: 'left' },
   *     ],
   *   };
   * }
   * ```
   */
  protected buildJoinQuery(): JoinQueryConfig | null {
    return null; // Subclasses implement JOINs when needed
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Get organization ID for logging - only includes if defined.
   * This handles exactOptionalPropertyTypes by conditionally spreading.
   */
  private getOrgIdForLogging(): { organizationId: string } | Record<string, never> {
    const orgId = this.userContext.current_organization_id;
    return orgId ? { organizationId: orgId } : {};
  }

  /**
   * Get SQL condition for primary key equality.
   */
  private getPrimaryKeyCondition(id: string | number): SQL {
    const { config } = this;
    const tableColumns = config.table as unknown as Record<string, unknown>;
    const pkColumn = tableColumns[config.primaryKeyName] as Parameters<typeof eq>[0];
    return eq(pkColumn, id);
  }

  /**
   * Get SQL condition for soft delete filtering.
   * Note: Only called when deletedAtColumnName is defined (checked before call).
   */
  private getSoftDeleteCondition(): SQL {
    const { config } = this;
    const deletedAtColumnName = config.deletedAtColumnName;
    if (!deletedAtColumnName) {
      throw new Error('getSoftDeleteCondition called without deletedAtColumnName configured');
    }
    const tableColumns = config.table as unknown as Record<string, unknown>;
    const deletedAtColumn = tableColumns[deletedAtColumnName] as Parameters<typeof isNull>[0];
    return isNull(deletedAtColumn);
  }

  /**
   * Validate parent access for an existing entity.
   */
  private async validateParentAccessForEntity(row: Record<string, unknown>): Promise<void> {
    const { config } = this;
    if (!config.parentResource) return;

    const parentId = row[config.parentResource.foreignKeyColumnName];
    if (!parentId) return;

    // Fetch parent to check organization
    const parentTable = config.parentResource.table as AnyPgTable;
    const parentTableColumns = parentTable as unknown as Record<string, unknown>;
    const parentPkColumn = parentTableColumns[
      config.parentResource.parentPrimaryKeyName
    ] as Parameters<typeof eq>[0];

    const [parent] = await db.select().from(parentTable).where(eq(parentPkColumn, parentId));

    if (!parent) {
      throw new NotFoundError('Parent resource', String(parentId));
    }

    // Check organization access on parent
    if (config.parentResource.parentOrgColumnName) {
      const parentOrgId = (parent as Record<string, unknown>)[
        config.parentResource.parentOrgColumnName
      ];
      if (parentOrgId && !this.canAccessOrganization(String(parentOrgId))) {
        throw new ForbiddenError('Access denied to parent resource organization');
      }
    }
  }

  /**
   * Validate parent access for create operation.
   */
  private async validateParentAccessForCreate(data: TCreateData): Promise<void> {
    const { config } = this;
    if (!config.parentResource) return;

    const parentId = (data as Record<string, unknown>)[config.parentResource.foreignKeyColumnName];
    if (!parentId) return;

    // Fetch parent to check organization
    const parentTable = config.parentResource.table as AnyPgTable;
    const parentTableColumns = parentTable as unknown as Record<string, unknown>;
    const parentPkColumn = parentTableColumns[
      config.parentResource.parentPrimaryKeyName
    ] as Parameters<typeof eq>[0];

    const [parent] = await db.select().from(parentTable).where(eq(parentPkColumn, parentId));

    if (!parent) {
      throw new NotFoundError('Parent resource', String(parentId));
    }

    // Check organization access on parent
    if (config.parentResource.parentOrgColumnName) {
      const parentOrgId = (parent as Record<string, unknown>)[
        config.parentResource.parentOrgColumnName
      ];
      if (parentOrgId && !this.canAccessOrganization(String(parentOrgId))) {
        throw new ForbiddenError('Access denied to parent resource organization');
      }

      // Check parent-specific permission if configured
      if (config.parentResource.parentPermission) {
        this.requirePermission(
          config.parentResource.parentPermission,
          String(parentId),
          String(parentOrgId)
        );
      }
    }
  }

  /**
   * Execute a JOIN query with the provided configuration.
   * Used by getList() and getById() when buildJoinQuery() returns a config.
   *
   * @param joinConfig - JOIN configuration with select fields and join definitions
   * @param conditions - WHERE conditions to apply
   * @param limit - Maximum number of rows to return
   * @param offset - Number of rows to skip
   * @param orderBy - Optional ORDER BY clause
   * @returns Array of result rows
   */
  private async executeJoinQuery(
    joinConfig: JoinQueryConfig,
    conditions: SQL[],
    limit: number,
    offset: number,
    orderBy?: SQL
  ): Promise<Record<string, unknown>[]> {
    const { config } = this;
    const table = config.table as AnyPgTable;

    // Start building the query with select and from
    let query = db.select(joinConfig.selectFields).from(table) as unknown as ChainableQuery;

    // Apply joins in order
    for (const join of joinConfig.joins) {
      if (join.type === 'inner') {
        query = query.innerJoin(join.table, join.on);
      } else {
        // Default to LEFT JOIN
        query = query.leftJoin(join.table, join.on);
      }
    }

    // Apply WHERE conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply ordering if specified
    if (orderBy) {
      query = query.orderBy(orderBy);
    }

    // Apply pagination
    query = query.limit(limit).offset(offset);

    // Execute and return results
    const results = await (query as unknown as Promise<Record<string, unknown>[]>);
    return results;
  }
}
