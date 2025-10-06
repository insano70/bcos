/**
 * Period Comparison Tooltip Utilities
 * Enhanced tooltip callbacks for charts with period comparison data
 */

import { simplifiedChartTransformer } from './simplified-chart-transformer';

export interface PeriodComparisonTooltipContext {
  chart: any;
  dataIndex: number;
  dataset: any;
  parsed: { x: number; y: number };
  label: string;
}

/**
 * Enhanced tooltip callback for period comparison charts
 */
export function createPeriodComparisonTooltipCallbacks(
  frequency: string = 'Monthly',
  _darkMode: boolean = false
) {
  return {
    title: (context: PeriodComparisonTooltipContext[]) => {
      // Format tooltip title based on frequency
      const date = new Date(context[0]?.label || '');
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: frequency === 'Weekly' ? 'numeric' : undefined
      });
    },
    label: (context: PeriodComparisonTooltipContext) => {
      // Get measure type from dataset metadata
      const measureType = context.dataset?.measureType || 
                         context.chart.data?.measureType || 
                         'number';
      const formattedValue = simplifiedChartTransformer.formatValue(context.parsed.y, measureType);
      
      // Check if this is a comparison dataset
      const isComparison = context.dataset.label?.includes('Previous') || 
                          context.dataset.label?.includes('Last Year') ||
                          context.dataset.label?.includes('Ago');
      
      // Add visual indicator for comparison data
      const prefix = isComparison ? '📊 ' : '📈 ';
      return `${prefix}${context.dataset.label}: ${formattedValue}`;
    },
    footer: (context: PeriodComparisonTooltipContext[]) => {
      // Calculate difference between current and comparison periods
      const currentData = context.find(c => 
        c.dataset.label?.includes('Current') || 
        (!c.dataset.label?.includes('Previous') && !c.dataset.label?.includes('Last Year') && !c.dataset.label?.includes('Ago'))
      );
      const comparisonData = context.find(c => 
        c.dataset.label?.includes('Previous') || 
        c.dataset.label?.includes('Last Year') ||
        c.dataset.label?.includes('Ago')
      );

      if (currentData && comparisonData) {
        const currentValue = currentData.parsed.y;
        const comparisonValue = comparisonData.parsed.y;
        const difference = currentValue - comparisonValue;
        const percentageChange = comparisonValue !== 0 ? (difference / comparisonValue) * 100 : 0;

        const measureType = currentData.dataset?.measureType || 'number';
        const formattedDifference = simplifiedChartTransformer.formatValue(Math.abs(difference), measureType);
        
        const changeIcon = difference >= 0 ? '📈' : '📉';
        const changeText = difference >= 0 ? 'increase' : 'decrease';
        
        return [
          '',
          `${changeIcon} ${changeText}: ${formattedDifference}`,
          `(${percentageChange >= 0 ? '+' : ''}${percentageChange.toFixed(1)}%)`
        ];
      }

      return [];
    }
  };
}

/**
 * Enhanced tooltip callback for horizontal bar charts with period comparison
 */
export function createPeriodComparisonHorizontalTooltipCallbacks(
  _darkMode: boolean = false
) {
  return {
    title: (context: PeriodComparisonTooltipContext[]) => {
      // Show the category label as title
      return context[0]?.label || '';
    },
    label: (context: PeriodComparisonTooltipContext) => {
      // Get measure type from dataset metadata
      const measureType = context.dataset?.measureType || 
                         context.chart.data?.measureType || 
                         'number';
      const formattedValue = simplifiedChartTransformer.formatValue(context.parsed.x, measureType);
      
      // Check if this is a comparison dataset
      const isComparison = context.dataset.label?.includes('Previous') || 
                          context.dataset.label?.includes('Last Year') ||
                          context.dataset.label?.includes('Ago');
      
      // Add visual indicator for comparison data
      const prefix = isComparison ? '📊 ' : '📈 ';
      return `${prefix}${context.dataset.label}: ${formattedValue}`;
    },
    footer: (context: PeriodComparisonTooltipContext[]) => {
      // Calculate difference between current and comparison periods
      const currentData = context.find(c => 
        c.dataset.label?.includes('Current') || 
        (!c.dataset.label?.includes('Previous') && !c.dataset.label?.includes('Last Year') && !c.dataset.label?.includes('Ago'))
      );
      const comparisonData = context.find(c => 
        c.dataset.label?.includes('Previous') || 
        c.dataset.label?.includes('Last Year') ||
        c.dataset.label?.includes('Ago')
      );

      if (currentData && comparisonData) {
        const currentValue = currentData.parsed.x;
        const comparisonValue = comparisonData.parsed.x;
        const difference = currentValue - comparisonValue;
        const percentageChange = comparisonValue !== 0 ? (difference / comparisonValue) * 100 : 0;

        const measureType = currentData.dataset?.measureType || 'number';
        const formattedDifference = simplifiedChartTransformer.formatValue(Math.abs(difference), measureType);
        
        const changeIcon = difference >= 0 ? '📈' : '📉';
        const changeText = difference >= 0 ? 'increase' : 'decrease';
        
        return [
          '',
          `${changeIcon} ${changeText}: ${formattedDifference}`,
          `(${percentageChange >= 0 ? '+' : ''}${percentageChange.toFixed(1)}%)`
        ];
      }

      return [];
    }
  };
}

/**
 * Enhanced tooltip callback for stacked bar charts with period comparison
 */
export function createPeriodComparisonStackedTooltipCallbacks(
  _darkMode: boolean = false
) {
  return {
    title: () => '',
    label: (context: PeriodComparisonTooltipContext) => {
      // Get measure type from dataset metadata
      const measureType = context.dataset?.measureType || 
                         context.chart.data?.measureType || 
                         'number';
      const formattedValue = simplifiedChartTransformer.formatValue(context.parsed.y, measureType);
      
      // Check if this is a comparison dataset
      const isComparison = context.dataset.label?.includes('Previous') || 
                          context.dataset.label?.includes('Last Year') ||
                          context.dataset.label?.includes('Ago');
      
      // Add visual indicator for comparison data
      const prefix = isComparison ? '📊 ' : '📈 ';
      return `${prefix}${context.dataset.label}: ${formattedValue}`;
    },
    footer: (tooltipItems: PeriodComparisonTooltipContext[]) => {
      // Calculate total for current period
      const currentTotal = tooltipItems
        .filter(item => 
          item.dataset.label?.includes('Current') || 
          (!item.dataset.label?.includes('Previous') && !item.dataset.label?.includes('Last Year') && !item.dataset.label?.includes('Ago'))
        )
        .reduce((sum, item) => sum + item.parsed.y, 0);

      // Calculate total for comparison period
      const comparisonTotal = tooltipItems
        .filter(item => 
          item.dataset.label?.includes('Previous') || 
          item.dataset.label?.includes('Last Year') ||
          item.dataset.label?.includes('Ago')
        )
        .reduce((sum, item) => sum + item.parsed.y, 0);

      const measureType = tooltipItems[0]?.dataset?.measureType || 'number';
      const formattedCurrentTotal = simplifiedChartTransformer.formatValue(currentTotal, measureType);
      
      const results = [`Current Total: ${formattedCurrentTotal}`];

      if (comparisonTotal > 0) {
        const difference = currentTotal - comparisonTotal;
        const percentageChange = (difference / comparisonTotal) * 100;
        const formattedComparisonTotal = simplifiedChartTransformer.formatValue(comparisonTotal, measureType);
        const formattedDifference = simplifiedChartTransformer.formatValue(Math.abs(difference), measureType);
        
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
    }
  };
}
