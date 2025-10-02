import { and, eq, isNull } from 'drizzle-orm';
import {
  chart_data_source_columns,
  chart_data_sources,
  chart_display_configurations,
  color_palettes,
  db,
} from '@/lib/db';
import { logger } from '@/lib/logger';

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
  private dataSourceCache = new Map<string, DataSourceConfig>();
  private displayConfigCache = new Map<string, ChartDisplayConfig>();
  private colorPaletteCache = new Map<number, ColorPalette>();

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
        })
        .from(chart_data_sources)
        .where(eq(chart_data_sources.is_active, true))
        .orderBy(chart_data_sources.data_source_name);

      return dataSources;
    } catch (error) {
      logger.error('Failed to load data sources', { error });
      return [];
    }
  }

  /**
   * Get data source configuration by table name
   */
  async getDataSourceConfig(
    tableName: string,
    schemaName: string = 'ih'
  ): Promise<DataSourceConfig | null> {
    const cacheKey = `${schemaName}.${tableName}`;

    if (this.dataSourceCache.has(cacheKey)) {
      const cached = this.dataSourceCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      // Get data source
      const [dataSource] = await db
        .select()
        .from(chart_data_sources)
        .where(
          and(
            eq(chart_data_sources.table_name, tableName),
            eq(chart_data_sources.schema_name, schemaName),
            eq(chart_data_sources.is_active, true)
          )
        );

      if (!dataSource) {
        logger.warn('Data source not found', { tableName, schemaName });
        return null;
      }

      // Get columns for this data source
      const columns = await db
        .select()
        .from(chart_data_source_columns)
        .where(
          and(
            eq(chart_data_source_columns.data_source_id, dataSource.data_source_id),
            eq(chart_data_source_columns.is_active, true)
          )
        )
        .orderBy(chart_data_source_columns.sort_order);

      const config: DataSourceConfig = {
        id: dataSource.data_source_id,
        name: dataSource.data_source_name,
        tableName: dataSource.table_name,
        schemaName: dataSource.schema_name,
        isActive: dataSource.is_active ?? false,
        columns: columns.map((col) => {
          const columnConfig: ColumnConfig = {
            id: col.column_id,
            columnName: col.column_name,
            displayName: col.display_name,
            dataType: col.data_type,
            isFilterable: col.is_filterable ?? false,
            isGroupable: col.is_groupable ?? false,
            isMeasure: col.is_measure ?? false,
            isDimension: col.is_dimension ?? false,
            isDateField: col.is_date_field ?? false,
            isMeasureType: col.is_measure_type ?? false,
            isTimePeriod: col.is_time_period ?? false,
            sortOrder: col.sort_order ?? 0,
          };

          if (col.column_description) columnConfig.description = col.column_description;
          if (col.format_type) columnConfig.formatType = col.format_type;
          if (col.default_aggregation) columnConfig.defaultAggregation = col.default_aggregation;
          if (col.example_value) columnConfig.exampleValue = col.example_value;
          if (col.allowed_values) columnConfig.allowedValues = col.allowed_values as string[];

          return columnConfig;
        }),
      };

      if (dataSource.data_source_description) {
        config.description = dataSource.data_source_description;
      }

      this.dataSourceCache.set(cacheKey, config);
      return config;
    } catch (error) {
      logger.error('Failed to load data source config', { tableName, schemaName, error });
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
   */
  async getChartDisplayConfig(
    chartType: string,
    frequency?: string
  ): Promise<ChartDisplayConfig | null> {
    const cacheKey = `${chartType}-${frequency || 'default'}`;

    if (this.displayConfigCache.has(cacheKey)) {
      const cached = this.displayConfigCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const [config] = await db
        .select()
        .from(chart_display_configurations)
        .where(
          and(
            eq(chart_display_configurations.chart_type, chartType),
            frequency
              ? eq(chart_display_configurations.frequency, frequency)
              : isNull(chart_display_configurations.frequency),
            eq(chart_display_configurations.is_active, true)
          )
        );

      if (!config) {
        // Try to get default config for chart type
        const [defaultConfig] = await db
          .select()
          .from(chart_display_configurations)
          .where(
            and(
              eq(chart_display_configurations.chart_type, chartType),
              eq(chart_display_configurations.is_default, true),
              eq(chart_display_configurations.is_active, true)
            )
          );

        if (!defaultConfig) {
          logger.warn('No display config found', { chartType, frequency });
          return null;
        }

        const displayConfig: ChartDisplayConfig = {
          chartType: defaultConfig.chart_type,
          defaultWidth: defaultConfig.default_width ?? 800,
          defaultHeight: defaultConfig.default_height ?? 400,
          showLegend: defaultConfig.show_legend ?? true,
          showTooltips: defaultConfig.show_tooltips ?? true,
          enableAnimation: defaultConfig.enable_animation ?? true,
        };

        if (defaultConfig.frequency) displayConfig.frequency = defaultConfig.frequency;
        if (defaultConfig.x_axis_config) displayConfig.xAxisConfig = defaultConfig.x_axis_config;
        if (defaultConfig.y_axis_config) displayConfig.yAxisConfig = defaultConfig.y_axis_config;
        if (defaultConfig.time_unit) displayConfig.timeUnit = defaultConfig.time_unit;
        if (defaultConfig.time_display_format)
          displayConfig.timeDisplayFormat = defaultConfig.time_display_format;
        if (defaultConfig.time_tooltip_format)
          displayConfig.timeTooltipFormat = defaultConfig.time_tooltip_format;
        if (defaultConfig.default_color_palette_id)
          displayConfig.defaultColorPaletteId = defaultConfig.default_color_palette_id;

        this.displayConfigCache.set(cacheKey, displayConfig);
        return displayConfig;
      }

      const displayConfig: ChartDisplayConfig = {
        chartType: config.chart_type,
        defaultWidth: config.default_width ?? 800,
        defaultHeight: config.default_height ?? 400,
        showLegend: config.show_legend ?? true,
        showTooltips: config.show_tooltips ?? true,
        enableAnimation: config.enable_animation ?? true,
      };

      if (config.frequency) displayConfig.frequency = config.frequency;
      if (config.x_axis_config) displayConfig.xAxisConfig = config.x_axis_config;
      if (config.y_axis_config) displayConfig.yAxisConfig = config.y_axis_config;
      if (config.time_unit) displayConfig.timeUnit = config.time_unit;
      if (config.time_display_format) displayConfig.timeDisplayFormat = config.time_display_format;
      if (config.time_tooltip_format) displayConfig.timeTooltipFormat = config.time_tooltip_format;
      if (config.default_color_palette_id)
        displayConfig.defaultColorPaletteId = config.default_color_palette_id;

      this.displayConfigCache.set(cacheKey, displayConfig);
      return displayConfig;
    } catch (error) {
      logger.error('Failed to load chart display config', { chartType, frequency, error });
      return null;
    }
  }

  /**
   * Get color palette
   */
  async getColorPalette(paletteId?: number): Promise<ColorPalette | null> {
    if (paletteId && this.colorPaletteCache.has(paletteId)) {
      const cached = this.colorPaletteCache.get(paletteId);
      if (cached) {
        return cached;
      }
    }

    try {
      let palette: typeof color_palettes.$inferSelect | undefined;

      if (paletteId) {
        [palette] = await db
          .select()
          .from(color_palettes)
          .where(and(eq(color_palettes.palette_id, paletteId), eq(color_palettes.is_active, true)));
      } else {
        // Get default palette
        [palette] = await db
          .select()
          .from(color_palettes)
          .where(and(eq(color_palettes.is_default, true), eq(color_palettes.is_active, true)));
      }

      if (!palette) {
        logger.warn('Color palette not found', { paletteId });
        return null;
      }

      const colorPalette: ColorPalette = {
        id: palette.palette_id,
        name: palette.palette_name,
        colors: palette.colors as string[],
        paletteType: palette.palette_type ?? 'general',
        isColorblindSafe: palette.is_colorblind_safe ?? false,
        isDefault: palette.is_default ?? false,
      };

      if (palette.palette_description) colorPalette.description = palette.palette_description;
      if (palette.max_colors) colorPalette.maxColors = palette.max_colors;

      this.colorPaletteCache.set(palette.palette_id, colorPalette);
      return colorPalette;
    } catch (error) {
      logger.error('Failed to load color palette', { paletteId, error });
      return null;
    }
  }

  /**
   * Clear caches (call when configurations change)
   */
  clearCache(): void {
    this.dataSourceCache.clear();
    this.displayConfigCache.clear();
    this.colorPaletteCache.clear();
    logger.info('Chart configuration caches cleared');
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
    } catch (error) {
      console.warn('Failed to load measures from database, using fallback:', error);
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
        console.warn('Data source config not found, using fallback frequencies');
        return ['Monthly', 'Weekly', 'Quarterly'];
      }

      // Find the column marked as time period
      const timePeriodColumn = config.columns.find((col) => col.isTimePeriod === true);

      if (!timePeriodColumn) {
        console.warn('No time period column found in data source, using fallback frequencies');
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

      console.log('✅ Loaded frequencies dynamically:', {
        tableName,
        timePeriodColumn: timePeriodColumn.columnName,
        frequenciesFound: values,
      });

      return values.length > 0 ? values : ['Monthly', 'Weekly', 'Quarterly'];
    } catch (error) {
      console.warn('Failed to load frequencies from database, using fallback:', error);
      return ['Monthly', 'Weekly', 'Quarterly'];
    }
  }
}

// Export singleton instance
export const chartConfigService = new ChartConfigService();
