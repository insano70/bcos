import { and, eq } from 'drizzle-orm';
import { chartConfigCache } from '@/lib/cache/chart-config-cache';
import { chart_data_sources, db } from '@/lib/db';
import { log } from '@/lib/logger';

/**
 * Chart Configuration Service
 * Dynamically loads chart configurations from database
 * Replaces all hardcoded configurations
 */

export interface DataSourceConfig {
  id: number;
  name: string;
  description?: string;
  tableName: string;
  schemaName: string;
  dataSourceType: 'measure-based' | 'table-based';
  isActive: boolean;
  columns: ColumnConfig[];
}

export interface ColumnConfig {
  id: number;
  columnName: string;
  displayName: string;
  description?: string;
  dataType: string;
  isFilterable: boolean;
  isGroupable: boolean;
  isMeasure: boolean;
  isDimension: boolean;
  isDateField: boolean;
  isMeasureType?: boolean;
  isTimePeriod?: boolean;
  formatType?: string;
  sortOrder: number;
  defaultAggregation?: string;
  exampleValue?: string;
  allowedValues?: unknown[];
}

export interface ChartDisplayConfig {
  chartType: string;
  frequency?: string;
  xAxisConfig?: unknown;
  yAxisConfig?: unknown;
  defaultWidth: number;
  defaultHeight: number;
  timeUnit?: string;
  timeDisplayFormat?: string;
  timeTooltipFormat?: string;
  showLegend: boolean;
  showTooltips: boolean;
  enableAnimation: boolean;
  defaultColorPaletteId?: number;
}

export interface ColorPalette {
  id: number;
  name: string;
  description?: string;
  colors: string[];
  paletteType: string;
  maxColors?: number;
  isColorblindSafe: boolean;
  isDefault: boolean;
}

export class ChartConfigService {
  // In-memory caches removed - now using Redis via chartConfigCache

  /**
   * Get all available data sources
   */
  async getAllDataSources(): Promise<
    Array<{
      id: number;
      name: string;
      description: string | null;
      tableName: string;
      schemaName: string;
      dataSourceType: 'measure-based' | 'table-based';
    }>
  > {
    try {
      const dataSources = await db
        .select({
          id: chart_data_sources.data_source_id,
          name: chart_data_sources.data_source_name,
          description: chart_data_sources.data_source_description,
          tableName: chart_data_sources.table_name,
          schemaName: chart_data_sources.schema_name,
          dataSourceType: chart_data_sources.data_source_type,
        })
        .from(chart_data_sources)
        .where(eq(chart_data_sources.is_active, true))
        .orderBy(chart_data_sources.data_source_name);

      return dataSources;
    } catch (error) {
      log.error('Failed to load data sources', { error });
      return [];
    }
  }

  /**
   * Get data source configuration by ID
   * Preferred method - uses data_source_id directly from chart_definitions
   * Now uses Redis cache for multi-instance consistency
   */
  async getDataSourceConfigById(dataSourceId: number): Promise<DataSourceConfig | null> {
    try {
      // Get from Redis cache using data source ID
      const cached = await chartConfigCache.getDataSourceConfig(dataSourceId);

      if (!cached) {
        return null;
      }

      // Convert from cached format to service format
      const dataSourceConfig: DataSourceConfig = {
        id: cached.id,
        name: cached.name,
        tableName: cached.tableName,
        schemaName: cached.schemaName,
        dataSourceType: cached.dataSourceType,
        isActive: cached.isActive,
        columns: cached.columns.map((col) => {
          const columnConfig: ColumnConfig = {
            id: col.id,
            columnName: col.columnName,
            displayName: col.displayName,
            dataType: col.dataType,
            isFilterable: col.isFilterable,
            isGroupable: col.isGroupable,
            isMeasure: col.isMeasure,
            isDimension: col.isDimension,
            isDateField: col.isDateField,
            isMeasureType: col.isMeasureType,
            isTimePeriod: col.isTimePeriod,
            sortOrder: col.sortOrder,
          };
          if (col.description !== undefined) columnConfig.description = col.description;
          if (col.formatType !== undefined) columnConfig.formatType = col.formatType;
          if (col.defaultAggregation !== undefined)
            columnConfig.defaultAggregation = col.defaultAggregation;
          if (col.exampleValue !== undefined) columnConfig.exampleValue = col.exampleValue;
          if (col.allowedValues !== undefined) columnConfig.allowedValues = col.allowedValues;
          return columnConfig;
        }),
      };
      if (cached.description !== undefined) dataSourceConfig.description = cached.description;

      return dataSourceConfig;
    } catch (error) {
      log.error(
        'Failed to load data source config by ID',
        error instanceof Error ? error : new Error(String(error)),
        { dataSourceId }
      );
      return null;
    }
  }

