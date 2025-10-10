/**
 * Analytics Cache Service
 *
 * Handles caching for analytics/reporting data:
 * - Chart data source columns (metadata for building charts)
 * - Dashboard lists
 * - Chart definitions
 *
 * KEY NAMING CONVENTION:
 *   analytics:datasource:{dataSourceId}:columns
 *   analytics:dashboard:list
 *   analytics:dashboard:{dashboardId}
 *   analytics:chart:list
 *   analytics:chart:{chartId}
 *
 * TTL STRATEGY:
 * - Data source columns: 1 hour (rarely changes, heavily read)
 * - Dashboard list: 15 minutes (moderate change frequency)
 * - Chart definitions: 1 hour (rarely changes)
 */

import { CacheService } from './base';
import { log } from '@/lib/logger';

/**
 * Chart data source column
 */
export interface DataSourceColumn {
  column_id: string;
  data_source_id: number;
  column_name: string;
  display_name: string;
  column_description: string | null;
  data_type: string;
  is_filterable: boolean;
  is_groupable: boolean;
  is_measure: boolean;
  is_dimension: boolean;
  is_date_field: boolean;
  is_measure_type: boolean;
  is_time_period: boolean;
  format_type: string | null;
  sort_order: number | null;
  default_aggregation: string | null;
  display_icon: boolean | null;
  icon_type: string | null;
  icon_color_mode: string | null;
  icon_color: string | null;
  icon_mapping: Record<string, unknown> | null;
  is_sensitive: boolean | null;
  access_level: string | null;
  allowed_values: unknown[] | null;
  validation_rules: Record<string, unknown> | null;
  example_value: string | null;
  is_active: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
}

/**
 * Dashboard
 */
export interface Dashboard {
  dashboard_id: string;
  dashboard_name: string;
  dashboard_description: string | null;
  layout_config: Record<string, unknown> | null;
  is_active: boolean;
  is_published: boolean;
  is_default: boolean;
  created_at: Date;
  updated_at: Date | null;
  [key: string]: unknown; // Allow additional fields from joins
}

/**
 * Chart definition
 */
export interface ChartDefinition {
  chart_definition_id: string;
  chart_name: string;
  chart_description: string | null;
  chart_type: string;
  data_source: string;
  chart_config: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date | null;
  [key: string]: unknown; // Allow additional fields from joins
}

/**
 * Analytics cache service
 */
class AnalyticsCacheService extends CacheService {
  protected namespace = 'analytics';
  protected defaultTTL = 3600; // 1 hour

  // TTL constants
  private readonly DATASOURCE_COLUMNS_TTL = 3600; // 1 hour
  private readonly DASHBOARD_LIST_TTL = 900; // 15 minutes
  private readonly CHART_DEFINITION_TTL = 3600; // 1 hour

  /**
   * Get data source columns from cache
   *
   * @param dataSourceId - Data source ID
   * @returns Array of columns or null if not cached
   */
  async getDataSourceColumns(dataSourceId: number): Promise<DataSourceColumn[] | null> {
    // Key: analytics:datasource:{dataSourceId}:columns
    const key = this.buildKey('datasource', dataSourceId, 'columns');
    return await this.get<DataSourceColumn[]>(key);
  }

  /**
   * Cache data source columns
   *
   * @param dataSourceId - Data source ID
   * @param columns - Array of columns
   * @returns true if successful
   */
  async setDataSourceColumns(
    dataSourceId: number,
    columns: DataSourceColumn[]
  ): Promise<boolean> {
    // Key: analytics:datasource:{dataSourceId}:columns
    const key = this.buildKey('datasource', dataSourceId, 'columns');
    return await this.set(key, columns, { ttl: this.DATASOURCE_COLUMNS_TTL });
  }

  /**
   * Get dashboard list from cache
   *
   * @returns Array of dashboards or null if not cached
   */
  async getDashboardList(): Promise<Dashboard[] | null> {
    // Key: analytics:dashboard:list
    const key = this.buildKey('dashboard', 'list');
    return await this.get<Dashboard[]>(key);
  }

  /**
   * Cache dashboard list
   *
   * @param dashboards - Array of dashboards
   * @returns true if successful
   */
  async setDashboardList(dashboards: Dashboard[]): Promise<boolean> {
    // Key: analytics:dashboard:list
    const key = this.buildKey('dashboard', 'list');
    return await this.set(key, dashboards, { ttl: this.DASHBOARD_LIST_TTL });
  }

