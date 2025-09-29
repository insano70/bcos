import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { createAppLogger } from '@/lib/logger/factory';
import { chart_data_sources, chart_data_source_columns } from '@/lib/db/chart-config-schema';
import { eq, and, inArray, isNull, like, or, count, desc, sql } from 'drizzle-orm';
import type { UserContext } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/types/rbac';
import type { DataSourceCreateInput, DataSourceUpdateInput, DataSourceQueryInput } from '@/lib/validations/data-sources';

/**
 * Enhanced Data Sources Service with RBAC
 * Provides data source management with automatic permission checking and data filtering
 */

// Universal logger for RBAC data sources service operations
const rbacDataSourcesLogger = createAppLogger('rbac-data-sources-service', {
  component: 'business-logic',
  feature: 'data-source-management',
  businessIntelligence: true
});

// Use validation schema types for consistency
export type CreateDataSourceData = DataSourceCreateInput;
export type UpdateDataSourceData = DataSourceUpdateInput;
export type DataSourceQueryOptions = DataSourceQueryInput;

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
  connection_status?: 'connected' | 'error' | 'untested';
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
  async getDataSources(options: DataSourceQueryOptions = { limit: 50, offset: 0 }): Promise<DataSourceWithMetadata[]> {
    this.requirePermission('data-sources:read:organization');
    
    const accessScope = this.getAccessScope('analytics', 'read'); // Use 'analytics' since 'data-sources' may not be defined as ResourceType
    
    // Build all where conditions upfront
    const whereConditions = [
      eq(chart_data_sources.is_active, true)
    ];

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
            connection_status: 'untested' as const,
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
        connection_status: 'untested' as const,
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
        connection_status: 'untested' as const,
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
  async updateDataSource(dataSourceId: number, data: UpdateDataSourceData): Promise<DataSourceWithMetadata | null> {
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
        connection_status: 'untested' as const,
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
        
        const [schemaResult] = await db.execute(schemaCheckQuery);
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

        const [tableResult] = await db.execute(tableCheckQuery);
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
        const errorMessage = dbError instanceof Error ? dbError.message : 'Database connection failed';
        
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
}

// Export singleton creator
export function createRBACDataSourcesService(userContext: UserContext): RBACDataSourcesService {
  return new RBACDataSourcesService(userContext);
}
