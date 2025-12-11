/**
 * Generic CRUD Service Types
 *
 * Type definitions for the configuration-driven CRUD service infrastructure.
 * Designed to work with Drizzle ORM and the existing RBAC system.
 *
 * @example
 * ```typescript
 * import type { CrudServiceConfig, BaseQueryOptions } from '@/lib/services/crud';
 * import type { InferSelectModel } from 'drizzle-orm';
 * import { templates } from '@/lib/db';
 *
 * type TemplateEntity = InferSelectModel<typeof templates>;
 *
 * const config: CrudServiceConfig<typeof templates, TemplateEntity, CreateData, UpdateData> = {
 *   table: templates,
 *   resourceName: 'templates',
 *   // ...
 * };
 * ```
 */

import type { SQL } from 'drizzle-orm';
import type { PgTable, PgColumn, TableConfig } from 'drizzle-orm/pg-core';
import type { PermissionName, UserContext } from '@/lib/types/rbac';

// =============================================================================
// Drizzle Type Helpers
// =============================================================================

/**
 * Type for tables that can be used in JOINs, including aliased tables.
 * Drizzle's alias() function returns a type that is structurally compatible with PgTable.
 * Using TableConfig generic allows for both regular and aliased tables.
 */
export type JoinableTable = PgTable<TableConfig>;

/**
 * Type for selectable fields in JOIN queries.
 * Can be individual columns, SQL expressions, or entire tables for nested selection.
 */
export type SelectableField = PgColumn | SQL | PgTable<TableConfig>;

// =============================================================================
// JOIN Support Types
// =============================================================================

/**
 * Definition for a single JOIN in a query.
 * Supports both regular JOINs and self-JOINs with aliases.
 *
 * For self-joins, use Drizzle's alias() function to create an aliased table:
 * ```typescript
 * import { alias } from 'drizzle-orm/pg-core';
 * const parentType = alias(work_item_types, 'parent_type');
 *
 * // Then use the aliased table in the join definition
 * { table: parentType, on: eq(work_item_types.parent_type_id, parentType.work_item_type_id) }
 * ```
 */
export interface JoinDefinition {
  /** The table to join. For self-joins, pass an aliased table created with alias() */
  table: JoinableTable;
  /** The join condition (e.g., eq(mainTable.user_id, users.user_id)) */
  on: SQL;
  /** Join type - defaults to 'left' */
  type?: 'left' | 'inner';
}

/**
 * Configuration returned by buildJoinQuery() method.
 * Defines how to build an enriched query with JOINs.
 */
export interface JoinQueryConfig {
  /**
   * Fields to select. Can be:
   * - Individual columns: `{ name: table.name, email: users.email }`
   * - Entire tables: `{ chart_definitions: chart_definitions, users: users }`
   *   (returns nested objects like `{ chart_definitions: {...}, users: {...} }`)
   */
  selectFields: Record<string, SelectableField>;
  /** JOIN definitions to apply */
  joins: JoinDefinition[];
}

/**
 * Options for controlling JOIN behavior in queries.
 */
export interface JoinQueryOptions {
  /** Whether to use JOINs for this query (default: true if JOINs are defined) */
  useJoins?: boolean;
}

/**
 * Base query options for list operations.
 * Extend this interface for resource-specific filters.
 *
 * Note: All properties use `| undefined` to support `exactOptionalPropertyTypes`
 * when callers construct objects with potentially undefined values.
 */
export interface BaseQueryOptions {
  /** Maximum number of results to return */
  limit?: number | undefined;
  /** Number of results to skip (for pagination) */
  offset?: number | undefined;
  /** Search term for text-based filtering */
  search?: string | undefined;
  /** Field to sort by */
  sortField?: string | undefined;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc' | undefined;
}

/**
 * Standard list response with pagination metadata
 */
export interface ListResponse<T> {
  /** Array of items for current page */
  items: T[];
  /** Total count of items matching filters */
  total: number;
  /** Current page number (1-indexed) */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Whether more results exist beyond this page */
  hasMore: boolean;
}

/**
 * Field change tracking for update operations
 */
export interface FieldChange {
  from: unknown;
  to: unknown;
}

/**
 * Configuration for a CRUD service.
 *
 * This configuration object defines how the base CRUD service should
 * handle operations for a specific resource type.
 *
 * @template TTable - Drizzle table type
 * @template TEntity - Entity type returned by read operations
 * @template TCreateData - Data type for create operations
 * @template TUpdateData - Data type for update operations
 * @template TQueryOptions - Query options type extending BaseQueryOptions
 */
export interface CrudServiceConfig<
  TTable extends PgTable,
  TEntity,
  TCreateData,
  TUpdateData,
  // biome-ignore lint/correctness/noUnusedVariables: Required for type alignment with BaseCrudService
  TQueryOptions extends BaseQueryOptions = BaseQueryOptions,