  /**
   * Get data source configuration by table name
   * DEPRECATED: Use getDataSourceConfigById() instead when data_source_id is available
   * This method is inefficient and potentially unsafe (table_name is not unique)
   * Now uses Redis cache for multi-instance consistency
   */
  async getDataSourceConfig(
    tableName: string,
    schemaName: string = 'ih'
  ): Promise<DataSourceConfig | null> {
    try {
      // First, we need to find the data source ID from table name
      const [dataSource] = await db
        .select({ data_source_id: chart_data_sources.data_source_id })
        .from(chart_data_sources)
        .where(
          and(
            eq(chart_data_sources.table_name, tableName),
            eq(chart_data_sources.schema_name, schemaName),
            eq(chart_data_sources.is_active, true)
          )
        );

      if (!dataSource) {
        log.warn('Data source not found', { tableName, schemaName });
        return null;
      }

      // Delegate to the ID-based method
      return this.getDataSourceConfigById(dataSource.data_source_id);
    } catch (error) {
      log.error(
        'Failed to load data source config',
        error instanceof Error ? error : new Error(String(error)),
        { tableName, schemaName }
      );
      return null;
    }
  }

  /**
   * Get allowed fields for security validation
   */
  async getAllowedFields(tableName: string, schemaName: string = 'ih'): Promise<string[]> {
    const config = await this.getDataSourceConfig(tableName, schemaName);
    return config?.columns.map((col) => col.columnName) || [];
  }

  /**
   * Get filterable fields for UI
   */
  async getFilterableFields(tableName: string, schemaName: string = 'ih'): Promise<ColumnConfig[]> {
    const config = await this.getDataSourceConfig(tableName, schemaName);
    return config?.columns.filter((col) => col.isFilterable) || [];
  }

  /**
   * Get groupable fields for UI
   */
  async getGroupableFields(tableName: string, schemaName: string = 'ih'): Promise<ColumnConfig[]> {
    const config = await this.getDataSourceConfig(tableName, schemaName);
    return config?.columns.filter((col) => col.isGroupable) || [];
  }

  /**
   * Get measure fields for Y-axis
   */
  async getMeasureFields(tableName: string, schemaName: string = 'ih'): Promise<ColumnConfig[]> {
    const config = await this.getDataSourceConfig(tableName, schemaName);
    return config?.columns.filter((col) => col.isMeasure) || [];
  }

  /**
   * Get dimension fields for X-axis and grouping
   */
  async getDimensionFields(tableName: string, schemaName: string = 'ih'): Promise<ColumnConfig[]> {
    const config = await this.getDataSourceConfig(tableName, schemaName);
    return config?.columns.filter((col) => col.isDimension) || [];
  }

  /**
   * Get chart display configuration
   * Now uses Redis cache for multi-instance consistency
   */
  async getChartDisplayConfig(
    chartType: string,
    frequency?: string
  ): Promise<ChartDisplayConfig | null> {
    try {
      // Get from Redis cache
      const cached = await chartConfigCache.getDisplayConfig(chartType, frequency);

      if (!cached) {
        return null;
      }

      // Convert from cached format to service format
      const displayConfig: ChartDisplayConfig = {
        chartType: cached.chartType,
        defaultWidth: cached.defaultWidth,
        defaultHeight: cached.defaultHeight,
        showLegend: cached.showLegend,
        showTooltips: cached.showTooltips,
        enableAnimation: cached.enableAnimation,
      };

      if (cached.frequency) displayConfig.frequency = cached.frequency;
      if (cached.xAxisConfig) displayConfig.xAxisConfig = cached.xAxisConfig;
      if (cached.yAxisConfig) displayConfig.yAxisConfig = cached.yAxisConfig;
      if (cached.timeUnit) displayConfig.timeUnit = cached.timeUnit;
      if (cached.timeDisplayFormat) displayConfig.timeDisplayFormat = cached.timeDisplayFormat;
      if (cached.timeTooltipFormat) displayConfig.timeTooltipFormat = cached.timeTooltipFormat;
      if (cached.defaultColorPaletteId)
        displayConfig.defaultColorPaletteId = cached.defaultColorPaletteId;

      return displayConfig;
    } catch (error) {
      log.error(
        'Failed to load chart display config',
        error instanceof Error ? error : new Error(String(error)),
        { chartType, frequency }
      );
      return null;
    }
  }

