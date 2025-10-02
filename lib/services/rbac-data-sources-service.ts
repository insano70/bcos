import { and, count, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chart_data_source_columns, chart_data_sources } from '@/lib/db/chart-config-schema';
import { createAppLogger } from '@/lib/logger/factory';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { getAnalyticsDb } from '@/lib/services/analytics-db';
import type { UserContext } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/types/rbac';
import type {
  DataSourceColumnCreateInput,
  DataSourceColumnQueryInput,
  DataSourceColumnUpdateInput,
  DataSourceCreateInput,
  DataSourceQueryInput,
  DataSourceUpdateInput,
  TableColumnsQueryInput,
} from '@/lib/validations/data-sources';

/**
 * Enhanced Data Sources Service with RBAC
 * Provides data source management with automatic permission checking and data filtering
 */

// Universal logger for RBAC data sources service operations
const rbacDataSourcesLogger = createAppLogger('rbac-data-sources-service', {
  component: 'business-logic',
  feature: 'data-source-management',
  businessIntelligence: true,
});

// Use validation schema types for consistency
export type CreateDataSourceData = DataSourceCreateInput;
export type UpdateDataSourceData = DataSourceUpdateInput;
export type DataSourceQueryOptions = DataSourceQueryInput;
export type CreateDataSourceColumnData = DataSourceColumnCreateInput;
export type UpdateDataSourceColumnData = DataSourceColumnUpdateInput;
export type DataSourceColumnQueryOptions = DataSourceColumnQueryInput;

export interface DataSourceColumnWithMetadata {
  column_id: number;
  data_source_id: number;
  column_name: string;
  display_name: string;
  column_description: string | null;
  data_type: string;

  // Chart functionality flags
  is_filterable: boolean | null;
  is_groupable: boolean | null;
  is_measure: boolean | null;
  is_dimension: boolean | null;
  is_date_field: boolean | null;
  is_measure_type: boolean | null;
  is_time_period: boolean | null;

  // Display and formatting
  format_type: string | null;
  sort_order: number | null;
  default_aggregation: string | null;

  // Security and validation
  is_sensitive: boolean | null;
  access_level: string | null;
  allowed_values: unknown;
  validation_rules: unknown;

  // Metadata
  example_value: string | null;
  is_active: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface DataSourceWithMetadata {
  data_source_id: number;
  data_source_name: string;
  data_source_description: string | null;
  table_name: string;
  schema_name: string;
  database_type: string | null;
  connection_config: unknown; // Match the database schema type
  is_active: boolean | null;
  requires_auth: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
  created_by: string | null;
  column_count?: number;
  last_tested?: Date | null;
}

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  details?: {
    connection_time_ms?: number;
    schema_accessible?: boolean;
    table_accessible?: boolean;
    sample_row_count?: number;
  };
}

