/**
 * Chart Configuration Cache Service
 *
 * Redis-based caching for chart metadata (universal, not practice-specific)
 *
 * SCOPE:
 * - Data source configurations (table metadata, column definitions)
 * - Display configurations (chart display settings)
 * - Color palettes (color schemes)
 *
 * NOT CACHED HERE:
 * - Actual data rows (that's separate, practice-segmented)
 * - Query results
 *
 * KEY NAMING CONVENTION:
 *   chartconfig:datasource:{dataSourceId}
 *   chartconfig:display:{chartType}:{frequency}
 *   chartconfig:palette:{paletteId}
 *
 * TTL STRATEGY:
 * - Data source config: 24 hours (rarely changes)
 * - Display config: 24 hours (rarely changes)
 * - Color palettes: 24 hours (rarely changes)
 */

import { and, eq, isNull } from 'drizzle-orm';
import {
  chart_data_source_columns,
  chart_data_sources,
  chart_display_configurations,
  color_palettes,
  db,
} from '@/lib/db';
import { log } from '@/lib/logger';
import { CacheService } from './base';

/**
 * Cached data source configuration (universal metadata)
 */
export interface CachedDataSourceConfig {
  id: number;
  name: string;
  description?: string;
  tableName: string;
  schemaName: string;
  isActive: boolean;
  columns: CachedColumnConfig[];
  cachedAt: number;
}

/**
 * Cached column configuration
 */
export interface CachedColumnConfig {
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
  isMeasureType: boolean;
  isTimePeriod: boolean;
  formatType?: string;
  sortOrder: number;
  defaultAggregation?: string;
  exampleValue?: string;
  allowedValues?: unknown[];
}

/**
 * Cached display configuration
 */
export interface CachedDisplayConfig {
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
  cachedAt: number;
}

/**
 * Cached color palette
 */
export interface CachedColorPalette {
  id: number;
  name: string;
  description?: string;
  colors: string[];
  paletteType: string;
  maxColors?: number;
  isColorblindSafe: boolean;
  isDefault: boolean;
  cachedAt: number;
}

/**
 * Chart configuration cache service
 * Caches universal metadata only (not practice-specific data)
 */
class ChartConfigCacheService extends CacheService {
  protected namespace = 'chartconfig';
  protected defaultTTL = 86400; // 24 hours

  /**
   * Get data source configuration from cache or database
   *
   * @param dataSourceId - Data source ID
   * @returns Data source configuration with all columns
   */
  async getDataSourceConfig(dataSourceId: number): Promise<CachedDataSourceConfig | null> {
    const key = this.buildKey('datasource', dataSourceId);

    // Check cache first
    const cached = await this.get<CachedDataSourceConfig>(key);
    if (cached) {
      log.debug('Data source config cache hit', {
        component: 'chart-config-cache',
        dataSourceId,
      });
      return cached;
    }

    // Cache miss - load from database
    log.debug('Data source config cache miss', {
      component: 'chart-config-cache',
      dataSourceId,
    });

    const config = await this.loadDataSourceFromDB(dataSourceId);

    if (config) {
      // Cache for 24 hours (fire and forget)
      this.set(key, config, { ttl: this.defaultTTL }).catch(() => {
        // Ignore cache write errors
      });
    }

    return config;
  }

  /**
   * Get display configuration from cache or database
   *
   * @param chartType - Chart type (e.g., 'line', 'bar')
   * @param frequency - Optional frequency filter
   * @returns Display configuration
   */
  async getDisplayConfig(
    chartType: string,
    frequency?: string
  ): Promise<CachedDisplayConfig | null> {
    const key = this.buildKey('display', chartType, frequency || 'default');

    // Check cache first
    const cached = await this.get<CachedDisplayConfig>(key);
    if (cached) {
      log.debug('Display config cache hit', {
        component: 'chart-config-cache',
        chartType,
        frequency,
      });
      return cached;
    }

    // Cache miss - load from database
    log.debug('Display config cache miss', {
      component: 'chart-config-cache',
      chartType,
      frequency,
    });

    const config = await this.loadDisplayConfigFromDB(chartType, frequency);

    if (config) {
      // Cache for 24 hours (fire and forget)
      this.set(key, config, { ttl: this.defaultTTL }).catch(() => {
        // Ignore cache write errors
      });
    }

    return config;
  }

