/**
 * Data Source Introspection Service
 *
 * Database schema introspection and auto-column generation service.
 * Queries information_schema to discover table structure and intelligently
 * creates column definitions with appropriate flags and settings.
 *
 * NOT an RBAC service - accepts UserContext for permission delegation.
 */

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { log } from '@/lib/logger';
import { getAnalyticsDb } from '@/lib/services/analytics-db';
import type {
  ColumnCharacteristics,
  CreateDataSourceColumnData,
  DataSourceColumnWithMetadata,
  DataSourceWithMetadata,
  TableColumn,
} from '@/lib/types/data-sources';
import type { TableColumnsQueryInput } from '@/lib/validations/data-sources';

/**
 * Data Source Introspection Service
 *
 * Handles database schema introspection and intelligent column creation.
 * Stateless utility - does not extend BaseRBACService.
 */
export class DataSourceIntrospectionService {
  /**
   * Get table columns from information_schema
   *
   * Queries the analytics database metadata to retrieve column information
   * for a specific schema and table.
   *
   * @param query - Schema, table, and database type to introspect
   * @param userId - User ID for logging purposes
   * @returns Array of table column information
   */
  async getTableColumns(query: TableColumnsQueryInput, userId: string): Promise<TableColumn[]> {
    const startTime = Date.now();
    log.info('Table columns query initiated', {
      userId,
      schema: query.schema_name,
      table: query.table_name,
      databaseType: query.database_type,
    });

    try {
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

      // Zod schema for PostgreSQL information_schema.columns query result
      const informationSchemaColumnSchema = z.object({
        column_name: z.string(),
        data_type: z.string(),
        is_nullable: z.boolean(),
        column_default: z.string().nullable(),
        ordinal_position: z.number(),
      });

      // Validate and transform the database result
      const columnsSchema = z.array(informationSchemaColumnSchema);
      const validationResult = columnsSchema.safeParse(columns);

      if (!validationResult.success) {
        log.error('Invalid information_schema.columns query result', {
          error: validationResult.error,
          schema: query.schema_name,
          table: query.table_name,
        });
        throw new Error('Database query returned unexpected column structure');
      }

      const formattedColumns = validationResult.data.map((col) => ({
        column_name: col.column_name,
        data_type: col.data_type,
        is_nullable: col.is_nullable,
        column_default: col.column_default,
        ordinal_position: col.ordinal_position,
      }));

      log.info('Table columns query completed', {
        userId,
        schema: query.schema_name,
        table: query.table_name,
        columnCount: formattedColumns.length,
        duration: Date.now() - startTime,
      });

      return formattedColumns;
    } catch (error) {
      log.error('Table columns query failed', error, {
        userId,
        schema: query.schema_name,
        table: query.table_name,
      });

      throw error;
    }
  }

