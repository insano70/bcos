/**
 * Data Source Connection Tester
 *
 * Utility service for testing connectivity and accessibility of data sources.
 * Tests schema existence, table existence, and basic query functionality.
 *
 * NOT an RBAC service - accepts UserContext for permission checking only.
 */

import { sql } from 'drizzle-orm';
import { QUERY_LIMITS } from '@/lib/constants/query-limits';
import { log } from '@/lib/logger';
import { getAnalyticsDb } from '@/lib/services/analytics-db';
import type { ConnectionTestResult, DataSourceWithMetadata } from '@/lib/types/data-sources';

/**
 * Connection Tester Service
 *
 * Provides connection testing utilities for data sources.
 * Stateless utility service - does not extend BaseRBACService.
 */
export class ConnectionTesterService {
  /**
   * Test connection to a data source
   *
   * Tests:
   * 1. Schema accessibility
   * 2. Table accessibility
   * 3. Basic query functionality (row count)
   *
   * @param dataSource - Data source configuration to test
   * @param userId - User ID for logging purposes
   * @returns Connection test result with detailed diagnostics
   */
  async testConnection(
    dataSource: DataSourceWithMetadata,
    userId: string
  ): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      // Test basic connectivity to the table
      const tableReference = `${dataSource.schema_name}.${dataSource.table_name}`;

      // Test schema accessibility
      const schemaAccessible = await this.checkSchemaExists(dataSource.schema_name);

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
      const tableResult = await this.checkTableExists(
        dataSource.schema_name,
        dataSource.table_name
      );

      const connectionTime = Date.now() - startTime;

      if (!tableResult.exists) {
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

      log.info('Data source connection test successful', {
        userId,
        dataSourceId: dataSource.data_source_id,
        tableName: tableReference,
        connectionTime,
        rowCount: tableResult.rowCount,
      });

      return {
        success: true,
        details: {
          connection_time_ms: connectionTime,
          schema_accessible: true,
          table_accessible: true,
          sample_row_count: tableResult.rowCount,
        },
      };
    } catch (dbError) {
      const connectionTime = Date.now() - startTime;
      const errorMessage = dbError instanceof Error ? dbError.message : 'Database connection failed';

      log.warn('Data source connection test failed', {
        userId,
        dataSourceId: dataSource.data_source_id,
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
  }

  /**
   * Check if schema exists in the database
   *
   * @param schemaName - Schema name to check
   * @returns True if schema exists and is accessible
   */
  private async checkSchemaExists(schemaName: string): Promise<boolean> {
    try {
      const analyticsDb = getAnalyticsDb();
      const [schemaResult] = await analyticsDb.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.schemata
          WHERE schema_name = ${schemaName}
        ) as schema_exists
      `);
      return (schemaResult as { schema_exists: boolean }).schema_exists;
    } catch (error) {
      log.error('Schema existence check failed', error, { schemaName });
      return false;
    }
  }

  /**
   * Check if table exists in the schema and get sample row count
   *
   * @param schemaName - Schema name
   * @param tableName - Table name
   * @returns Object with exists flag and row count (limited to 1000)
   */
  private async checkTableExists(
    schemaName: string,
    tableName: string
  ): Promise<{ exists: boolean; rowCount: number }> {
    try {
      const analyticsDb = getAnalyticsDb();

      // Use parameterized query for information_schema check
      const [tableResult] = await analyticsDb.execute(sql`
        SELECT
          EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = ${schemaName}
            AND table_name = ${tableName}
          ) as table_exists,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = ${schemaName}
              AND table_name = ${tableName}
            )
            THEN (SELECT COUNT(*) FROM ${sql.identifier(schemaName)}.${sql.identifier(tableName)} LIMIT ${QUERY_LIMITS.CONNECTION_TEST_SAMPLE_SIZE})
            ELSE 0
          END as sample_row_count
      `);

      const result = tableResult as { table_exists: boolean; sample_row_count: number };

      return {
        exists: result.table_exists,
        rowCount: result.sample_row_count,
      };
    } catch (error) {
      log.error('Table existence check failed', error, { schemaName, tableName });
      return { exists: false, rowCount: 0 };
    }
  }
}

// Export singleton instance
export const connectionTester = new ConnectionTesterService();
