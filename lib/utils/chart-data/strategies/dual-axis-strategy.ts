/**
 * Dual-Axis Strategy
 * 
 * Handles transformation for dual-axis combo charts (bar + line).
 * Primary measure on left y-axis, secondary measure on right y-axis.
 */

import type { AggAppMeasure, ChartData, ChartDataset } from '@/lib/types/analytics';
import { BaseChartTransformStrategy, type TransformConfig } from './base-strategy';
import { getCssVariable } from '@/components/utils/utils';
import { toMMDDYYYY } from '../formatters/date-formatter';
import { getColorPalette } from '../services/chart-color-service';

/**
 * Configuration for dual-axis charts
 */
interface DualAxisConfig extends TransformConfig {
  primaryLabel?: string;
  secondaryLabel?: string;
  secondaryChartType?: 'line' | 'bar';
}

/**
 * Dual-Axis Chart Transformation Strategy
 * Creates combo charts with two y-axes
 */
export class DualAxisStrategy extends BaseChartTransformStrategy {
  readonly type = 'dual-axis';

  canHandle(chartType: string): boolean {
    return chartType === 'dual-axis' || chartType === 'combo';
  }

  validate(config: DualAxisConfig): { isValid: boolean; errors: string[] } {
    const baseValidation = super.validate(config);
    const errors = [...baseValidation.errors];

    // Dual-axis specific validation can be added here

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  transform(measures: AggAppMeasure[], config: DualAxisConfig): ChartData {
    if (measures.length === 0) {
      return { labels: [], datasets: [] };
    }

    const paletteId = this.getPaletteId(config);
    const primaryLabel = config.primaryLabel || 'Primary';
    const secondaryLabel = config.secondaryLabel || 'Secondary';
    const secondaryChartType = config.secondaryChartType || 'line';

    // Separate primary and secondary measures by series_id
    const primaryMeasures = measures.filter((m) => m.series_id === 'primary');
    const secondaryMeasures = measures.filter((m) => m.series_id === 'secondary');

    // Collect and sort all unique dates from both measure sets
    const sortedDates = this.extractAndSortDates([...primaryMeasures, ...secondaryMeasures]);

    // Create date labels
    const labels = sortedDates.map((dateStr) => toMMDDYYYY(dateStr));

    // Get color palette
    const colors = getColorPalette(paletteId);

    // Build data map for primary measure
    const primaryDataMap = new Map<string, number>();
    primaryMeasures.forEach((m) => {
      const rawValue = m.measure_value ?? m.numeric_value ?? 0;
      const value = this.parseValue(typeof rawValue === 'string' || typeof rawValue === 'number' ? rawValue : 0);
      primaryDataMap.set((m.date_index ?? m.date_value ?? '') as string, value);
    });

    // Build data map for secondary measure
    const secondaryDataMap = new Map<string, number>();
    secondaryMeasures.forEach((m) => {
      const rawValue = m.measure_value ?? m.numeric_value ?? 0;
      const value = this.parseValue(typeof rawValue === 'string' || typeof rawValue === 'number' ? rawValue : 0);
      secondaryDataMap.set((m.date_index ?? m.date_value ?? '') as string, value);
    });

    // Extract measure types
    const primaryMeasureType = this.extractMeasureType(primaryMeasures);
    const secondaryMeasureType = this.extractMeasureType(secondaryMeasures);

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
        backgroundColor:
          secondaryChartType === 'line'
            ? 'transparent'
            : colors[1] || getCssVariable('--color-cyan-500'),
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

    const chartData: ChartData = {
      labels,
      datasets,
      measureType: primaryMeasureType, // Use primary as default
    };

    return chartData;
  }
}

