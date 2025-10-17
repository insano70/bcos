/**
 * RBAC Data Source Columns Service
 *
 * Handles CRUD operations for data source column definitions.
 * Manages chart_data_source_columns table with RBAC enforcement.
 *
 * Extracted from rbac-data-sources-service.ts to follow Single Responsibility Principle.
 */

import { and, eq } from 'drizzle-orm';
import { QUERY_LIMITS } from '@/lib/constants/query-limits';
import { db } from '@/lib/db';
import { chart_data_source_columns } from '@/lib/db/chart-config-schema';
import { calculateChanges, log, logTemplates } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type {
  CreateDataSourceColumnData,
  DataSourceColumnQueryOptions,
  DataSourceColumnWithMetadata,
  UpdateDataSourceColumnData,
} from '@/lib/types/data-sources';
import type { UserContext } from '@/lib/types/rbac';

/**
 * RBAC Data Source Columns Service
 *
 * Provides CRUD operations for data source column definitions.
 * Enforces RBAC permissions for all operations.
 */
export class RBACDataSourceColumnsService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  /**
   * Get all columns for a specific data source
   */
  async getDataSourceColumns(
    query: DataSourceColumnQueryOptions
  ): Promise<DataSourceColumnWithMetadata[]> {
    const startTime = Date.now();
    log.info('Data source columns query initiated', {
      userId: this.userContext.user_id,
      dataSourceId: query.data_source_id,
      isActive: query.is_active,
      limit: query.limit,
      offset: query.offset,
    });

    try {
      // Check permissions before proceeding
      this.requireAnyPermission(['data-sources:read:organization', 'data-sources:read:all']);

      // Ensure database context is available
      if (!this.dbContext) {
        throw new Error('Database context not available');
      }

      // Build the where conditions
      const whereConditions = [eq(chart_data_source_columns.data_source_id, query.data_source_id)];

      if (query.is_active !== undefined) {
        whereConditions.push(eq(chart_data_source_columns.is_active, query.is_active));
      }

      const columns = await this.dbContext
        .select()
        .from(chart_data_source_columns)
        .where(and(...whereConditions))
        .orderBy(chart_data_source_columns.sort_order, chart_data_source_columns.column_name)
        .limit(query.limit || QUERY_LIMITS.DATA_SOURCE_COLUMNS_DEFAULT)
        .offset(query.offset || 0);

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.list('data_source_columns', {
        userId: this.userContext.user_id,
        ...(this.userContext.current_organization_id && { organizationId: this.userContext.current_organization_id }),
        filters: {
          data_source_id: query.data_source_id,
          is_active: query.is_active,
        },
        results: {
          returned: columns.length,
          total: columns.length,
          page: Math.floor((query.offset || 0) / (query.limit || QUERY_LIMITS.DATA_SOURCE_COLUMNS_DEFAULT)) + 1,
        },
        duration,
      });

      log.info(template.message, template.context);

      return columns;
    } catch (error) {
      log.error('Data source columns query failed', error, {
        userId: this.userContext.user_id,
        dataSourceId: query.data_source_id,
        component: 'data-sources',
      });

      throw error;
    }
  }

  /**
   * Get single column by ID
   */
  async getDataSourceColumnById(columnId: number): Promise<DataSourceColumnWithMetadata | null> {
    const startTime = Date.now();

    try {
      // Check permissions before proceeding
      this.requireAnyPermission(['data-sources:read:organization', 'data-sources:read:all']);

      // Ensure database context is available
      if (!this.dbContext) {
        throw new Error('Database context not available');
      }

      const [column] = await this.dbContext
        .select()
        .from(chart_data_source_columns)
        .where(eq(chart_data_source_columns.column_id, columnId))
        .limit(1);

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.read('data_source_column', {
        resourceId: String(columnId),
        ...(column?.column_name && { resourceName: column.column_name }),
        found: !!column,
        userId: this.userContext.user_id,
        duration,
      });

      log.info(template.message, template.context);

      return column || null;
    } catch (error) {
      log.error('Data source column get failed', error, {
        userId: this.userContext.user_id,
        columnId,
        component: 'data-sources',
      });

      throw error;
    }
  }

  /**
   * Create a new data source column
   */
  async createDataSourceColumn(
    data: CreateDataSourceColumnData
  ): Promise<DataSourceColumnWithMetadata> {
    const startTime = Date.now();

    try {
      // Check permissions before proceeding
      this.requireAnyPermission(['data-sources:create:organization', 'data-sources:create:all']);

      // Ensure database context is available
      if (!this.dbContext) {
        throw new Error('Database context not available');
      }

      // Execute column creation as atomic transaction to ensure data consistency.
      // Transaction guarantees: duplicate check + insert are atomic, auto-rollback on any failure.
      // This prevents race conditions where two concurrent requests could create duplicate columns.
      const newColumn = await this.dbContext.transaction(async (tx) => {
        try {
          // Check if column already exists for this data source (within transaction to prevent race conditions)
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
            log.error('Column creation failed - no result from insert', {
              dataSourceId: data.data_source_id,
              columnName: data.column_name,
              userId: this.userContext.user_id,
            });
            throw new Error('Failed to create column - no data returned');
          }

          return result[0];
        } catch (txError) {
          // Transaction will auto-rollback, but log context for debugging
          log.error('Transaction error during column creation', txError, {
            dataSourceId: data.data_source_id,
            columnName: data.column_name,
            userId: this.userContext.user_id,
            component: 'data-sources',
          });
          throw txError;
        }
      });

      // TypeScript guard - transaction should always return a value or throw
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

      return newColumn;
    } catch (error) {
      log.error('Data source column creation failed', error, {
        userId: this.userContext.user_id,
        dataSourceId: data.data_source_id,
        columnName: data.column_name,
        component: 'data-sources',
      });

      throw error;
    }
  }

  /**
   * Update a data source column
   */
  async updateDataSourceColumn(
    columnId: number,
    data: UpdateDataSourceColumnData
  ): Promise<DataSourceColumnWithMetadata | null> {
    const startTime = Date.now();

    try {
      // Check permissions before proceeding
      this.requireAnyPermission(['data-sources:update:organization', 'data-sources:update:all']);

      // Ensure database context is available
      if (!this.dbContext) {
        throw new Error('Database context not available');
      }

      // Get existing column for change tracking
      const existing = await this.getDataSourceColumnById(columnId);
      if (!existing) {
        return null;
      }

      const [updatedColumn] = await this.dbContext
        .update(chart_data_source_columns)
        .set({
          display_name: data.display_name,
          column_description: data.column_description,
          is_filterable: data.is_filterable,
          is_groupable: data.is_groupable,
          is_measure: data.is_measure,
          is_dimension: data.is_dimension,
          is_date_field: data.is_date_field,
          is_measure_type: data.is_measure_type,
          is_time_period: data.is_time_period,
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
          updated_at: new Date(),
        })
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

      return updatedColumn || null;
    } catch (error) {
      log.error('Data source column update failed', error, {
        userId: this.userContext.user_id,
        columnId,
        component: 'data-sources',
      });

      throw error;
    }
  }

  /**
   * Delete a data source column
   */
  async deleteDataSourceColumn(columnId: number): Promise<boolean> {
    const startTime = Date.now();

    try {
      // Check permissions before proceeding
      this.requireAnyPermission(['data-sources:delete:organization', 'data-sources:delete:all']);

      // Ensure database context is available
      if (!this.dbContext) {
        throw new Error('Database context not available');
      }

      // Get column info before deletion
      const existingColumn = await this.getDataSourceColumnById(columnId);
      if (!existingColumn) {
        return false;
      }

      // Execute column deletion as atomic transaction
      const deleted = await this.dbContext.transaction(async (tx) => {
        // First check if the column exists
        const existing = await tx
          .select({ column_id: chart_data_source_columns.column_id })
          .from(chart_data_source_columns)
          .where(eq(chart_data_source_columns.column_id, columnId))
          .limit(1);

        if (existing.length === 0) {
          return false; // Column doesn't exist
        }

        // Hard delete the column
        await tx
          .delete(chart_data_source_columns)
          .where(eq(chart_data_source_columns.column_id, columnId));

        return true; // Deletion successful
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
    } catch (error) {
      log.error('Data source column deletion failed', error, {
        userId: this.userContext.user_id,
        columnId,
        component: 'data-sources',
      });

      throw error;
    }
  }
}

// Export factory function
export function createRBACDataSourceColumnsService(
  userContext: UserContext
): RBACDataSourceColumnsService {
  return new RBACDataSourceColumnsService(userContext);
}