  /**
   * Introspect data source columns and create column definitions
   *
   * Queries the specific table defined in the data source and creates
   * column records with intelligent type detection.
   *
   * NOTE: This method requires the column service to be injected to avoid
   * circular dependencies. The column service is responsible for creating
   * the actual column records.
   *
   * @param dataSource - Data source to introspect
   * @param userId - User ID for logging
   * @param createColumnFn - Function to create columns (injected to avoid circular deps)
   * @returns Created columns count and column data
   */
  async introspectDataSourceColumns(
    dataSource: DataSourceWithMetadata,
    userId: string,
    createColumnFn: (data: CreateDataSourceColumnData) => Promise<DataSourceColumnWithMetadata>
  ): Promise<{
    created: number;
    columns: DataSourceColumnWithMetadata[];
  }> {
    const startTime = Date.now();
    log.info('Data source introspection initiated', {
      userId,
      dataSourceId: dataSource.data_source_id,
    });

    try {
      // Query the analytics database for column information
      const tableColumns = await this.getTableColumns(
        {
          schema_name: dataSource.schema_name,
          table_name: dataSource.table_name,
          database_type: dataSource.database_type || 'postgresql',
        },
        userId
      );

      if (tableColumns.length === 0) {
        throw new Error(
          `No columns found in table ${dataSource.schema_name}.${dataSource.table_name}`
        );
      }

      // Create column definitions with intelligent type detection
      const createdColumns: DataSourceColumnWithMetadata[] = [];

      for (let index = 0; index < tableColumns.length; index++) {
        const col = tableColumns[index];
        if (!col) continue;

        // Validate required properties exist before processing
        if (!col.column_name || !col.data_type) {
          log.warn('Skipping column with missing required properties', {
            userId,
            dataSourceId: dataSource.data_source_id,
            columnIndex: index,
            hasColumnName: !!col.column_name,
            hasDataType: !!col.data_type,
          });
          continue;
        }

        // Detect column characteristics using intelligent heuristics.
        // Analyzes column name patterns and data types to determine appropriate chart functionality flags.
        // For example: timestamp columns become date fields, numeric columns become measures, text becomes dimensions.
        const characteristics = this.detectColumnCharacteristics(col.column_name, col.data_type);

        // Create display name from column name (convert snake_case to Title Case)
        const displayName = col.column_name
          .split('_')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        // Prepare column data
        const columnData: CreateDataSourceColumnData = {
          data_source_id: dataSource.data_source_id,
          column_name: col.column_name,
          display_name: displayName,
          column_description: `Auto-generated from ${dataSource.schema_name}.${dataSource.table_name}`,
          data_type: col.data_type,
          is_filterable: characteristics.isFilterable,
          is_groupable: characteristics.isGroupable,
          is_measure: characteristics.isMeasure,
          is_dimension: characteristics.isDimension,
          is_date_field: characteristics.isDateField,
          is_measure_type: characteristics.isMeasureType,
          is_expansion_dimension: false,
          is_time_period: characteristics.isTimePeriod,
          sort_order: index,
          display_icon: false,
          icon_color_mode: 'auto',
          is_sensitive: false,
          access_level: 'all',
          is_active: true,
        };

        // Use injected create function to avoid circular dependency
        const createdColumn = await createColumnFn(columnData);
        createdColumns.push(createdColumn);
      }

      log.info('Data source introspection completed', {
        userId,
        dataSourceId: dataSource.data_source_id,
        columnsCreated: createdColumns.length,
        duration: Date.now() - startTime,
      });

      return {
        created: createdColumns.length,
        columns: createdColumns,
      };
    } catch (error) {
      log.error('Data source introspection failed', error, {
        userId,
        dataSourceId: dataSource.data_source_id,
      });

      throw error;
    }
  }

  /**
   * Detect column characteristics based on column name and data type
   *
   * Intelligently determines appropriate flags for chart functionality
   * based on naming conventions and data types.
   *
   * @param columnName - Column name to analyze
   * @param dataType - Database data type
   * @returns Column characteristics object
   */
  private detectColumnCharacteristics(
    columnName: string,
    dataType: string
  ): ColumnCharacteristics {
    const colName = columnName.toLowerCase();
    const colType = dataType.toLowerCase();

    // Detect if this is a date field
    const isDateField =
      colType.includes('timestamp') ||
      colType.includes('date') ||
      colName.includes('date') ||
      colName.includes('time') ||
      colName.endsWith('_at');

    // Detect if this is a measure (numeric field that can be aggregated)
    const isMeasure =
      (colType.includes('numeric') ||
        colType.includes('decimal') ||
        colType.includes('float') ||
        colType.includes('double') ||
        colType.includes('integer') ||
        colType.includes('bigint')) &&
      !colName.includes('id') &&
      !colName.includes('count') &&
      !isDateField;

    // Detect if this is a dimension (categorical field for grouping)
    const isDimension =
      (colType.includes('varchar') || colType.includes('text') || colType.includes('char')) &&
      !colName.includes('description') &&
      !colName.includes('note') &&
      !colName.includes('comment');

    // Detect if this column contains measure type information (for formatting)
    const isMeasureType =
      colName.match(
        /^(measure_type|number_format|display_format|format_type|value_type|data_format)$/i
      ) !== null;

    // Detect if this column contains time period/frequency information
    const isTimePeriod =
      colName.match(/^(time_period|frequency|period|time_unit|period_type)$/i) !== null;

    // Filterable: dimensions and date fields
    const isFilterable = isDimension || isDateField;

    // Groupable: dimensions and date fields
    const isGroupable = isDimension || isDateField;

    return {
      isDateField,
      isMeasure,
      isDimension,
      isMeasureType,
      isTimePeriod,
      isFilterable,
      isGroupable,
    };
  }
}

// Export singleton instance
export const introspectionService = new DataSourceIntrospectionService();