export class RBACDataSourcesService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  /**
   * Get data sources with automatic permission-based filtering
   */
  async getDataSources(
    options: DataSourceQueryOptions = { limit: 50, offset: 0 }
  ): Promise<DataSourceWithMetadata[]> {
    this.requirePermission('data-sources:read:organization');

    const accessScope = this.getAccessScope('analytics', 'read'); // Use 'analytics' since 'data-sources' may not be defined as ResourceType

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
      // Build query with column count subquery
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
        })
        .from(chart_data_sources)
        .where(and(...whereConditions))
        .orderBy(desc(chart_data_sources.updated_at))
        .limit(options.limit || 50)
        .offset(options.offset || 0);

      // Get column counts for each data source
      const enrichedResults = await Promise.all(
        results.map(async (dataSource) => {
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
        })
      );

      rbacDataSourcesLogger.info('Data sources retrieved successfully', {
        userId: this.userContext.user_id,
        count: enrichedResults.length,
        filters: options,
      });

      return enrichedResults;
    } catch (error) {
      rbacDataSourcesLogger.error('Failed to retrieve data sources', {
        userId: this.userContext.user_id,
        error: error instanceof Error ? error.message : 'Unknown error',
        filters: options,
      });
      throw error;
    }
  }

  /**
   * Get a single data source by ID
   */
  async getDataSourceById(dataSourceId: number): Promise<DataSourceWithMetadata | null> {
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
        return null;
      }

      // Get column count
      const [columnCount] = await db
        .select({ count: count() })
        .from(chart_data_source_columns)
        .where(
          and(
            eq(chart_data_source_columns.data_source_id, dataSourceId),
            eq(chart_data_source_columns.is_active, true)
          )
        );

      return {
        ...result,
        column_count: columnCount?.count || 0,
      };
    } catch (error) {
      rbacDataSourcesLogger.error('Failed to retrieve data source', {
        userId: this.userContext.user_id,
        dataSourceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create a new data source
   */
  async createDataSource(data: CreateDataSourceData): Promise<DataSourceWithMetadata> {
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

      rbacDataSourcesLogger.info('Data source created successfully', {
        userId: this.userContext.user_id,
        dataSourceId: newDataSource.data_source_id,
        dataSourceName: newDataSource.data_source_name,
      });

      return {
        ...newDataSource,
        column_count: 0,
      };
    } catch (error) {
      rbacDataSourcesLogger.error('Failed to create data source', {
        userId: this.userContext.user_id,
        error: error instanceof Error ? error.message : 'Unknown error',
        data,
      });
      throw error;
    }
  }

  /**
   * Update a data source
   */
  async updateDataSource(
    dataSourceId: number,
    data: UpdateDataSourceData
  ): Promise<DataSourceWithMetadata | null> {
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

      rbacDataSourcesLogger.info('Data source updated successfully', {
        userId: this.userContext.user_id,
        dataSourceId,
        changes: data,
      });

      return {
        ...updatedDataSource,
        column_count: existing.column_count || 0,
      };
    } catch (error) {
      rbacDataSourcesLogger.error('Failed to update data source', {
        userId: this.userContext.user_id,
        dataSourceId,
        error: error instanceof Error ? error.message : 'Unknown error',
        data,
      });
      throw error;
    }
  }

  /**
   * Delete a data source
   */
  async deleteDataSource(dataSourceId: number): Promise<boolean> {
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

      rbacDataSourcesLogger.info('Data source deleted successfully', {
        userId: this.userContext.user_id,
        dataSourceId,
        dataSourceName: existing.data_source_name,
      });

      return true;
    } catch (error) {
      rbacDataSourcesLogger.error('Failed to delete data source', {
        userId: this.userContext.user_id,
        dataSourceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Test connection to a data source
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

      const startTime = Date.now();

      try {
        // Test basic connectivity to the table
        const tableReference = `${dataSource.schema_name}.${dataSource.table_name}`;

        // Test schema accessibility
        const schemaCheckQuery = sql.raw(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.schemata 
            WHERE schema_name = '${dataSource.schema_name}'
          ) as schema_exists
        `);

        // Use analytics database for testing external data sources
        const analyticsDb = getAnalyticsDb();
        const [schemaResult] = await analyticsDb.execute(schemaCheckQuery);
        const schemaAccessible = (schemaResult as { schema_exists: boolean }).schema_exists;

        if (!schemaAccessible) {
          return {
            success: false,
            error: `Schema '${dataSource.schema_name}' does not exist or is not accessible`,
            details: {
              connection_time_ms: Date.now() - startTime,
              schema_accessible: false,
              table_accessible: false,
            },
          };
        }

        // Test table accessibility and get row count
        const tableCheckQuery = sql.raw(`
          SELECT 
            EXISTS (
              SELECT 1 FROM information_schema.tables 
              WHERE table_schema = '${dataSource.schema_name}' 
              AND table_name = '${dataSource.table_name}'
            ) as table_exists,
            CASE 
              WHEN EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = '${dataSource.schema_name}' 
                AND table_name = '${dataSource.table_name}'
              ) 
              THEN (SELECT COUNT(*) FROM ${tableReference} LIMIT 1000)
              ELSE 0 
            END as sample_row_count
        `);

        const [tableResult] = await analyticsDb.execute(tableCheckQuery);
        const result = tableResult as { table_exists: boolean; sample_row_count: number };

        const connectionTime = Date.now() - startTime;

        if (!result.table_exists) {
          return {
            success: false,
            error: `Table '${tableReference}' does not exist or is not accessible`,
            details: {
              connection_time_ms: connectionTime,
              schema_accessible: true,
              table_accessible: false,
            },
          };
        }

        rbacDataSourcesLogger.info('Data source connection test successful', {
          userId: this.userContext.user_id,
          dataSourceId,
          tableName: tableReference,
          connectionTime,
          rowCount: result.sample_row_count,
        });

        return {
          success: true,
          details: {
            connection_time_ms: connectionTime,
            schema_accessible: true,
            table_accessible: true,
            sample_row_count: result.sample_row_count,
          },
        };
      } catch (dbError) {
        const connectionTime = Date.now() - startTime;
        const errorMessage =
          dbError instanceof Error ? dbError.message : 'Database connection failed';

        rbacDataSourcesLogger.warn('Data source connection test failed', {
          userId: this.userContext.user_id,
          dataSourceId,
          error: errorMessage,
          connectionTime,
        });

        return {
          success: false,
          error: errorMessage,
          details: {
            connection_time_ms: connectionTime,
            schema_accessible: false,
            table_accessible: false,
          },
        };
      }
    } catch (error) {
      rbacDataSourcesLogger.error('Failed to test data source connection', {
        userId: this.userContext.user_id,
        dataSourceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  /**
   * Get table columns for a specific schema and table
   * This method fetches column information from the database metadata
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
    const startTime = Date.now();
    rbacDataSourcesLogger.info('Table columns query initiated', {
      userId: this.userContext.user_id,
      schema: query.schema_name,
      table: query.table_name,
      databaseType: query.database_type,
    });

    try {
      // Check permissions before proceeding
      this.requireAnyPermission(['data-sources:read:organization', 'data-sources:read:all']);

      // Ensure database context is available
      if (!this.dbContext) {
        throw new Error('Database context not available');
      }

      // Query the analytics database information schema to get real column information
      const analyticsDb = getAnalyticsDb();
      const columns = await analyticsDb.execute(sql`
        SELECT 
          column_name,
          data_type,
          is_nullable = 'YES' as is_nullable,
          column_default,
          ordinal_position
        FROM information_schema.columns 
        WHERE table_schema = ${query.schema_name} 
          AND table_name = ${query.table_name}
        ORDER BY ordinal_position
      `);

      // Transform the result to match our expected format
      interface InformationSchemaColumn {
        column_name: string;
        data_type: string;
        is_nullable: boolean;
        column_default: string | null;
        ordinal_position: number;
      }

      const formattedColumns = (columns as unknown as InformationSchemaColumn[]).map((col) => ({
        column_name: col.column_name,
        data_type: col.data_type,
        is_nullable: col.is_nullable,
        column_default: col.column_default,
        ordinal_position: col.ordinal_position,
      }));

      rbacDataSourcesLogger.info('Table columns query completed', {
        userId: this.userContext.user_id,
        schema: query.schema_name,
        table: query.table_name,
        columnCount: formattedColumns.length,
        duration: Date.now() - startTime,
      });

      return formattedColumns;
    } catch (error) {
      rbacDataSourcesLogger.error('Table columns query failed', {
        userId: this.userContext.user_id,
        schema: query.schema_name,
        table: query.table_name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Get all columns for a specific data source
   */
  async getDataSourceColumns(
    query: DataSourceColumnQueryOptions
  ): Promise<DataSourceColumnWithMetadata[]> {
    const startTime = Date.now();
    rbacDataSourcesLogger.info('Data source columns query initiated', {
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
        .limit(query.limit || 100)
        .offset(query.offset || 0);

      rbacDataSourcesLogger.info('Data source columns query completed', {
        userId: this.userContext.user_id,
        dataSourceId: query.data_source_id,
        columnCount: columns.length,
        duration: Date.now() - startTime,
      });

      return columns;
    } catch (error) {
      rbacDataSourcesLogger.error('Data source columns query failed', {
        userId: this.userContext.user_id,
        dataSourceId: query.data_source_id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Get single column by ID
   */
  async getDataSourceColumnById(columnId: number): Promise<DataSourceColumnWithMetadata | null> {
    const startTime = Date.now();
    rbacDataSourcesLogger.info('Data source column get initiated', {
      userId: this.userContext.user_id,
      columnId,
    });

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

      rbacDataSourcesLogger.info('Data source column get completed', {
        userId: this.userContext.user_id,
        columnId,
        found: !!column,
        duration: Date.now() - startTime,
      });

      return column || null;
    } catch (error) {
      rbacDataSourcesLogger.error('Data source column get failed', {
        userId: this.userContext.user_id,
        columnId,
        error: error instanceof Error ? error.message : 'Unknown error',
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
    rbacDataSourcesLogger.info('Data source column creation initiated', {
      userId: this.userContext.user_id,
      dataSourceId: data.data_source_id,
      columnName: data.column_name,
    });

    try {
      // Check permissions before proceeding
      this.requireAnyPermission(['data-sources:create:organization', 'data-sources:create:all']);

      // Ensure database context is available
      if (!this.dbContext) {
        throw new Error('Database context not available');
      }

      // Execute column creation as atomic transaction
      const newColumn = await this.dbContext.transaction(async (tx) => {
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
            is_sensitive: data.is_sensitive,
            access_level: data.access_level,
            allowed_values: data.allowed_values,
            validation_rules: data.validation_rules,
            example_value: data.example_value,
            is_active: data.is_active,
          })
          .returning();

        const newColumn = result[0];
        if (!newColumn) {
          throw new Error('Failed to create column - no data returned');
        }

        return newColumn;
      });

      rbacDataSourcesLogger.info('Data source column creation completed', {
        userId: this.userContext.user_id,
        columnId: newColumn.column_id,
        dataSourceId: data.data_source_id,
        duration: Date.now() - startTime,
      });

      return newColumn;
    } catch (error) {
      rbacDataSourcesLogger.error('Data source column creation failed', {
        userId: this.userContext.user_id,
        dataSourceId: data.data_source_id,
        columnName: data.column_name,
        error: error instanceof Error ? error.message : 'Unknown error',
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
    rbacDataSourcesLogger.info('Data source column update initiated', {
      userId: this.userContext.user_id,
      columnId,
    });

    try {
      // Check permissions before proceeding
      this.requireAnyPermission(['data-sources:update:organization', 'data-sources:update:all']);

      // Ensure database context is available
      if (!this.dbContext) {
        throw new Error('Database context not available');
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

      rbacDataSourcesLogger.info('Data source column update completed', {
        userId: this.userContext.user_id,
        columnId,
        updated: !!updatedColumn,
        duration: Date.now() - startTime,
      });

      return updatedColumn || null;
    } catch (error) {
      rbacDataSourcesLogger.error('Data source column update failed', {
        userId: this.userContext.user_id,
        columnId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Delete a data source column
   */
  async deleteDataSourceColumn(columnId: number): Promise<boolean> {
    const startTime = Date.now();
    rbacDataSourcesLogger.info('Data source column deletion initiated', {
      userId: this.userContext.user_id,
      columnId,
    });

    try {
      // Check permissions before proceeding
      this.requireAnyPermission(['data-sources:delete:organization', 'data-sources:delete:all']);

      // Ensure database context is available
      if (!this.dbContext) {
        throw new Error('Database context not available');
      }

      // Execute column deletion as atomic transaction
      const deleted = await this.dbContext.transaction(async (tx) => {
        // First check if the column exists
        const existingColumn = await tx
          .select({ column_id: chart_data_source_columns.column_id })
          .from(chart_data_source_columns)
          .where(eq(chart_data_source_columns.column_id, columnId))
          .limit(1);

        if (existingColumn.length === 0) {
          return false; // Column doesn't exist
        }

        // TODO: Remove column from any existing charts that use it
        // This would require querying chart_definitions and updating their configurations

        await tx
          .delete(chart_data_source_columns)
          .where(eq(chart_data_source_columns.column_id, columnId));

        return true; // Deletion successful
      });

      rbacDataSourcesLogger.info('Data source column deletion completed', {
        userId: this.userContext.user_id,
        columnId,
        deleted,
        duration: Date.now() - startTime,
      });

      return deleted;
    } catch (error) {
      rbacDataSourcesLogger.error('Data source column deletion failed', {
        userId: this.userContext.user_id,
        columnId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Introspect data source columns and create column definitions
   * Queries the specific table defined in the data source and creates column records
   */
  async introspectDataSourceColumns(dataSourceId: number): Promise<{
    created: number;
    columns: DataSourceColumnWithMetadata[];
  }> {
    const startTime = Date.now();
    rbacDataSourcesLogger.info('Data source introspection initiated', {
      userId: this.userContext.user_id,
      dataSourceId,
    });

    try {
      // Check permissions before proceeding
      this.requireAnyPermission(['data-sources:create:organization', 'data-sources:create:all']);

      // Ensure database context is available
      if (!this.dbContext) {
        throw new Error('Database context not available');
      }

      // Get the data source to introspect
      const dataSource = await this.getDataSourceById(dataSourceId);
      if (!dataSource) {
        throw new Error('Data source not found');
      }

      // Check if columns already exist
      const existingColumns = await this.getDataSourceColumns({ data_source_id: dataSourceId });
      if (existingColumns.length > 0) {
        throw new Error(
          'Data source already has column definitions. Delete existing columns before introspecting.'
        );
      }

      // Query the analytics database for column information
      const tableColumns = await this.getTableColumns({
        schema_name: dataSource.schema_name,
        table_name: dataSource.table_name,
        database_type: dataSource.database_type || 'postgresql',
      });

      if (tableColumns.length === 0) {
        throw new Error(
          `No columns found in table ${dataSource.schema_name}.${dataSource.table_name}`
        );
      }

      // Execute column creation as atomic transaction
      const createdColumns = await this.dbContext.transaction(async (tx) => {
        const columnInserts = tableColumns.map((col, index) => {
          // Intelligent type mapping based on column name and data type
          const columnName = col.column_name.toLowerCase();
          const dataType = col.data_type.toLowerCase();

          // Detect if this is a date field
          const isDateField =
            dataType.includes('timestamp') ||
            dataType.includes('date') ||
            columnName.includes('date') ||
            columnName.includes('time') ||
            columnName.endsWith('_at');

          // Detect if this is a measure (numeric field that can be aggregated)
          const isMeasure =
            (dataType.includes('numeric') ||
              dataType.includes('decimal') ||
              dataType.includes('float') ||
              dataType.includes('double') ||
              dataType.includes('integer') ||
              dataType.includes('bigint')) &&
            !columnName.includes('id') &&
            !columnName.includes('count') &&
            !isDateField;

          // Detect if this is a dimension (categorical field for grouping)
          const isDimension =
            (dataType.includes('varchar') ||
              dataType.includes('text') ||
              dataType.includes('char')) &&
            !columnName.includes('description') &&
            !columnName.includes('note') &&
            !columnName.includes('comment');

          // Detect if this column contains measure type information (for formatting)
          const isMeasureType =
            columnName.match(
              /^(measure_type|number_format|display_format|format_type|value_type|data_format)$/i
            ) !== null;

          // Detect if this column contains time period/frequency information
          const isTimePeriod =
            columnName.match(/^(time_period|frequency|period|time_unit|period_type)$/i) !== null;

          // Create display name from column name
          const displayName = col.column_name
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          return {
            data_source_id: dataSourceId,
            column_name: col.column_name,
            display_name: displayName,
            column_description: `Auto-generated from ${dataSource.schema_name}.${dataSource.table_name}`,
            data_type: col.data_type,
            is_filterable: isDimension || isDateField,
            is_groupable: isDimension || isDateField,
            is_measure: isMeasure,
            is_dimension: isDimension,
            is_date_field: isDateField,
            is_measure_type: isMeasureType,
            is_time_period: isTimePeriod,
            sort_order: index,
            is_sensitive: false,
            access_level: 'all',
            is_active: true,
          };
        });

        // Bulk insert all columns
        const result = await tx.insert(chart_data_source_columns).values(columnInserts).returning();

        return result;
      });

      rbacDataSourcesLogger.info('Data source introspection completed', {
        userId: this.userContext.user_id,
        dataSourceId,
        columnsCreated: createdColumns.length,
        duration: Date.now() - startTime,
      });

      return {
        created: createdColumns.length,
        columns: createdColumns,
      };
    } catch (error) {
      rbacDataSourcesLogger.error('Data source introspection failed', {
        userId: this.userContext.user_id,
        dataSourceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
}

// Export singleton creator
export function createRBACDataSourcesService(userContext: UserContext): RBACDataSourcesService {
  return new RBACDataSourcesService(userContext);
}
