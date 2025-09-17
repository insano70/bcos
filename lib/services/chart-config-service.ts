import { db, chart_data_sources, chart_data_source_columns, chart_display_configs, color_palettes } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
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
  formatType?: string;
  sortOrder: number;
  defaultAggregation?: string;
  exampleValue?: string;
  allowedValues?: any[];
}

export interface ChartDisplayConfig {
  chartType: string;
  frequency?: string;
  xAxisConfig?: any;
  yAxisConfig?: any;
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
   * Get data source configuration by table name
   */
  async getDataSourceConfig(tableName: string, schemaName: string = 'ih'): Promise<DataSourceConfig | null> {
    const cacheKey = `${schemaName}.${tableName}`;
    
    if (this.dataSourceCache.has(cacheKey)) {
      return this.dataSourceCache.get(cacheKey)!;
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
        description: dataSource.data_source_description || undefined,
        tableName: dataSource.table_name,
        schemaName: dataSource.schema_name,
        isActive: dataSource.is_active,
        columns: columns.map(col => ({
          id: col.column_id,
          columnName: col.column_name,
          displayName: col.display_name,
          description: col.column_description || undefined,
          dataType: col.data_type,
          isFilterable: col.is_filterable,
          isGroupable: col.is_groupable,
          isMeasure: col.is_measure,
          isDimension: col.is_dimension,
          isDateField: col.is_date_field,
          formatType: col.format_type || undefined,
          sortOrder: col.sort_order,
          defaultAggregation: col.default_aggregation || undefined,
          exampleValue: col.example_value || undefined,
          allowedValues: col.allowed_values as any[] || undefined,
        }))
      };

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
    return config?.columns.map(col => col.columnName) || [];
  }

  /**
   * Get filterable fields for UI
   */
  async getFilterableFields(tableName: string, schemaName: string = 'ih'): Promise<ColumnConfig[]> {
    const config = await this.getDataSourceConfig(tableName, schemaName);
    return config?.columns.filter(col => col.isFilterable) || [];
  }

  /**
   * Get groupable fields for UI
   */
  async getGroupableFields(tableName: string, schemaName: string = 'ih'): Promise<ColumnConfig[]> {
    const config = await this.getDataSourceConfig(tableName, schemaName);
    return config?.columns.filter(col => col.isGroupable) || [];
  }

  /**
   * Get measure fields for Y-axis
   */
  async getMeasureFields(tableName: string, schemaName: string = 'ih'): Promise<ColumnConfig[]> {
    const config = await this.getDataSourceConfig(tableName, schemaName);
    return config?.columns.filter(col => col.isMeasure) || [];
  }

  /**
   * Get dimension fields for X-axis and grouping
   */
  async getDimensionFields(tableName: string, schemaName: string = 'ih'): Promise<ColumnConfig[]> {
    const config = await this.getDataSourceConfig(tableName, schemaName);
    return config?.columns.filter(col => col.isDimension) || [];
  }

