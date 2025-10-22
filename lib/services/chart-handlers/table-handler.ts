import { log } from '@/lib/logger';
import { createRBACDataSourceColumnsService } from '@/lib/services/rbac-data-source-columns-service';
import type { ChartData } from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { type FormatType, formatTableData } from '@/lib/utils/table-formatters';
import { BaseChartHandler } from './base-handler';

/**
 * Table Chart Handler
 *
 * Handles tabular data display with server-side formatting.
 *
 * **Data Flow Architecture:**
 * Tables require both row data AND column metadata. This handler implements
 * a two-step fetch process:
 *
 * 1. **fetchData()**: Fetches column metadata + row data
 *    - Calls RBAC data sources service for column definitions
 *    - Stores columns in config.columns (passed through orchestrator)
 *    - Calls super.fetchData() for row data
 *    - Returns row data (columns extracted from config by orchestrator)
 *
 * 2. **transform()**: Returns empty ChartData (tables don't use Chart.js)
 *    - Tables bypass Chart.js transformation
 *    - Data flows directly to AnalyticsTableChart component
 *
 * 3. **Orchestrator Integration**:
 *    - Orchestrator extracts config.columns and includes in result
 *    - API route receives both rawData and columns
 *    - Frontend receives complete table structure
 *
 * **Why Config Mutation?**
 * Temporary pattern to pass column metadata through the orchestrator.
 * The orchestrator extracts columns from merged config and returns them
 * in the OrchestrationResult. This avoids breaking the ChartTypeHandler
 * interface while supporting table-specific requirements.
 *
 * @see OrchestrationResult.columns - Where columns are extracted
 * @see UniversalChartDataResponse.columns - Final API response
 */
export class TableChartHandler extends BaseChartHandler {
  type = 'table';

  canHandle(config: Record<string, unknown>): boolean {
    const chartType = config.chartType as string;
    return chartType === 'table';
  }

  /**
   * Table charts always use table-based data sources
   * Override to avoid database lookup for type detection
   */
  protected getDataSourceType(): 'table-based' {
    return 'table-based';
  }

  /**
   * Fetch table data with column metadata
   *
   * Tables require both row data and column definitions. This method:
   * 1. Fetches column metadata from data source (with RBAC)
   * 2. Stores columns in config for orchestrator extraction
   * 3. Fetches row data via base handler
   *
   * The orchestrator will extract config.columns and include in response.
   *
   * @param config - Chart configuration (will be mutated with columns)
   * @param userContext - User context for RBAC
   * @returns Row data (columns available via config.columns)
   */
  async fetchData(
    config: Record<string, unknown>,
    userContext: UserContext
  ): Promise<{
    data: Record<string, unknown>[];
    cacheHit: boolean;
    queryTimeMs: number;
  }> {
    const dataSourceId = config.dataSourceId as number;

    // Get column metadata from data source with RBAC enforcement
    const columnsService = createRBACDataSourceColumnsService(userContext);
    const columns = await columnsService.getDataSourceColumns({
      data_source_id: dataSourceId,
      is_active: true,
    });

    // Store columns in config for orchestrator extraction
    // Orchestrator will extract this and include in OrchestrationResult.columns
    config.columns = columns.map((col) => ({
      columnName: col.column_name,
      displayName: col.display_name || col.column_name,
      dataType: col.data_type || 'text',
      formatType: col.format_type,
      displayIcon: col.display_icon,
      iconType: col.icon_type,
      iconColorMode: col.icon_color_mode,
      iconColor: col.icon_color,
      iconMapping: col.icon_mapping,
    }));

    // Fetch row data using base method
    return super.fetchData(config, userContext);
  }

  /**
   * Transform table data with server-side formatting
   *
   * Phase 3.2: Complete server-side table formatting
   * - Extracts column metadata from config.columns
   * - Builds format type and icon mapping maps
   * - Applies formatters to all rows via formatTableData()
   * - Stores formatted data in config for orchestrator extraction
   *
   * Tables still bypass Chart.js (return empty ChartData), but now include
   * fully formatted data ready for display.
   *
   * @param data - Row data from fetchData()
   * @param config - Chart config with columns metadata
   * @returns Empty ChartData structure (formatted data stored in config)
   */
  transform(data: Record<string, unknown>[], config: Record<string, unknown>): ChartData {
    const startTime = Date.now();

    try {
      // Extract column metadata from config
      const columns = config.columns as
        | Array<{
            columnName: string;
            displayName: string;
            dataType: string;
            formatType: string | null;
            displayIcon: boolean;
            iconType: string | null;
            iconColorMode: string | null;
            iconColor: string | null;
            iconMapping: Record<string, unknown> | null;
          }>
        | undefined;

      if (!columns || columns.length === 0) {
        log.warn('No column metadata available for table formatting', {
          configKeys: Object.keys(config),
          dataRowCount: data.length,
        });

        // Return empty structure with unformatted data
        return {
          labels: [],
          datasets: [],
        };
      }

      log.info('Starting table data transformation', {
        rowCount: data.length,
        columnCount: columns.length,
      });

      // Build format type map for all columns
      const columnFormats = new Map<string, FormatType>();
      for (const col of columns) {
        columnFormats.set(col.columnName, col.formatType as FormatType);
      }

      // Build icon mapping map for columns with icon display enabled
      const columnIconMappings = new Map<string, Record<string, unknown>>();
      for (const col of columns) {
        if (col.displayIcon && col.iconMapping) {
          columnIconMappings.set(col.columnName, col.iconMapping);
        }
      }

      // Apply server-side formatting to all rows
      const formattedData = formatTableData(data, columnFormats, columnIconMappings);

      // Store formatted data in config for orchestrator extraction
      // Orchestrator will include this in OrchestrationResult.formattedData
      config.formattedData = formattedData;

      const duration = Date.now() - startTime;

      log.info('Table data transformation completed', {
        rowCount: data.length,
        columnCount: columns.length,
        formattedCellCount: data.length * columns.length,
        duration,
      });

      // Tables don't use Chart.js, so return empty structure
      // Actual formatted data flows via config.formattedData
      return {
        labels: [],
        datasets: [],
      };
    } catch (error) {
      log.error('Table data transformation failed', error, {
        rowCount: data.length,
        configKeys: Object.keys(config),
      });

      throw error;
    }
  }

  protected validateCustom(config: Record<string, unknown>): string[] {
    const errors: string[] = [];

    // Tables don't support aggregation modes
    if (config.aggregationMode) {
      errors.push('Table charts do not support aggregation modes');
    }

    // Tables don't support multiple series
    if (
      config.multipleSeries &&
      Array.isArray(config.multipleSeries) &&
      config.multipleSeries.length > 0
    ) {
      errors.push('Table charts do not support multiple series');
    }

    // Tables don't support period comparison
    if (config.periodComparison) {
      errors.push('Table charts do not support period comparison');
    }

    // Tables don't need groupBy (they show all columns)
    if (config.groupBy) {
      errors.push('Table charts do not use groupBy - all active columns are displayed');
    }

    return errors;
  }
}
