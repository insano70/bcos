/**
 * RBAC Data Source Columns Service
 *
 * Handles CRUD operations for data source column definitions.
 * Manages chart_data_source_columns table with RBAC enforcement.
 *
 * Migrated to BaseCrudService infrastructure.
 */

import { and, eq, type SQL } from 'drizzle-orm';
import { QUERY_LIMITS } from '@/lib/constants/query-limits';
import { db } from '@/lib/db';
import { chart_data_source_columns } from '@/lib/db/chart-config-schema';
import { calculateChanges, log, logTemplates } from '@/lib/logger';
import {
  BaseCrudService,
  type BaseQueryOptions,
  type CrudServiceConfig,
} from '@/lib/services/crud';
import type {
  CreateDataSourceColumnData,
  DataSourceColumnQueryOptions,
  DataSourceColumnWithMetadata,
  UpdateDataSourceColumnData,
} from '@/lib/types/data-sources';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Query options extending base with data source filtering
 */
export interface ColumnQueryOptions extends BaseQueryOptions {
  data_source_id: number;
  is_active?: boolean | undefined;
}

/**
 * RBAC Data Source Columns Service
 *
 * Provides CRUD operations for data source column definitions.
 * Enforces RBAC permissions for all operations.
 *
 * Migrated to BaseCrudService with:
 * - Parent-child filtering via buildCustomConditions
 * - Custom create with transaction for duplicate checking
 * - Custom delete with transaction
 */
export class RBACDataSourceColumnsService extends BaseCrudService<
  typeof chart_data_source_columns,
  DataSourceColumnWithMetadata,
  CreateDataSourceColumnData,
  UpdateDataSourceColumnData,
  ColumnQueryOptions