  /**
   * Get chart display configuration
   */
  async getChartDisplayConfig(chartType: string, frequency?: string): Promise<ChartDisplayConfig | null> {
    const cacheKey = `${chartType}-${frequency || 'default'}`;
    
    if (this.displayConfigCache.has(cacheKey)) {
      return this.displayConfigCache.get(cacheKey)!;
    }

    try {
      const [config] = await db
        .select()
        .from(chart_display_configs)
        .where(
          and(
            eq(chart_display_configs.chart_type, chartType),
            frequency ? eq(chart_display_configs.frequency, frequency) : eq(chart_display_configs.frequency, null),
            eq(chart_display_configs.is_active, true)
          )
        );

      if (!config) {
        // Try to get default config for chart type
        const [defaultConfig] = await db
          .select()
          .from(chart_display_configs)
          .where(
            and(
              eq(chart_display_configs.chart_type, chartType),
              eq(chart_display_configs.is_default, true),
              eq(chart_display_configs.is_active, true)
            )
          );

        if (!defaultConfig) {
          logger.warn('No display config found', { chartType, frequency });
          return null;
        }

        const displayConfig: ChartDisplayConfig = {
          chartType: defaultConfig.chart_type,
          frequency: defaultConfig.frequency || undefined,
          xAxisConfig: defaultConfig.x_axis_config as any,
          yAxisConfig: defaultConfig.y_axis_config as any,
          defaultWidth: defaultConfig.default_width,
          defaultHeight: defaultConfig.default_height,
          timeUnit: defaultConfig.time_unit || undefined,
          timeDisplayFormat: defaultConfig.time_display_format || undefined,
          timeTooltipFormat: defaultConfig.time_tooltip_format || undefined,
          showLegend: defaultConfig.show_legend,
          showTooltips: defaultConfig.show_tooltips,
          enableAnimation: defaultConfig.enable_animation,
          defaultColorPaletteId: defaultConfig.default_color_palette_id || undefined,
        };

        this.displayConfigCache.set(cacheKey, displayConfig);
        return displayConfig;
      }

      const displayConfig: ChartDisplayConfig = {
        chartType: config.chart_type,
        frequency: config.frequency || undefined,
        xAxisConfig: config.x_axis_config as any,
        yAxisConfig: config.y_axis_config as any,
        defaultWidth: config.default_width,
        defaultHeight: config.default_height,
        timeUnit: config.time_unit || undefined,
        timeDisplayFormat: config.time_display_format || undefined,
        timeTooltipFormat: config.time_tooltip_format || undefined,
        showLegend: config.show_legend,
        showTooltips: config.show_tooltips,
        enableAnimation: config.enable_animation,
        defaultColorPaletteId: config.default_color_palette_id || undefined,
      };

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
      return this.colorPaletteCache.get(paletteId)!;
    }

    try {
      let palette;
      
      if (paletteId) {
        [palette] = await db
          .select()
          .from(color_palettes)
          .where(
            and(
              eq(color_palettes.palette_id, paletteId),
              eq(color_palettes.is_active, true)
            )
          );
      } else {
        // Get default palette
        [palette] = await db
          .select()
          .from(color_palettes)
          .where(
            and(
              eq(color_palettes.is_default, true),
              eq(color_palettes.is_active, true)
            )
          );
      }

      if (!palette) {
        logger.warn('Color palette not found', { paletteId });
        return null;
      }

      const colorPalette: ColorPalette = {
        id: palette.palette_id,
        name: palette.palette_name,
        description: palette.palette_description || undefined,
        colors: palette.colors as string[],
        paletteType: palette.palette_type,
        maxColors: palette.max_colors || undefined,
        isColorblindSafe: palette.is_colorblind_safe,
        isDefault: palette.is_default,
      };

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
      const measures = await executeAnalyticsQuery(`
        SELECT DISTINCT measure 
        FROM ${schemaName}.${tableName} 
        ORDER BY measure
      `, []);
      
      return measures.map((row: any) => row.measure).filter(Boolean);
    } catch (error) {
      console.warn('Failed to load measures from database, using fallback:', error);
      return ['Charges by Provider', 'Payments by Provider'];
    }
  }

  /**
   * Get available frequencies from data source by querying actual data
   */
  async getAvailableFrequencies(tableName: string, schemaName: string = 'ih'): Promise<string[]> {
    try {
      // Query the actual data source for distinct frequencies
      const { executeAnalyticsQuery } = await import('./analytics-db');
      const frequencies = await executeAnalyticsQuery(`
        SELECT DISTINCT frequency 
        FROM ${schemaName}.${tableName} 
        ORDER BY frequency
      `, []);
      
      return frequencies.map((row: any) => row.frequency).filter(Boolean);
    } catch (error) {
      console.warn('Failed to load frequencies from database, using fallback:', error);
      return ['Monthly', 'Weekly', 'Quarterly'];
    }
  }
}

// Export singleton instance
export const chartConfigService = new ChartConfigService();