> {
  /** The drizzle table schema */
  table: TTable;

  /**
   * Resource name for permissions (e.g., 'work-items', 'templates')
   * Used in permission strings like 'templates:read:organization'
   */
  resourceName: string;

  /**
   * Display name for logging (e.g., 'template', 'work item')
   * Used in log messages and error messages
   */
  displayName: string;

  /**
   * Primary key column name (string, not column reference)
   * Must match a column name on the table
   */
  primaryKeyName: string;

  /**
   * Deleted at column name (for soft deletes)
   * Set to undefined for tables that use hard delete
   */
  deletedAtColumnName?: string;

  /**
   * Updated at column name
   * Automatically set on update operations if configured
   */
  updatedAtColumnName?: string;

  /**
   * Permission configuration for CRUD operations.
   * Each permission can be a single string or array (any match).
   */
  permissions: {
    /** Permission(s) required to read/list resources */
    read: PermissionName | PermissionName[];
    /** Permission(s) required to create resources (optional) */
    create?: PermissionName | PermissionName[];
    /** Permission(s) required to update resources (optional) */
    update?: PermissionName | PermissionName[];
    /** Permission(s) required to delete resources (optional) */
    delete?: PermissionName | PermissionName[];
  };

  /**
   * Organization scoping configuration.
   * When configured, automatically filters results by accessible organizations.
   */
  organizationScoping?: {
    /** Column name that contains organization_id */
    columnName: string;
    /** Whether to apply org filtering automatically on list/read */
    autoFilter: boolean;
  };

  /**
   * Parent resource configuration for cascading permission checks.
   * Used when this resource belongs to a parent (e.g., status -> work_item_type).
   *
   * When configured, the service will:
   * 1. Fetch the parent resource
   * 2. Check organization access based on parent's organization
   * 3. Optionally check a specific permission for parent access
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

  /**
   * Custom validators run before CRUD operations.
   * Use for business logic validation (uniqueness checks, etc.).
   * Throw an error to prevent the operation.
   */
  validators?: {
    /** Runs before create, after permission check */
    beforeCreate?: (data: TCreateData, ctx: UserContext) => Promise<void>;
    /** Runs before update, after permission check and existence check */
    beforeUpdate?: (
      id: string | number,
      data: TUpdateData,
      existing: TEntity,
      ctx: UserContext
    ) => Promise<void>;
    /** Runs before delete, after permission check and existence check */
    beforeDelete?: (id: string | number, existing: TEntity, ctx: UserContext) => Promise<void>;
  };

  /**
   * Lifecycle hooks run after successful operations.
   * Use for cache invalidation, notifications, etc.
   * Errors in hooks are logged but don't fail the operation.
   */
  hooks?: {
    /** Runs after successful create */
    afterCreate?: (entity: TEntity, ctx: UserContext) => Promise<void>;
    /** Runs after successful update */
    afterUpdate?: (entity: TEntity, ctx: UserContext) => Promise<void>;
    /** Runs after successful delete */
    afterDelete?: (id: string | number, ctx: UserContext) => Promise<void>;
  };

  /**
   * Custom transformers for data conversion.
   * Use when database rows don't directly map to entities.
   */
  transformers?: {
    /** Transform database row to entity (for custom field mapping) */
    toEntity?: (row: Record<string, unknown>) => TEntity;
    /** Transform create data to insert values */
    toCreateValues?: (data: TCreateData, ctx: UserContext) => Record<string, unknown>;
    /** Transform update data to update values */
    toUpdateValues?: (data: TUpdateData, ctx: UserContext) => Record<string, unknown>;
  };
}

/**
 * Interface for services that implement the base CRUD operations.
 * Useful for dependency injection and testing.
 */
export interface CrudServiceInterface<
  TEntity,
  TCreateData,
  TUpdateData,
  TQueryOptions extends BaseQueryOptions = BaseQueryOptions,
> {
  /** Get paginated list of entities */
  getList(options?: TQueryOptions): Promise<ListResponse<TEntity>>;
  /** Get single entity by ID */
  getById(id: string | number): Promise<TEntity | null>;
  /** Get count of entities matching options */
  getCount(options?: TQueryOptions): Promise<number>;
  /** Create new entity */
  create(data: TCreateData): Promise<TEntity>;
  /** Update existing entity */
  update(id: string | number, data: TUpdateData): Promise<TEntity>;
  /** Delete entity (soft or hard delete based on config) */
  delete(id: string | number): Promise<void>;
}

/**
 * Type helper to extract entity type from a CRUD service config
 */
export type EntityFromConfig<T> = T extends CrudServiceConfig<
  PgTable,
  infer TEntity,
  unknown,
  unknown
>
  ? TEntity
  : never;

/**
 * Type for building custom WHERE conditions in subclasses
 */
export type WhereCondition = SQL<unknown>;