> {
  protected readonly config: CrudServiceConfig<
    typeof chart_data_source_columns,
    DataSourceColumnWithMetadata,
    CreateDataSourceColumnData,
    UpdateDataSourceColumnData,
    ColumnQueryOptions
  > = {
    table: chart_data_source_columns,
    resourceName: 'data-source-columns',
    displayName: 'data source column',
    primaryKeyName: 'column_id',
    updatedAtColumnName: 'updated_at',
    // No soft delete - uses hard delete
    permissions: {
      read: 'data-sources:read:organization',
      create: 'data-sources:create:organization',
      update: 'data-sources:update:organization',
      delete: 'data-sources:delete:organization',
    },
    transformers: {
      toEntity: (row: Record<string, unknown>): DataSourceColumnWithMetadata => ({
        column_id: row.column_id as number,
        data_source_id: row.data_source_id as number,
        column_name: row.column_name as string,
        display_name: row.display_name as string,
        column_description: row.column_description as string | null,
        data_type: row.data_type as string,
        is_filterable: row.is_filterable as boolean | null,
        is_groupable: row.is_groupable as boolean | null,
        is_measure: row.is_measure as boolean | null,
        is_dimension: row.is_dimension as boolean | null,
        is_date_field: row.is_date_field as boolean | null,
        is_measure_type: row.is_measure_type as boolean | null,
        is_time_period: row.is_time_period as boolean | null,
        is_expansion_dimension: row.is_expansion_dimension as boolean | null,
        expansion_display_name: row.expansion_display_name as string | null,
        format_type: row.format_type as string | null,
        sort_order: row.sort_order as number | null,
        default_aggregation: row.default_aggregation as string | null,
        display_icon: row.display_icon as boolean | null,
        icon_type: row.icon_type as string | null,
        icon_color_mode: row.icon_color_mode as string | null,
        icon_color: row.icon_color as string | null,
        icon_mapping: row.icon_mapping,
        is_sensitive: row.is_sensitive as boolean | null,
        access_level: row.access_level as string | null,
        allowed_values: row.allowed_values,
        validation_rules: row.validation_rules,
        example_value: row.example_value as string | null,
        is_active: row.is_active as boolean | null,
        created_at: row.created_at as Date | null,
        updated_at: row.updated_at as Date | null,
      }),
      toCreateValues: (data: CreateDataSourceColumnData) => ({
        data_source_id: data.data_source_id,
        column_name: data.column_name,
        display_name: data.display_name,
        column_description: data.column_description,
        data_type: data.data_type,
        is_filterable: data.is_filterable,
        is_groupable: data.is_groupable,
        is_measure: data.is_measure,
        is_dimension: data.is_dimension,
        is_date_field: data.is_date_field,
        is_measure_type: data.is_measure_type,
        is_time_period: data.is_time_period,
        is_expansion_dimension: data.is_expansion_dimension,
        expansion_display_name: data.expansion_display_name,
        format_type: data.format_type,
        sort_order: data.sort_order,
        default_aggregation: data.default_aggregation,
        display_icon: data.display_icon,
        icon_type: data.icon_type,
        icon_color_mode: data.icon_color_mode,
        icon_color: data.icon_color,
        icon_mapping: data.icon_mapping,
        is_sensitive: data.is_sensitive,
        access_level: data.access_level,
        allowed_values: data.allowed_values,
        validation_rules: data.validation_rules,
        example_value: data.example_value,
        is_active: data.is_active,
      }),
      // Note: updated_at is handled automatically by BaseCrudService via updatedAtColumnName config
      toUpdateValues: (data: UpdateDataSourceColumnData) => ({
        display_name: data.display_name,
        column_description: data.column_description,
        is_filterable: data.is_filterable,
        is_groupable: data.is_groupable,
        is_measure: data.is_measure,
        is_dimension: data.is_dimension,
        is_date_field: data.is_date_field,
        is_measure_type: data.is_measure_type,
        is_time_period: data.is_time_period,
        is_expansion_dimension: data.is_expansion_dimension,
        expansion_display_name: data.expansion_display_name,
        format_type: data.format_type,
        sort_order: data.sort_order,
        default_aggregation: data.default_aggregation,
        display_icon: data.display_icon,
        icon_type: data.icon_type,
        icon_color_mode: data.icon_color_mode,
        icon_color: data.icon_color,
        icon_mapping: data.icon_mapping,
        is_sensitive: data.is_sensitive,
        access_level: data.access_level,
        allowed_values: data.allowed_values,
        validation_rules: data.validation_rules,
        example_value: data.example_value,
        is_active: data.is_active,
      }),
    },
  };

  /**
   * Build custom conditions for data source filtering
   */
  protected buildCustomConditions(options: ColumnQueryOptions): SQL[] {
    const conditions: SQL[] = [];

    // Always filter by data_source_id (required)
    conditions.push(eq(chart_data_source_columns.data_source_id, options.data_source_id));

    // Optional is_active filter
    if (options.is_active !== undefined) {
      conditions.push(eq(chart_data_source_columns.is_active, options.is_active));
    }

    return conditions;
  }

  /**
   * Get all columns for a specific data source
   * Note: Logging is handled by BaseCrudService.getList()
   */
  async getDataSourceColumns(
    query: DataSourceColumnQueryOptions
  ): Promise<DataSourceColumnWithMetadata[]> {
    // Check permissions - use requireAnyPermission for flexible permission checking
    this.requireAnyPermission(['data-sources:read:organization', 'data-sources:read:all']);

    const result = await this.getList({
      data_source_id: query.data_source_id,
      is_active: query.is_active,
      limit: query.limit || QUERY_LIMITS.DATA_SOURCE_COLUMNS_DEFAULT,
      offset: query.offset || 0,
    });

    return result.items;
  }

  /**
   * Get single column by ID
   * Note: Logging is handled by BaseCrudService.getById()
   */
  async getDataSourceColumnById(columnId: number): Promise<DataSourceColumnWithMetadata | null> {
    // Check permissions
    this.requireAnyPermission(['data-sources:read:organization', 'data-sources:read:all']);

    // Use base class getById - it handles logging and entity transformation
    return this.getById(columnId);
  }

  /**
   * Create a new data source column
   *
   * Uses transaction for atomic duplicate check + insert
   */
  async createDataSourceColumn(
    data: CreateDataSourceColumnData
  ): Promise<DataSourceColumnWithMetadata> {
    const startTime = Date.now();

    // Check permissions
    this.requireAnyPermission(['data-sources:create:organization', 'data-sources:create:all']);

    // Execute column creation as atomic transaction to ensure data consistency.
    // Transaction guarantees: duplicate check + insert are atomic, auto-rollback on any failure.
    const newColumn = await db.transaction(async (tx) => {
      // Check if column already exists for this data source
      const existingColumn = await tx
        .select()
        .from(chart_data_source_columns)
        .where(
          and(
            eq(chart_data_source_columns.data_source_id, data.data_source_id),
            eq(chart_data_source_columns.column_name, data.column_name)
          )
        )
        .limit(1);

      if (existingColumn.length > 0) {
        log.warn('Column creation blocked - duplicate detected', {
          dataSourceId: data.data_source_id,
          columnName: data.column_name,
          userId: this.userContext.user_id,
        });
        throw new Error(`Column '${data.column_name}' already exists for this data source`);
      }

      const result = await tx
        .insert(chart_data_source_columns)
        .values({
          data_source_id: data.data_source_id,
          column_name: data.column_name,
          display_name: data.display_name,
          column_description: data.column_description,
          data_type: data.data_type,
          is_filterable: data.is_filterable,
          is_groupable: data.is_groupable,
          is_measure: data.is_measure,
          is_dimension: data.is_dimension,
          is_date_field: data.is_date_field,
          is_measure_type: data.is_measure_type,
          is_time_period: data.is_time_period,
          is_expansion_dimension: data.is_expansion_dimension,
          expansion_display_name: data.expansion_display_name,
          format_type: data.format_type,
          sort_order: data.sort_order,
          default_aggregation: data.default_aggregation,
          display_icon: data.display_icon,
          icon_type: data.icon_type,
          icon_color_mode: data.icon_color_mode,
          icon_color: data.icon_color,
          icon_mapping: data.icon_mapping,
          is_sensitive: data.is_sensitive,
          access_level: data.access_level,
          allowed_values: data.allowed_values,
          validation_rules: data.validation_rules,
          example_value: data.example_value,
          is_active: data.is_active,
        })
        .returning();

      if (!result || result.length === 0) {
        throw new Error('Failed to create column - no data returned');
      }

      return result[0];
    });

    if (!newColumn) {
      throw new Error('Column creation returned undefined result');
    }

    const duration = Date.now() - startTime;

    const template = logTemplates.crud.create('data_source_column', {
      resourceId: String(newColumn.column_id),
      resourceName: newColumn.column_name,
      userId: this.userContext.user_id,
      duration,
      metadata: {
        dataSourceId: data.data_source_id,
        dataType: newColumn.data_type,
        isActive: newColumn.is_active,
      },
    });

    log.info(template.message, template.context);

    return this.config.transformers?.toEntity?.(newColumn as Record<string, unknown>) ?? (newColumn as unknown as DataSourceColumnWithMetadata);
  }

  /**
   * Update a data source column
   */
  async updateDataSourceColumn(
    columnId: number,
    data: UpdateDataSourceColumnData
  ): Promise<DataSourceColumnWithMetadata | null> {
    const startTime = Date.now();

    // Check permissions
    this.requireAnyPermission(['data-sources:update:organization', 'data-sources:update:all']);

    // Get existing column for change tracking
    const existing = await this.getDataSourceColumnById(columnId);
    if (!existing) {
      return null;
    }

    const updateData = this.config.transformers?.toUpdateValues?.(data, this.userContext) ?? data;

    const [updatedColumn] = await db
      .update(chart_data_source_columns)
      .set(updateData)
      .where(eq(chart_data_source_columns.column_id, columnId))
      .returning();

    const duration = Date.now() - startTime;

    // Calculate changes for audit trail
    const changes = calculateChanges(existing, data);

    const template = logTemplates.crud.update('data_source_column', {
      resourceId: String(columnId),
      ...(updatedColumn?.column_name && { resourceName: updatedColumn.column_name }),
      userId: this.userContext.user_id,
      changes,
      duration,
      metadata: {
        fieldsChanged: Object.keys(changes).length,
      },
    });

    log.info(template.message, template.context);

    if (!updatedColumn) {
      return null;
    }

    return this.config.transformers?.toEntity?.(updatedColumn as Record<string, unknown>) ?? (updatedColumn as unknown as DataSourceColumnWithMetadata);
  }

  /**
   * Delete a data source column (hard delete)
   *
   * Uses transaction for atomic check + delete
   */
  async deleteDataSourceColumn(columnId: number): Promise<boolean> {
    const startTime = Date.now();

    // Check permissions
    this.requireAnyPermission(['data-sources:delete:organization', 'data-sources:delete:all']);

    // Get column info before deletion
    const existingColumn = await this.getDataSourceColumnById(columnId);
    if (!existingColumn) {
      return false;
    }

    // Execute column deletion as atomic transaction
    const deleted = await db.transaction(async (tx) => {
      // First check if the column exists
      const existing = await tx
        .select({ column_id: chart_data_source_columns.column_id })
        .from(chart_data_source_columns)
        .where(eq(chart_data_source_columns.column_id, columnId))
        .limit(1);

      if (existing.length === 0) {
        return false;
      }

      // Hard delete the column
      await tx
        .delete(chart_data_source_columns)
        .where(eq(chart_data_source_columns.column_id, columnId));

      return true;
    });

    const duration = Date.now() - startTime;

    const template = logTemplates.crud.delete('data_source_column', {
      resourceId: String(columnId),
      resourceName: existingColumn.column_name,
      userId: this.userContext.user_id,
      soft: false,
      duration,
    });

    log.info(template.message, template.context);

    return deleted;
  }
}

// Export factory function
export function createRBACDataSourceColumnsService(
  userContext: UserContext
): RBACDataSourceColumnsService {
  return new RBACDataSourceColumnsService(userContext);
}