  /**
   * Get specific dashboard from cache
   *
   * @param dashboardId - Dashboard ID
   * @returns Dashboard or null if not cached
   */
  async getDashboard(dashboardId: string): Promise<Dashboard | null> {
    // Key: analytics:dashboard:{dashboardId}
    const key = this.buildKey('dashboard', dashboardId);
    return await this.get<Dashboard>(key);
  }

  /**
   * Cache specific dashboard
   *
   * @param dashboardId - Dashboard ID
   * @param dashboard - Dashboard object
   * @returns true if successful
   */
  async setDashboard(dashboardId: string, dashboard: Dashboard): Promise<boolean> {
    // Key: analytics:dashboard:{dashboardId}
    const key = this.buildKey('dashboard', dashboardId);
    return await this.set(key, dashboard, { ttl: this.DASHBOARD_LIST_TTL });
  }

  /**
   * Get chart definitions list from cache
   *
   * @returns Array of chart definitions or null if not cached
   */
  async getChartDefinitionList(): Promise<ChartDefinition[] | null> {
    // Key: analytics:chart:list
    const key = this.buildKey('chart', 'list');
    return await this.get<ChartDefinition[]>(key);
  }

  /**
   * Cache chart definitions list
   *
   * @param charts - Array of chart definitions
   * @returns true if successful
   */
  async setChartDefinitionList(charts: ChartDefinition[]): Promise<boolean> {
    // Key: analytics:chart:list
    const key = this.buildKey('chart', 'list');
    return await this.set(key, charts, { ttl: this.CHART_DEFINITION_TTL });
  }

  /**
   * Get specific chart definition from cache
   *
   * @param chartId - Chart ID
   * @returns ChartDefinition or null if not cached
   */
  async getChartDefinition(chartId: string): Promise<ChartDefinition | null> {
    // Key: analytics:chart:{chartId}
    const key = this.buildKey('chart', chartId);
    return await this.get<ChartDefinition>(key);
  }

  /**
   * Cache specific chart definition
   *
   * @param chartId - Chart ID
   * @param chart - Chart definition object
   * @returns true if successful
   */
  async setChartDefinition(chartId: string, chart: ChartDefinition): Promise<boolean> {
    // Key: analytics:chart:{chartId}
    const key = this.buildKey('chart', chartId);
    return await this.set(key, chart, { ttl: this.CHART_DEFINITION_TTL });
  }

  /**
   * Invalidate analytics cache
   *
   * @param resourceType - Type of resource ('datasource', 'dashboard', 'chart', or 'all')
   * @param resourceId - Optional specific resource ID
   */
  async invalidate(resourceType: string, resourceId?: string | number): Promise<void> {
    const keysToDelete: string[] = [];

    switch (resourceType) {
      case 'datasource':
        if (resourceId !== undefined) {
          // Invalidate specific data source columns
          keysToDelete.push(this.buildKey('datasource', resourceId, 'columns'));
        }
        break;

      case 'dashboard':
        if (resourceId) {
          // Invalidate specific dashboard
          keysToDelete.push(this.buildKey('dashboard', resourceId));
        }
        // Always invalidate dashboard list when a dashboard changes
        keysToDelete.push(this.buildKey('dashboard', 'list'));
        break;

      case 'chart':
        if (resourceId) {
          // Invalidate specific chart
          keysToDelete.push(this.buildKey('chart', resourceId));
        }
        // Always invalidate chart list when a chart changes
        keysToDelete.push(this.buildKey('chart', 'list'));
        break;

      case 'all': {
        // Scan and delete all analytics cache keys
        const pattern = `${this.namespace}:*`;
        const keys = await this.scan(pattern, 1000);
        keysToDelete.push(...keys);
        break;
      }
    }

    if (keysToDelete.length > 0) {
      await this.delMany(keysToDelete);

      log.debug('Analytics cache invalidated', {
        component: 'analytics-cache',
        resourceType,
        resourceId,
        keysInvalidated: keysToDelete.length,
      });
    }
  }

  /**
   * Invalidate data source columns cache
   *
   * @param dataSourceId - Data source ID
   */
  async invalidateDataSourceColumns(dataSourceId: number): Promise<void> {
    await this.invalidate('datasource', dataSourceId);
  }

  /**
   * Invalidate dashboard cache
   *
   * @param dashboardId - Dashboard ID (optional, invalidates list if not provided)
   */
  async invalidateDashboard(dashboardId?: string): Promise<void> {
    await this.invalidate('dashboard', dashboardId);
  }

  /**
   * Invalidate chart cache
   *
   * @param chartId - Chart ID (optional, invalidates list if not provided)
   */
  async invalidateChart(chartId?: string): Promise<void> {
    await this.invalidate('chart', chartId);
  }
}

// Export singleton instance
export const analyticsCache = new AnalyticsCacheService();