  /**
   * Get color palette from cache or database
   *
   * @param paletteId - Color palette ID (optional, gets default if not provided)
   * @returns Color palette
   */
  async getColorPalette(paletteId?: number): Promise<CachedColorPalette | null> {
    // If no paletteId provided, get default palette
    if (paletteId === undefined) {
      return this.getDefaultColorPalette();
    }

    const key = this.buildKey('palette', paletteId);

    // Check cache first
    const cached = await this.get<CachedColorPalette>(key);
    if (cached) {
      log.debug('Color palette cache hit', {
        component: 'chart-config-cache',
        paletteId,
      });
      return cached;
    }

    // Cache miss - load from database
    log.debug('Color palette cache miss', {
      component: 'chart-config-cache',
      paletteId,
    });

    const palette = await this.loadColorPaletteFromDB(paletteId);

    if (palette) {
      // Cache for 24 hours (fire and forget)
      this.set(key, palette, { ttl: this.defaultTTL }).catch(() => {
        // Ignore cache write errors
      });
    }

    return palette;
  }

  /**
   * Get default color palette
   */
  private async getDefaultColorPalette(): Promise<CachedColorPalette | null> {
    const key = this.buildKey('palette', 'default');

    // Check cache first
    const cached = await this.get<CachedColorPalette>(key);
    if (cached) {
      log.debug('Default color palette cache hit', {
        component: 'chart-config-cache',
      });
      return cached;
    }

    // Cache miss - load from database
    log.debug('Default color palette cache miss', {
      component: 'chart-config-cache',
    });

    try {
      const [palette] = await db
        .select()
        .from(color_palettes)
        .where(and(eq(color_palettes.is_default, true), eq(color_palettes.is_active, true)));

      if (!palette) {
        return null;
      }

      const cachedPalette: CachedColorPalette = {
        id: palette.palette_id,
        name: palette.palette_name,
        colors: (palette.colors as string[]) || [],
        paletteType: palette.palette_type ?? 'general',
        isColorblindSafe: palette.is_colorblind_safe ?? false,
        isDefault: palette.is_default ?? false,
        cachedAt: Date.now(),
      };
      if (palette.palette_description !== null)
        cachedPalette.description = palette.palette_description;
      if (palette.max_colors !== null) cachedPalette.maxColors = palette.max_colors;

      // Cache for 24 hours (fire and forget)
      this.set(key, cachedPalette, { ttl: this.defaultTTL }).catch(() => {});

      return cachedPalette;
    } catch (error) {
      log.error(
        'Failed to load default color palette',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'chart-config-cache',
        }
      );
      return null;
    }
  }

  /**
   * Invalidate data source configuration
   *
   * @param dataSourceId - Data source ID
   */
  async invalidateDataSource(dataSourceId: number): Promise<void> {
    const key = this.buildKey('datasource', dataSourceId);
    await this.del(key);

    log.info('Data source config invalidated', {
      component: 'chart-config-cache',
      dataSourceId,
    });
  }

  /**
   * Invalidate display configuration
   *
   * @param chartType - Chart type
   * @param frequency - Optional frequency filter
   */
  async invalidateDisplayConfig(chartType: string, frequency?: string): Promise<void> {
    const key = this.buildKey('display', chartType, frequency || 'default');
    await this.del(key);

    log.info('Display config invalidated', {
      component: 'chart-config-cache',
      chartType,
      frequency,
    });
  }

  /**
   * Invalidate color palette
   *
   * @param paletteId - Color palette ID
   */
  async invalidateColorPalette(paletteId: number): Promise<void> {
    const key = this.buildKey('palette', paletteId);
    await this.del(key);

    log.info('Color palette invalidated', {
      component: 'chart-config-cache',
      paletteId,
    });
  }

  /**
   * Invalidate all chart configurations (use sparingly)
   */
  async invalidate(): Promise<void> {
    const pattern = this.buildKey('*');
    const deletedCount = await this.delPattern(pattern);

    log.warn('All chart configurations invalidated', {
      component: 'chart-config-cache',
      deletedCount,
      operation: 'invalidateAll',
    });
  }

  /**
   * Load data source configuration from database
   */
  private async loadDataSourceFromDB(dataSourceId: number): Promise<CachedDataSourceConfig | null> {
    try {
      // Get data source
      const [dataSource] = await db
        .select()
        .from(chart_data_sources)
        .where(eq(chart_data_sources.data_source_id, dataSourceId));

      if (!dataSource) {
        log.warn('Data source not found', {
          component: 'chart-config-cache',
          dataSourceId,
        });
        return null;
      }

      // Get columns for this data source
      const columns = await db
        .select()
        .from(chart_data_source_columns)
        .where(
          and(
            eq(chart_data_source_columns.data_source_id, dataSourceId),
            eq(chart_data_source_columns.is_active, true)
          )
        )
        .orderBy(chart_data_source_columns.sort_order);

      const config: CachedDataSourceConfig = {
        id: dataSource.data_source_id,
        name: dataSource.data_source_name,
        tableName: dataSource.table_name,
        schemaName: dataSource.schema_name,
        isActive: dataSource.is_active ?? false,
        columns: columns.map((col) => {
          const cachedCol: CachedColumnConfig = {
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
          if (col.column_description !== null) cachedCol.description = col.column_description;
          if (col.format_type !== null) cachedCol.formatType = col.format_type;
          if (col.default_aggregation !== null)
            cachedCol.defaultAggregation = col.default_aggregation;
          if (col.example_value !== null) cachedCol.exampleValue = col.example_value;
          if (col.allowed_values !== null)
            cachedCol.allowedValues = col.allowed_values as unknown[];
          return cachedCol;
        }),
        cachedAt: Date.now(),
      };
      if (dataSource.data_source_description !== null)
        config.description = dataSource.data_source_description;

      return config;
    } catch (error) {
      log.error(
        'Failed to load data source config from database',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'chart-config-cache',
          dataSourceId,
        }
      );
      return null;
    }
  }

  /**
   * Load display configuration from database
   */
  private async loadDisplayConfigFromDB(
    chartType: string,
    frequency?: string
  ): Promise<CachedDisplayConfig | null> {
    try {
      const [config] = await db
        .select()
        .from(chart_display_configurations)
        .where(
          and(
            eq(chart_display_configurations.chart_type, chartType),
            frequency
              ? eq(chart_display_configurations.frequency, frequency)
              : isNull(chart_display_configurations.frequency)
          )
        );

      if (!config) {
        return null;
      }

      const displayConfig: CachedDisplayConfig = {
        chartType: config.chart_type,
        defaultWidth: config.default_width ?? 400,
        defaultHeight: config.default_height ?? 300,
        showLegend: config.show_legend ?? true,
        showTooltips: config.show_tooltips ?? true,
        enableAnimation: config.enable_animation ?? true,
        cachedAt: Date.now(),
      };
      if (config.frequency !== null) displayConfig.frequency = config.frequency;
      if (config.x_axis_config !== null) displayConfig.xAxisConfig = config.x_axis_config;
      if (config.y_axis_config !== null) displayConfig.yAxisConfig = config.y_axis_config;
      if (config.time_unit !== null) displayConfig.timeUnit = config.time_unit;
      if (config.time_display_format !== null)
        displayConfig.timeDisplayFormat = config.time_display_format;
      if (config.time_tooltip_format !== null)
        displayConfig.timeTooltipFormat = config.time_tooltip_format;
      if (config.default_color_palette_id !== null)
        displayConfig.defaultColorPaletteId = config.default_color_palette_id;

      return displayConfig;
    } catch (error) {
      log.error(
        'Failed to load display config from database',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'chart-config-cache',
          chartType,
          frequency,
        }
      );
      return null;
    }
  }

  /**
   * Load color palette from database
   */
  private async loadColorPaletteFromDB(paletteId: number): Promise<CachedColorPalette | null> {
    try {
      const [palette] = await db
        .select()
        .from(color_palettes)
        .where(eq(color_palettes.palette_id, paletteId));

      if (!palette) {
        return null;
      }

      const cachedPalette: CachedColorPalette = {
        id: palette.palette_id,
        name: palette.palette_name,
        colors: (palette.colors as string[]) || [],
        paletteType: palette.palette_type ?? 'general',
        isColorblindSafe: palette.is_colorblind_safe ?? false,
        isDefault: palette.is_default ?? false,
        cachedAt: Date.now(),
      };
      if (palette.palette_description !== null)
        cachedPalette.description = palette.palette_description;
      if (palette.max_colors !== null) cachedPalette.maxColors = palette.max_colors;

      return cachedPalette;
    } catch (error) {
      log.error(
        'Failed to load color palette from database',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'chart-config-cache',
          paletteId,
        }
      );
      return null;
    }
  }
}

// Export singleton instance
export const chartConfigCache = new ChartConfigCacheService();
