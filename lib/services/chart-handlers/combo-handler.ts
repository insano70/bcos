import type { ChartData, ChartDataset, DualAxisConfig } from '@/lib/types/analytics';
import { MeasureAccessor } from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';
import { getPaletteColors } from '@/lib/services/color-palettes';
import { getCssVariable } from '@/components/utils/utils';
import { BaseChartHandler } from './base-handler';
import { getResolvedColumns } from './column-resolver';
import { columnMappingService } from '../column-mapping-service';

/**
 * Combo Chart Handler
 * Handles dual-axis charts combining multiple chart types (e.g., bar + line)
 */
export class ComboChartHandler extends BaseChartHandler {
  type = 'dual-axis';

  canHandle(config: Record<string, unknown>): boolean {
    const chartType = config.chartType as string;
    return chartType === 'dual-axis';
  }

  /**
   * Fetch data for dual-axis charts
   * Phase 3.3: Fetch both measures in parallel server-side
   *
   * @param config - Chart configuration with dualAxisConfig
   * @param userContext - User context for RBAC
   * @returns Combined data from both measures tagged with series_id
   */
  async fetchData(config: Record<string, unknown>, userContext: UserContext): Promise<Record<string, unknown>[]> {
    const startTime = Date.now();

    // Dual-axis charts require two separate data fetches for primary and secondary measures
    const dualAxisConfig = config.dualAxisConfig as DualAxisConfig | undefined;

    if (!dualAxisConfig) {
      throw new Error('Dual-axis charts require dualAxisConfig');
    }

    try {
      // Phase 3.3: Fetch both measures in PARALLEL (previously sequential)
      const primaryConfig = {
        ...config,
        measure: dualAxisConfig.primary.measure,
      };

      const secondaryConfig = {
        ...config,
        measure: dualAxisConfig.secondary.measure,
      };

      log.info('Fetching dual-axis data in parallel', {
        chartType: 'dual-axis',
        primaryMeasure: dualAxisConfig.primary.measure,
        secondaryMeasure: dualAxisConfig.secondary.measure,
        userId: userContext.user_id,
      });

      // Fetch both datasets in parallel for performance
      const [primaryData, secondaryData] = await Promise.all([
        super.fetchData(primaryConfig, userContext),
        super.fetchData(secondaryConfig, userContext),
      ]);

      // Tag data with series_id for transformation
      const taggedPrimaryData = primaryData.map((record: Record<string, unknown>) => ({
        ...record,
        series_id: 'primary',
      }));

      const taggedSecondaryData = secondaryData.map((record: Record<string, unknown>) => ({
        ...record,
        series_id: 'secondary',
      }));

      const duration = Date.now() - startTime;

      log.info('Dual-axis data fetched successfully', {
        primaryCount: primaryData.length,
        secondaryCount: secondaryData.length,
        totalCount: taggedPrimaryData.length + taggedSecondaryData.length,
        duration,
        parallelFetch: true,
      });

      // Combine both datasets
      return [...taggedPrimaryData, ...taggedSecondaryData];
    } catch (error) {
      log.error('Failed to fetch dual-axis chart data', error, {
        chartType: 'dual-axis',
        userId: userContext.user_id,
        duration: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Transform dual-axis chart data
   * Phase 3.3: Direct transformation without SimplifiedChartTransformer
   *
   * Combines primary and secondary measures into a unified ChartData structure
   * with proper axis assignments for dual-axis rendering.
   *
   * @param data - Combined data from both measures tagged with series_id
   * @param config - Chart configuration with dualAxisConfig
   * @returns ChartData ready for Chart.js rendering
   */
  async transform(data: Record<string, unknown>[], config: Record<string, unknown>): Promise<ChartData> {
    const startTime = Date.now();

    const dualAxisConfig = config.dualAxisConfig as DualAxisConfig;
    const colorPalette = (config.colorPalette as string) || 'default';

    // Use data source configuration to get column names
    const columns = await getResolvedColumns(config.dataSourceId as number | undefined);
    const dateColumn = columns.dateColumn;
    const measureColumn = columns.measureColumn;

    log.debug('Resolved columns for dual-axis chart', {
      dataSourceId: config.dataSourceId,
      dateColumn,
      measureColumn,
    });

    // Split data by series
    const primaryData = data.filter((record) => record.series_id === 'primary');
    const secondaryData = data.filter((record) => record.series_id === 'secondary');

    if (primaryData.length === 0 && secondaryData.length === 0) {
      log.warn('No data available for dual-axis chart transformation');
      return { labels: [], datasets: [] };
    }

    // Collect all unique dates from both measure sets
    const allDatesSet = new Set<string>();
    for (const measure of primaryData) {
      const dateValue = measure[dateColumn];
      if (dateValue) {
        allDatesSet.add(String(dateValue));
      }
    }
    for (const measure of secondaryData) {
      const dateValue = measure[dateColumn];
      if (dateValue) {
        allDatesSet.add(String(dateValue));
      }
    }

    // Sort dates chronologically
    const sortedDates = Array.from(allDatesSet).sort(
      (a, b) => new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()
    );

    // Create date label map for Chart.js (format: MM-DD-YYYY)
    const labels = sortedDates.map((dateStr) => {
      const date = new Date(`${dateStr}T12:00:00Z`);
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const year = date.getUTCFullYear();
      return `${month}-${day}-${year}`;
    });

    // Get color palette
    const colors = getPaletteColors(colorPalette);

    // Build data map for primary measure
    const primaryDataMap = new Map<string, number>();
    for (const measure of primaryData) {
      const dateValue = measure[dateColumn];
      const measureValue = measure[measureColumn];
      const value = typeof measureValue === 'string'
        ? Number.parseFloat(measureValue)
        : (measureValue as number || 0);
      if (dateValue) {
        primaryDataMap.set(String(dateValue), value);
      }
    }

    // Build data map for secondary measure
    const secondaryDataMap = new Map<string, number>();
    for (const measure of secondaryData) {
      const dateValue = measure[dateColumn];
      const measureValue = measure[measureColumn];
      const value = typeof measureValue === 'string'
        ? Number.parseFloat(measureValue)
        : (measureValue as number || 0);
      if (dateValue) {
        secondaryDataMap.set(String(dateValue), value);
      }
    }

    // Extract measure types using MeasureAccessor
    let primaryMeasureType = 'number';
    let secondaryMeasureType = 'number';
    
    if (config.dataSourceId) {
      try {
        const mapping = await columnMappingService.getMapping(config.dataSourceId as number);
        
        if (primaryData.length > 0 && primaryData[0]) {
          const primaryAccessor = new MeasureAccessor(primaryData[0] as unknown as import('@/lib/types/analytics').AggAppMeasure, mapping);
          primaryMeasureType = primaryAccessor.getMeasureType();
        }
        
        if (secondaryData.length > 0 && secondaryData[0]) {
          const secondaryAccessor = new MeasureAccessor(secondaryData[0] as unknown as import('@/lib/types/analytics').AggAppMeasure, mapping);
          secondaryMeasureType = secondaryAccessor.getMeasureType();
        }
      } catch (error) {
        log.warn('Failed to get measure types from accessor, using defaults', { error });
      }
    }

    // Get labels for axes
    const primaryLabel = dualAxisConfig.primary.axisLabel || dualAxisConfig.primary.measure;
    const secondaryLabel = dualAxisConfig.secondary.axisLabel || dualAxisConfig.secondary.measure;
    const secondaryChartType = dualAxisConfig.secondary.chartType;

    // Create datasets
    const datasets: ChartDataset[] = [
      // Primary dataset (bar chart, left axis)
      {
        label: primaryLabel,
        type: 'bar',
        data: sortedDates.map((date) => primaryDataMap.get(date) ?? 0),
        backgroundColor: colors[0] || getCssVariable('--color-violet-500'),
        borderColor: colors[0] || getCssVariable('--color-violet-500'),
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.6,
        categoryPercentage: 0.7,
        yAxisID: 'y-left',
        measureType: primaryMeasureType,
        order: 2, // Draw bars first (behind lines)
      },
      // Secondary dataset (line or bar, right axis)
      {
        label: secondaryLabel,
        type: secondaryChartType,
        data: sortedDates.map((date) => secondaryDataMap.get(date) ?? 0),
        backgroundColor: secondaryChartType === 'line'
          ? 'transparent'
          : (colors[1] || getCssVariable('--color-cyan-500')),
        borderColor: colors[1] || getCssVariable('--color-cyan-500'),
        borderWidth: 2,
        ...(secondaryChartType === 'line'
          ? {
              tension: 0.4,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: colors[1] || getCssVariable('--color-cyan-500'),
              pointBorderColor: '#fff',
              pointBorderWidth: 2,
            }
          : {
              borderRadius: 4,
              barPercentage: 0.6,
              categoryPercentage: 0.7,
            }),
        yAxisID: 'y-right',
        measureType: secondaryMeasureType,
        order: 1, // Draw line on top
      },
    ];

    const duration = Date.now() - startTime;

    log.info('Dual-axis data transformation completed', {
      labelCount: labels.length,
      primaryDataPoints: primaryData.length,
      secondaryDataPoints: secondaryData.length,
      primaryMeasureType,
      secondaryMeasureType,
      duration,
    });

    return {
      labels,
      datasets,
      measureType: primaryMeasureType, // Use primary as default
    };
  }

  protected validateCustom(config: Record<string, unknown>): string[] {
    const errors: string[] = [];

    // Dual-axis charts require dualAxisConfig
    if (!config.dualAxisConfig) {
      errors.push('Dual-axis charts require dualAxisConfig with primary and secondary axis configuration');
      return errors; // Return early if no config
    }

    const dualAxisConfig = config.dualAxisConfig as DualAxisConfig;

    // Validate primary axis configuration
    if (!dualAxisConfig.primary) {
      errors.push('dualAxisConfig.primary is required');
    } else {
      if (!dualAxisConfig.primary.measure) {
        errors.push('dualAxisConfig.primary.measure is required');
      }
      if (dualAxisConfig.primary.chartType !== 'bar') {
        errors.push('dualAxisConfig.primary.chartType must be "bar"');
      }
      if (dualAxisConfig.primary.axisPosition !== 'left') {
        errors.push('dualAxisConfig.primary.axisPosition must be "left"');
      }
    }

    // Validate secondary axis configuration
    if (!dualAxisConfig.secondary) {
      errors.push('dualAxisConfig.secondary is required');
    } else {
      if (!dualAxisConfig.secondary.measure) {
        errors.push('dualAxisConfig.secondary.measure is required');
      }
      if (dualAxisConfig.secondary.chartType !== 'line' && dualAxisConfig.secondary.chartType !== 'bar') {
        errors.push('dualAxisConfig.secondary.chartType must be "line" or "bar"');
      }
      if (dualAxisConfig.secondary.axisPosition !== 'right') {
        errors.push('dualAxisConfig.secondary.axisPosition must be "right"');
      }
    }

    // Dual-axis charts don't support multiple series (they already have two series)
    if (config.multipleSeries && Array.isArray(config.multipleSeries) && config.multipleSeries.length > 0) {
      errors.push('Dual-axis charts do not support multipleSeries (they already have primary and secondary series)');
    }

    // Dual-axis charts don't support period comparison
    if (config.periodComparison) {
      errors.push('Dual-axis charts do not support period comparison');
    }

    return errors;
  }
}
