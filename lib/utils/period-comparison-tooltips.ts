/**
 * Period Comparison Tooltip Utilities
 * Enhanced tooltip callbacks for charts with period comparison data
 */

import type { TooltipItem, TooltipModel } from 'chart.js';
import { formatValue } from './chart-data/formatters/value-formatter';

// Extended dataset type with custom properties
interface ExtendedDataset {
  label?: string;
  data?: unknown[];
  measureType?: string;
  [key: string]: unknown;
}

/**
 * Enhanced tooltip callback for period comparison charts
 */
export function createPeriodComparisonTooltipCallbacks(
  frequency: string = 'Monthly',
  _darkMode: boolean = false
) {
  return {
    title: function (this: TooltipModel<'bar'>, tooltipItems: TooltipItem<'bar'>[]) {
      // Format tooltip title based on frequency
      const date = new Date(tooltipItems[0]?.label || '');
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: frequency === 'Weekly' ? 'numeric' : undefined,
      });
    },
    label: function (this: TooltipModel<'bar'>, tooltipItem: TooltipItem<'bar'>) {
      // Get measure type from dataset metadata
      const dataset = tooltipItem.dataset as ExtendedDataset;
      const chartData = this.chart.data as { measureType?: string };
      const measureType = dataset?.measureType || chartData?.measureType || 'number';
      const parsed = tooltipItem.parsed as { x: number; y: number };
      const formattedValue = formatValue(parsed.y, measureType);

      // Check if this is a comparison dataset
      const isComparison =
        dataset.label?.includes('Previous') ||
        dataset.label?.includes('Last Year') ||
        dataset.label?.includes('Ago');

      // Add visual indicator for comparison data
      const prefix = isComparison ? '📊 ' : '📈 ';
      return `${prefix}${dataset.label}: ${formattedValue}`;
    },
    footer: function (this: TooltipModel<'bar'>, tooltipItems: TooltipItem<'bar'>[]) {
      // Calculate difference between current and comparison periods
      const currentData = tooltipItems.find((c) => {
        const dataset = c.dataset as ExtendedDataset;
        return (
          dataset.label?.includes('Current') ||
          (!dataset.label?.includes('Previous') &&
            !dataset.label?.includes('Last Year') &&
            !dataset.label?.includes('Ago'))
        );
      });
      const comparisonData = tooltipItems.find((c) => {
        const dataset = c.dataset as ExtendedDataset;
        return (
          dataset.label?.includes('Previous') ||
          dataset.label?.includes('Last Year') ||
          dataset.label?.includes('Ago')
        );
      });

      if (currentData && comparisonData) {
        const currentParsed = currentData.parsed as { x: number; y: number };
        const comparisonParsed = comparisonData.parsed as { x: number; y: number };
        const currentValue = currentParsed.y;
        const comparisonValue = comparisonParsed.y;
        const difference = currentValue - comparisonValue;
        const percentageChange = comparisonValue !== 0 ? (difference / comparisonValue) * 100 : 0;

        const currentDataset = currentData.dataset as ExtendedDataset;
        const measureType = currentDataset?.measureType || 'number';
        const formattedDifference = formatValue(
          Math.abs(difference),
          measureType
        );

        const changeIcon = difference >= 0 ? '📈' : '📉';
        const changeText = difference >= 0 ? 'increase' : 'decrease';

        return [
          '',
          `${changeIcon} ${changeText}: ${formattedDifference}`,
          `(${percentageChange >= 0 ? '+' : ''}${percentageChange.toFixed(1)}%)`,
        ];
      }

      return [];
    },
  };
}

/**
 * Enhanced tooltip callback for horizontal bar charts with period comparison
 */
