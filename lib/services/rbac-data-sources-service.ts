/**
 * RBAC Data Sources Service
 *
 * Handles CRUD operations for chart data sources configuration.
 * Manages chart_data_sources table with RBAC enforcement.
 *
 * REFACTORED: Removed column CRUD, introspection, and connection testing.
 * Those responsibilities are now in separate services:
 * - rbac-data-source-columns-service.ts (Column CRUD)
 * - data-sources/introspection-service.ts (Schema introspection)
 * - data-sources/connection-tester.ts (Connection testing)
 *
 * This service now follows Single Responsibility Principle and STANDARDS.md guidelines.
 */

import { and, count, desc, eq, like, or } from 'drizzle-orm';
import { chartDataCache } from '@/lib/cache/chart-data-cache';
import { QUERY_LIMITS } from '@/lib/constants/query-limits';
import { db } from '@/lib/db';
import { chart_data_source_columns, chart_data_sources } from '@/lib/db/chart-config-schema';
import { calculateChanges, log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { connectionTester } from '@/lib/services/data-sources/connection-tester';
import { introspectionService } from '@/lib/services/data-sources/introspection-service';
import { createRBACDataSourceColumnsService } from '@/lib/services/rbac-data-source-columns-service';
import type {
  ConnectionTestResult,
  CreateDataSourceData,
  DataSourceColumnWithMetadata,
  DataSourceQueryOptions,
  DataSourceWithMetadata,
  UpdateDataSourceData,
} from '@/lib/types/data-sources';
import type { UserContext } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/types/rbac';
import type { TableColumnsQueryInput } from '@/lib/validations/data-sources';

/**
 * RBAC Data Sources Service
 *
 * Provides CRUD operations for data source configurations.
 * Enforces RBAC permissions for all operations.
 */
export class RBACDataSourcesService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  /**
   * Get data sources with automatic permission-based filtering
   *
   * Improvements:
   * - Uses logTemplates for consistent logging
   * - Separate timing for count vs list queries
   * - RBAC scope visibility in logs
   * - Helper method to enrich with column count
   */
  async getDataSources(
    options: DataSourceQueryOptions = { limit: QUERY_LIMITS.DATA_SOURCES_DEFAULT, offset: 0 }
  ): Promise<DataSourceWithMetadata[]> {
    const startTime = Date.now();

    this.requirePermission('data-sources:read:organization');

    const accessScope = this.getAccessScope('analytics', 'read');

    // Build all where conditions upfront
    const whereConditions = [eq(chart_data_sources.is_active, true)];

    // Apply scope-based filtering
    switch (accessScope.scope) {
      case 'organization': {
        // For data sources, organization scoping means created by users in accessible orgs
        const accessibleOrgIds = accessScope.organizationIds || [];
        if (accessibleOrgIds.length === 0) {
          return [];
        }
        break;
      }

      case 'all':
        // No additional filtering for super admin
        break;

      default:
        // No 'own' scope for data sources - they're org-wide resources
        return [];
    }

    // Apply additional filters
    if (options.is_active !== undefined) {
      whereConditions[0] = eq(chart_data_sources.is_active, options.is_active);
    }

    if (options.database_type) {
      whereConditions.push(eq(chart_data_sources.database_type, options.database_type));
    }

    if (options.schema_name) {
      whereConditions.push(eq(chart_data_sources.schema_name, options.schema_name));
    }

    if (options.search) {
      const searchCondition = or(
        like(chart_data_sources.data_source_name, `%${options.search}%`),
        like(chart_data_sources.data_source_description, `%${options.search}%`),
        like(chart_data_sources.table_name, `%${options.search}%`)
      );
      if (searchCondition) {
        whereConditions.push(searchCondition);
      }
    }

    try {
      // Count query timing (separate from list query)
      const countStart = Date.now();
      const [countResult] = await db
        .select({ count: count() })
        .from(chart_data_sources)
        .where(and(...whereConditions));
      const countDuration = Date.now() - countStart;

      // List query timing with LEFT JOIN for column counts (single query instead of N+1)
      // Performance optimization: Use LEFT JOIN with GROUP BY to get column counts in a single query.
      // This eliminates the N+1 query problem where we would make 1 query for data sources
      // and then N additional queries (one per data source) to get column counts.
      // The LEFT JOIN ensures data sources with zero columns still appear in results (count = 0).
      const queryStart = Date.now();
      const results = await db
        .select({
          data_source_id: chart_data_sources.data_source_id,
          data_source_name: chart_data_sources.data_source_name,
          data_source_description: chart_data_sources.data_source_description,
          table_name: chart_data_sources.table_name,
          schema_name: chart_data_sources.schema_name,
          database_type: chart_data_sources.database_type,
          connection_config: chart_data_sources.connection_config,
          is_active: chart_data_sources.is_active,
          requires_auth: chart_data_sources.requires_auth,
          created_at: chart_data_sources.created_at,
          updated_at: chart_data_sources.updated_at,
          created_by: chart_data_sources.created_by,
          column_count: count(chart_data_source_columns.column_id),
        })
        .from(chart_data_sources)
        .leftJoin(
          chart_data_source_columns,
          and(
            eq(chart_data_source_columns.data_source_id, chart_data_sources.data_source_id),
            eq(chart_data_source_columns.is_active, true) // Only count active columns
          )
        )
        .where(and(...whereConditions))
        .groupBy(chart_data_sources.data_source_id)
        .orderBy(desc(chart_data_sources.updated_at))
        .limit(options.limit || QUERY_LIMITS.DATA_SOURCES_DEFAULT)
        .offset(options.offset || 0);
      const queryDuration = Date.now() - queryStart;

      // No need for enrichment - column_count already included via JOIN
      const enrichedResults = results;

      const duration = Date.now() - startTime;

      // Use logTemplates for consistent logging
      const template = logTemplates.crud.list('data_sources', {
        userId: this.userContext.user_id,
        ...(this.userContext.current_organization_id && { organizationId: this.userContext.current_organization_id }),
        filters: options as Record<string, unknown>,
        results: {
          returned: enrichedResults.length,
          total: countResult?.count || 0,
          page: Math.floor((options.offset || 0) / (options.limit || QUERY_LIMITS.DATA_SOURCES_DEFAULT)) + 1,
        },
        duration,
        metadata: {
          countDuration,
          queryDuration,
          slowCount: countDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowQuery: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: accessScope.scope,
        },
      });

      log.info(template.message, template.context);

      return enrichedResults;
    } catch (error) {
      log.error('Data sources list query failed', error, {
        userId: this.userContext.user_id,
        filters: options,
        component: 'data-sources',
      });
      throw error;
    }
  }

  /**
   * Get a single data source by ID
   */
  async getDataSourceById(dataSourceId: number): Promise<DataSourceWithMetadata | null> {
    const startTime = Date.now();

    this.requirePermission('data-sources:read:organization');

    try {
      const [result] = await db
        .select({
          data_source_id: chart_data_sources.data_source_id,
          data_source_name: chart_data_sources.data_source_name,
          data_source_description: chart_data_sources.data_source_description,
          table_name: chart_data_sources.table_name,
          schema_name: chart_data_sources.schema_name,
          database_type: chart_data_sources.database_type,
          connection_config: chart_data_sources.connection_config,
          is_active: chart_data_sources.is_active,
          requires_auth: chart_data_sources.requires_auth,
          created_at: chart_data_sources.created_at,
          updated_at: chart_data_sources.updated_at,
          created_by: chart_data_sources.created_by,
        })
        .from(chart_data_sources)
        .where(eq(chart_data_sources.data_source_id, dataSourceId));

      if (!result) {
        const duration = Date.now() - startTime;
        const template = logTemplates.crud.read('data_source', {
          resourceId: String(dataSourceId),
          found: false,
          userId: this.userContext.user_id,
          duration,
        });
        log.info(template.message, template.context);
        return null;
      }

      // Enrich with column count
      const enriched = await this.enrichWithColumnCount(result);

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.read('data_source', {
        resourceId: String(dataSourceId),
        resourceName: enriched.data_source_name,
        found: true,
        userId: this.userContext.user_id,
        duration,
        metadata: {
          schemaName: enriched.schema_name,
          tableName: enriched.table_name,
          columnCount: enriched.column_count,
        },
      });

      log.info(template.message, template.context);

      return enriched;
    } catch (error) {
      log.error('Data source read failed', error, {
        userId: this.userContext.user_id,
        dataSourceId,
        component: 'data-sources',
      });
      throw error;
    }
  }

  /**
   * Create a new data source
   */
  async createDataSource(data: CreateDataSourceData): Promise<DataSourceWithMetadata> {
    const startTime = Date.now();

    this.requirePermission('data-sources:create:organization');

    try {
      const result = await db
        .insert(chart_data_sources)
        .values({
          data_source_name: data.data_source_name,
          data_source_description: data.data_source_description,
          table_name: data.table_name,
          schema_name: data.schema_name,
          database_type: data.database_type || 'postgresql',
          connection_config: data.connection_config,
          is_active: data.is_active ?? true,
          requires_auth: data.requires_auth ?? true,
          created_by: this.userContext.user_id,
        })
        .returning({
          data_source_id: chart_data_sources.data_source_id,
          data_source_name: chart_data_sources.data_source_name,
          data_source_description: chart_data_sources.data_source_description,
          table_name: chart_data_sources.table_name,
          schema_name: chart_data_sources.schema_name,
          database_type: chart_data_sources.database_type,
          connection_config: chart_data_sources.connection_config,
          is_active: chart_data_sources.is_active,
          requires_auth: chart_data_sources.requires_auth,
          created_at: chart_data_sources.created_at,
          updated_at: chart_data_sources.updated_at,
          created_by: chart_data_sources.created_by,
        });

      const newDataSource = result[0];
      if (!newDataSource) {
        throw new Error('Failed to create data source - no result returned');
      }

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.create('data_source', {
        resourceId: String(newDataSource.data_source_id),
        resourceName: newDataSource.data_source_name,
        userId: this.userContext.user_id,
        duration,
        metadata: {
          databaseType: newDataSource.database_type,
          schemaName: newDataSource.schema_name,
          tableName: newDataSource.table_name,
          isActive: newDataSource.is_active,
        },
      });

      log.info(template.message, template.context);

      return {
        ...newDataSource,
        column_count: 0,
      };
    } catch (error) {
      log.error('Data source creation failed', error, {
        userId: this.userContext.user_id,
        component: 'data-sources',
      });
      throw error;
    }
  }

  /**
   * Update a data source
   *
   * Improvements:
   * - Uses calculateChanges for audit trail
   * - Logs field change count
   */
  async updateDataSource(
    dataSourceId: number,
    data: UpdateDataSourceData
  ): Promise<DataSourceWithMetadata | null> {
    const startTime = Date.now();

    this.requirePermission('data-sources:update:organization');

    try {
      // Check if data source exists and user has access
      const existing = await this.getDataSourceById(dataSourceId);
      if (!existing) {
        throw new PermissionDeniedError('Data source not found or access denied');
      }

      const [updatedDataSource] = await db
        .update(chart_data_sources)
        .set({
          data_source_name: data.data_source_name,
          data_source_description: data.data_source_description,
          table_name: data.table_name,
          schema_name: data.schema_name,
          database_type: data.database_type,
          connection_config: data.connection_config,
          is_active: data.is_active,
          requires_auth: data.requires_auth,
          updated_at: new Date(),
        })
        .where(eq(chart_data_sources.data_source_id, dataSourceId))
        .returning({
          data_source_id: chart_data_sources.data_source_id,
          data_source_name: chart_data_sources.data_source_name,
          data_source_description: chart_data_sources.data_source_description,
          table_name: chart_data_sources.table_name,
          schema_name: chart_data_sources.schema_name,
          database_type: chart_data_sources.database_type,
          connection_config: chart_data_sources.connection_config,
          is_active: chart_data_sources.is_active,
          requires_auth: chart_data_sources.requires_auth,
          created_at: chart_data_sources.created_at,
          updated_at: chart_data_sources.updated_at,
          created_by: chart_data_sources.created_by,
        });

      if (!updatedDataSource) {
        return null;
      }

      const duration = Date.now() - startTime;

      // Calculate changes for audit trail
      const changes = calculateChanges(existing, data);

      const template = logTemplates.crud.update('data_source', {
        resourceId: String(updatedDataSource.data_source_id),
        resourceName: updatedDataSource.data_source_name,
        userId: this.userContext.user_id,
        changes,
        duration,
        metadata: {
          fieldsChanged: Object.keys(changes).length,
          databaseType: updatedDataSource.database_type,
          isActive: updatedDataSource.is_active,
        },
      });

      log.info(template.message, template.context);

      return {
        ...updatedDataSource,
        column_count: existing.column_count || 0,
      };
    } catch (error) {
      log.error('Data source update failed', error, {
        userId: this.userContext.user_id,
        dataSourceId,
        component: 'data-sources',
      });
      throw error;
    }
  }

  /**
   * Delete a data source (soft delete)
   */
  async deleteDataSource(dataSourceId: number): Promise<boolean> {
    const startTime = Date.now();

    this.requirePermission('data-sources:delete:organization');

    try {
      // Check if data source exists and user has access
      const existing = await this.getDataSourceById(dataSourceId);
      if (!existing) {
        throw new PermissionDeniedError('Data source not found or access denied');
      }

      // Soft delete by setting is_active to false
      const [deletedDataSource] = await db
        .update(chart_data_sources)
        .set({
          is_active: false,
          updated_at: new Date(),
        })
        .where(eq(chart_data_sources.data_source_id, dataSourceId))
        .returning({ data_source_id: chart_data_sources.data_source_id });

      if (!deletedDataSource) {
        return false;
      }

      // Invalidate cache for all charts using this data source
      await chartDataCache.invalidateByDataSource(dataSourceId);

      log.info('Cache invalidated after data source deletion', {
        dataSourceId,
        dataSourceName: existing.data_source_name,
      });

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.delete('data_source', {
        resourceId: String(dataSourceId),
        resourceName: existing.data_source_name,
        userId: this.userContext.user_id,
        soft: true,
        duration,
        metadata: {
          databaseType: existing.database_type,
          schemaName: existing.schema_name,
        },
      });

      log.info(template.message, template.context);

      return true;
    } catch (error) {
      log.error('Data source deletion failed', error, {
        userId: this.userContext.user_id,
        dataSourceId,
        component: 'data-sources',
      });
      throw error;
    }
  }

  /**
   * Test connection to a data source
   *
   * Delegates to connection-tester utility service.
   */
  async testConnection(dataSourceId: number): Promise<ConnectionTestResult> {
    this.requirePermission('data-sources:read:organization');

    try {
      // Get data source details
      const dataSource = await this.getDataSourceById(dataSourceId);
      if (!dataSource) {
        return {
          success: false,
          error: 'Data source not found or access denied',
        };
      }

      // Delegate to connection tester utility
      return await connectionTester.testConnection(dataSource, this.userContext.user_id);
    } catch (error) {
      log.error('Failed to test data source connection', error, {
        userId: this.userContext.user_id,
        dataSourceId,
        component: 'data-sources',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  /**
   * Get table columns from information_schema
   *
   * Delegates to introspection service utility.
   */
  async getTableColumns(query: TableColumnsQueryInput): Promise<
    Array<{
      column_name: string;
      data_type: string;
      is_nullable: boolean;
      column_default: string | null;
      ordinal_position: number;
    }>
  > {
    this.requireAnyPermission(['data-sources:read:organization', 'data-sources:read:all']);

    // Delegate to introspection service
    return await introspectionService.getTableColumns(query, this.userContext.user_id);
  }

  /**
   * Introspect data source columns and create column definitions
   *
   * Delegates to introspection service and column service.
   */
  async introspectDataSourceColumns(dataSourceId: number): Promise<{
    created: number;
    columns: DataSourceColumnWithMetadata[];
  }> {
    this.requireAnyPermission(['data-sources:create:organization', 'data-sources:create:all']);

    try {
      // Get the data source to introspect
      const dataSource = await this.getDataSourceById(dataSourceId);
      if (!dataSource) {
        throw new Error('Data source not found');
      }

      // Check if columns already exist
      const columnsService = createRBACDataSourceColumnsService(this.userContext);
      const existingColumns = await columnsService.getDataSourceColumns({
        data_source_id: dataSourceId,
      });

      if (existingColumns.length > 0) {
        throw new Error(
          'Data source already has column definitions. Delete existing columns before introspecting.'
        );
      }

      // Delegate to introspection service with column creation callback
      return await introspectionService.introspectDataSourceColumns(
        dataSource,
        this.userContext.user_id,
        (data) => columnsService.createDataSourceColumn(data)
      );
    } catch (error) {
      log.error('Data source introspection failed', error, {
        userId: this.userContext.user_id,
        dataSourceId,
        component: 'data-sources',
      });
      throw error;
    }
  }

  /**
   * Helper: Enrich data source with column count
   *
   * Reduces duplication across getDataSources() and getDataSourceById().
   */
  private async enrichWithColumnCount(
    dataSource: DataSourceWithMetadata
  ): Promise<DataSourceWithMetadata> {
    const [columnCount] = await db
      .select({ count: count() })
      .from(chart_data_source_columns)
      .where(
        and(
          eq(chart_data_source_columns.data_source_id, dataSource.data_source_id),
          eq(chart_data_source_columns.is_active, true)
        )
      );

    return {
      ...dataSource,
      column_count: columnCount?.count || 0,
    };
  }
}

// Export factory function
export function createRBACDataSourcesService(userContext: UserContext): RBACDataSourcesService {
  return new RBACDataSourcesService(userContext);
}