  /**
   * Get color palette
   * Now uses Redis cache for multi-instance consistency
   */
  async getColorPalette(paletteId?: number): Promise<ColorPalette | null> {
    try {
      // Get from Redis cache
      const cached = await chartConfigCache.getColorPalette(paletteId);

      if (!cached) {
        return null;
      }

      // Convert from cached format to service format
      const colorPalette: ColorPalette = {
        id: cached.id,
        name: cached.name,
        colors: cached.colors,
        paletteType: cached.paletteType,
        isColorblindSafe: cached.isColorblindSafe,
        isDefault: cached.isDefault,
      };

      if (cached.description) colorPalette.description = cached.description;
      if (cached.maxColors) colorPalette.maxColors = cached.maxColors;

      return colorPalette;
    } catch (error) {
      log.error(
        'Failed to load color palette',
        error instanceof Error ? error : new Error(String(error)),
        { paletteId }
      );
      return null;
    }
  }

  /**
   * Clear caches (call when configurations change)
   * Now invalidates Redis cache for multi-instance consistency
   */
  async clearCache(): Promise<void> {
    await chartConfigCache.invalidate();
    log.info('Chart configuration caches cleared (Redis)');
  }

  /**
   * Get available measure types from data source by querying actual data
   */
  async getAvailableMeasures(tableName: string, schemaName: string = 'ih'): Promise<string[]> {
    try {
      // Query the actual data source for distinct measures
      const { executeAnalyticsQuery } = await import('./analytics-db');
      const measures = await executeAnalyticsQuery(
        `
        SELECT DISTINCT measure 
        FROM ${schemaName}.${tableName} 
        ORDER BY measure
      `,
        []
      );

      return measures.map((row) => (row as { measure: string }).measure).filter(Boolean);
    } catch (_error) {
      log.warn('Failed to load measures from database, using fallback', {
        operation: 'get_measures',
        tableName,
        schemaName,
        component: 'chart-config',
      });
      return ['Charges by Provider', 'Payments by Provider'];
    }
  }

  /**
   * Get available frequencies from data source by querying actual data
   * Dynamically finds the time period column using is_time_period flag
   */
  async getAvailableFrequencies(tableName: string, schemaName: string = 'ih'): Promise<string[]> {
    try {
      // Get data source configuration to find the time period column
      const config = await this.getDataSourceConfig(tableName, schemaName);

      if (!config) {
        log.warn('Data source config not found, using fallback frequencies', {
          operation: 'get_frequencies',
          tableName,
          schemaName,
          component: 'chart-config',
        });
        return ['Monthly', 'Weekly', 'Quarterly'];
      }

      // Find the column marked as time period
      const timePeriodColumn = config.columns.find((col) => col.isTimePeriod === true);

      if (!timePeriodColumn) {
        log.warn('No time period column found in data source, using fallback frequencies', {
          operation: 'get_frequencies',
          tableName,
          schemaName,
          component: 'chart-config',
        });
        return ['Monthly', 'Weekly', 'Quarterly'];
      }

      // Query the actual data source for distinct frequencies using the identified column
      const { executeAnalyticsQuery } = await import('./analytics-db');
      const frequencies = await executeAnalyticsQuery(
        `
        SELECT DISTINCT ${timePeriodColumn.columnName} 
        FROM ${schemaName}.${tableName} 
        WHERE ${timePeriodColumn.columnName} IS NOT NULL
        ORDER BY ${timePeriodColumn.columnName}
      `,
        []
      );

      // Extract values using the dynamic column name
      const values = frequencies
        .map((row) => (row as Record<string, unknown>)[timePeriodColumn.columnName])
        .filter(Boolean)
        .map((val) => String(val));

      log.debug('Loaded frequencies dynamically', {
        operation: 'get_frequencies',
        tableName,
        schemaName,
        timePeriodColumn: timePeriodColumn.columnName,
        frequenciesFound: values,
        component: 'chart-config',
      });

      return values.length > 0 ? values : ['Monthly', 'Weekly', 'Quarterly'];
    } catch (error) {
      log.warn('Failed to load frequencies from database, using fallback', {
        operation: 'get_frequencies',
        tableName,
        schemaName,
        error: error instanceof Error ? error.message : String(error),
        component: 'chart-config',
      });
      return ['Monthly', 'Weekly', 'Quarterly'];
    }
  }
}

// Export singleton instance
export const chartConfigService = new ChartConfigService();