export function createPeriodComparisonHorizontalTooltipCallbacks(_darkMode: boolean = false) {
  return {
    title: function (this: TooltipModel<'bar'>, tooltipItems: TooltipItem<'bar'>[]) {
      // Show the category label as title
      return tooltipItems[0]?.label || '';
    },
    label: function (this: TooltipModel<'bar'>, tooltipItem: TooltipItem<'bar'>) {
      // Get measure type from dataset metadata
      const dataset = tooltipItem.dataset as ExtendedDataset;
      const chartData = this.chart.data as { measureType?: string };
      const measureType = dataset?.measureType || chartData?.measureType || 'number';
      const parsed = tooltipItem.parsed as { x: number; y: number };
      const formattedValue = formatValue(parsed.x, measureType);

      // Check if this is a comparison dataset
      const isComparison =
        dataset.label?.includes('Previous') ||
        dataset.label?.includes('Last Year') ||
        dataset.label?.includes('Ago');

      // Add visual indicator for comparison data
      const prefix = isComparison ? '📊 ' : '📈 ';
      return `${prefix}${dataset.label}: ${formattedValue}`;
    },
    footer: function (this: TooltipModel<'bar'>, tooltipItems: TooltipItem<'bar'>[]) {
      // Calculate difference between current and comparison periods
      const currentData = tooltipItems.find((c) => {
        const dataset = c.dataset as ExtendedDataset;
        return (
          dataset.label?.includes('Current') ||
          (!dataset.label?.includes('Previous') &&
            !dataset.label?.includes('Last Year') &&
            !dataset.label?.includes('Ago'))
        );
      });
      const comparisonData = tooltipItems.find((c) => {
        const dataset = c.dataset as ExtendedDataset;
        return (
          dataset.label?.includes('Previous') ||
          dataset.label?.includes('Last Year') ||
          dataset.label?.includes('Ago')
        );
      });

      if (currentData && comparisonData) {
        const currentParsed = currentData.parsed as { x: number; y: number };
        const comparisonParsed = comparisonData.parsed as { x: number; y: number };
        const currentValue = currentParsed.x;
        const comparisonValue = comparisonParsed.x;
        const difference = currentValue - comparisonValue;
        const percentageChange = comparisonValue !== 0 ? (difference / comparisonValue) * 100 : 0;

        const currentDataset = currentData.dataset as ExtendedDataset;
        const measureType = currentDataset?.measureType || 'number';
        const formattedDifference = formatValue(
          Math.abs(difference),
          measureType
        );

        const changeIcon = difference >= 0 ? '📈' : '📉';
        const changeText = difference >= 0 ? 'increase' : 'decrease';

        return [
          '',
          `${changeIcon} ${changeText}: ${formattedDifference}`,
          `(${percentageChange >= 0 ? '+' : ''}${percentageChange.toFixed(1)}%)`,
        ];
      }

      return [];
    },
  };
}

/**
 * Enhanced tooltip callback for stacked bar charts with period comparison
 */
export function createPeriodComparisonStackedTooltipCallbacks(_darkMode: boolean = false) {
  return {
    title: () => '',
    label: function (this: TooltipModel<'bar'>, tooltipItem: TooltipItem<'bar'>) {
      // Get measure type from dataset metadata
      const dataset = tooltipItem.dataset as ExtendedDataset;
      const chartData = this.chart.data as { measureType?: string };
      const measureType = dataset?.measureType || chartData?.measureType || 'number';
      const parsed = tooltipItem.parsed as { x: number; y: number };
      const formattedValue = formatValue(parsed.y, measureType);

      // Check if this is a comparison dataset
      const isComparison =
        dataset.label?.includes('Previous') ||
        dataset.label?.includes('Last Year') ||
        dataset.label?.includes('Ago');

      // Add visual indicator for comparison data
      const prefix = isComparison ? '📊 ' : '📈 ';
      return `${prefix}${dataset.label}: ${formattedValue}`;
    },
    footer: function (this: TooltipModel<'bar'>, tooltipItems: TooltipItem<'bar'>[]) {
      // Calculate total for current period
      const currentTotal = tooltipItems
        .filter((item) => {
          const dataset = item.dataset as ExtendedDataset;
          return (
            dataset.label?.includes('Current') ||
            (!dataset.label?.includes('Previous') &&
              !dataset.label?.includes('Last Year') &&
              !dataset.label?.includes('Ago'))
          );
        })
        .reduce((sum, item) => {
          const parsed = item.parsed as { x: number; y: number };
          return sum + parsed.y;
        }, 0);

      // Calculate total for comparison period
      const comparisonTotal = tooltipItems
        .filter((item) => {
          const dataset = item.dataset as ExtendedDataset;
          return (
            dataset.label?.includes('Previous') ||
            dataset.label?.includes('Last Year') ||
            dataset.label?.includes('Ago')
          );
        })
        .reduce((sum, item) => {
          const parsed = item.parsed as { x: number; y: number };
          return sum + parsed.y;
        }, 0);

      const firstDataset = tooltipItems[0]?.dataset as ExtendedDataset;
      const measureType = firstDataset?.measureType || 'number';
      const formattedCurrentTotal = formatValue(
        currentTotal,
        measureType
      );

      const results = [`Current Total: ${formattedCurrentTotal}`];

      if (comparisonTotal > 0) {
        const difference = currentTotal - comparisonTotal;
        const percentageChange = (difference / comparisonTotal) * 100;
        const formattedComparisonTotal = formatValue(
          comparisonTotal,
          measureType
        );
        const formattedDifference = formatValue(
          Math.abs(difference),
          measureType
        );

        const changeIcon = difference >= 0 ? '📈' : '📉';
        const changeText = difference >= 0 ? 'increase' : 'decrease';

        results.push(
          `Previous Total: ${formattedComparisonTotal}`,
          '',
          `${changeIcon} ${changeText}: ${formattedDifference}`,
          `(${percentageChange >= 0 ? '+' : ''}${percentageChange.toFixed(1)}%)`
        );
      }

      return results;
    },
  };
}
