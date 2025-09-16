import { 
  type AppMeasure, 
  type ChartData, 
  type ChartDataset, 
  type ChartAxisConfig 
} from '@/lib/types/analytics';
import { getCssVariable } from '@/components/utils/utils';

/**
 * Client-Safe Chart Data Transformer Service
 * Transforms analytics data into Chart.js compatible format
 * This version is safe to use in client components (no server-side dependencies)
 */

export class ChartDataTransformer {

  /**
   * Transform measures data into Chart.js format
   */
  transformMeasuresData(
    measures: AppMeasure[],
    chartType: 'line' | 'bar' | 'pie' | 'doughnut' | 'area',
    groupBy?: string
  ): ChartData {

    if (measures.length === 0) {
      return { labels: [], datasets: [] };
    }

    switch (chartType) {
      case 'line':
      case 'area':
        return this.transformToTimeSeriesData(measures, groupBy, chartType === 'area');
      case 'bar':
        return this.transformToBarData(measures, groupBy);
      case 'pie':
      case 'doughnut':
        return this.transformToPieData(measures, groupBy);
      default:
        throw new Error(`Unsupported chart type: ${chartType}`);
    }
  }

  /**
   * Transform data for line/area charts (time series)
   */
  private transformToTimeSeriesData(
    measures: AppMeasure[], 
    groupBy?: string,
    filled: boolean = false
  ): ChartData {
    // Sort by date for proper time series
    const sortedMeasures = measures.sort((a, b) => 
      new Date(a.period_start).getTime() - new Date(b.period_start).getTime()
    );

    if (!groupBy) {
      // Single series - aggregate all data points by date
      const dataMap = new Map<string, number>();
      
      sortedMeasures.forEach(measure => {
        const dateKey = this.formatDateLabel(measure.period_start, measure.frequency);
        const currentValue = dataMap.get(dateKey) || 0;
        dataMap.set(dateKey, currentValue + measure.measure_value);
      });

      const labels = Array.from(dataMap.keys());
      const data = Array.from(dataMap.values());

      return {
        labels,
        datasets: [{
          label: sortedMeasures[0]?.measure || 'Value',
          data,
          borderColor: getCssVariable('--color-violet-500'),
          backgroundColor: filled ? 
            this.adjustColorOpacity(getCssVariable('--color-violet-500'), 0.1) : 
            getCssVariable('--color-violet-500'),
          fill: filled,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: getCssVariable('--color-violet-500'),
          pointHoverBackgroundColor: getCssVariable('--color-violet-600'),
          pointBorderWidth: 0,
          pointHoverBorderWidth: 0,
        }]
      };
    } else {
      // Multiple series - group by specified field
      return this.transformToMultiSeriesData(sortedMeasures, groupBy, filled);
    }
  }

  /**
   * Transform data for multiple series (grouped data)
   */
  private transformToMultiSeriesData(
    measures: AppMeasure[], 
    groupBy: string,
    filled: boolean = false
  ): ChartData {
    // Group data by the groupBy field and date
    const groupedData = new Map<string, Map<string, number>>();
    const allDates = new Set<string>();

    measures.forEach(measure => {
      const groupKey = this.getGroupValue(measure, groupBy);
      const dateKey = this.formatDateLabel(measure.period_start, measure.frequency);
      
      allDates.add(dateKey);
      
      if (!groupedData.has(groupKey)) {
        groupedData.set(groupKey, new Map());
      }
      
      const dateMap = groupedData.get(groupKey)!;
      const currentValue = dateMap.get(dateKey) || 0;
      dateMap.set(dateKey, currentValue + measure.measure_value);
    });

    // Sort dates chronologically
    const sortedDates = Array.from(allDates).sort((a, b) => 
      new Date(a).getTime() - new Date(b).getTime()
    );

    // Create datasets for each group
    const datasets: ChartDataset[] = [];
    const colors = this.getColorPalette();
    let colorIndex = 0;

    groupedData.forEach((dateMap, groupKey) => {
      const data = sortedDates.map(date => dateMap.get(date) || 0);
      const color = colors[colorIndex % colors.length];
      const safeColor = color || getCssVariable('--color-violet-500');

      datasets.push({
        label: groupKey,
        data,
        borderColor: safeColor,
        backgroundColor: filled ? this.adjustColorOpacity(safeColor, 0.1) : safeColor,
        fill: filled,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: safeColor,
        pointHoverBackgroundColor: this.adjustColorOpacity(safeColor, 0.8),
        pointBorderWidth: 0,
        pointHoverBorderWidth: 0,
      });

      colorIndex++;
    });

    return {
      labels: sortedDates,
      datasets
    };
  }

  /**
   * Transform data for bar charts
   */
  private transformToBarData(measures: AppMeasure[], groupBy?: string): ChartData {
    if (!groupBy) {
      // Aggregate by date
      const dataMap = new Map<string, number>();
      
      measures.forEach(measure => {
        const dateKey = this.formatDateLabel(measure.period_start, measure.frequency);
        const currentValue = dataMap.get(dateKey) || 0;
        dataMap.set(dateKey, currentValue + measure.measure_value);
      });

      const labels = Array.from(dataMap.keys()).sort();
      const data = labels.map(label => dataMap.get(label) || 0);

      return {
        labels,
        datasets: [{
          label: measures[0]?.measure || 'Value',
          data,
          backgroundColor: getCssVariable('--color-violet-500'),
          hoverBackgroundColor: getCssVariable('--color-violet-600'),
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.7,
        }]
      };
    } else {
      // Group by specified field
      const groupedData = new Map<string, number>();
      
      measures.forEach(measure => {
        const groupKey = this.getGroupValue(measure, groupBy);
        const currentValue = groupedData.get(groupKey) || 0;
        groupedData.set(groupKey, currentValue + measure.measure_value);
      });

      const labels = Array.from(groupedData.keys()).sort();
      const data = labels.map(label => groupedData.get(label) || 0);
      const colors = this.getColorPalette();

      return {
        labels,
        datasets: [{
          label: measures[0]?.measure || 'Value',
          data,
          backgroundColor: colors.slice(0, labels.length),
          hoverBackgroundColor: colors.slice(0, labels.length).map(color => 
            this.adjustColorOpacity(color, 0.8)
          ),
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.7,
        }]
      };
    }
  }

  /**
   * Transform data for pie/doughnut charts
   */
  private transformToPieData(measures: AppMeasure[], groupBy?: string): ChartData {
    const groupField = groupBy || 'practice_uid';
    const groupedData = new Map<string, number>();
    
    measures.forEach(measure => {
      const groupKey = this.getGroupValue(measure, groupField);
      const currentValue = groupedData.get(groupKey) || 0;
      groupedData.set(groupKey, currentValue + measure.measure_value);
    });

    const labels = Array.from(groupedData.keys());
    const data = labels.map(label => groupedData.get(label) || 0);
    const colors = this.getColorPalette();

    return {
      labels,
      datasets: [{
        label: measures[0]?.measure || 'Value',
        data,
        backgroundColor: colors.slice(0, labels.length),
        hoverBackgroundColor: colors.slice(0, labels.length).map(color => 
          this.adjustColorOpacity(color, 0.8)
        ),
        borderWidth: 0,
      }]
    };
  }

  /**
   * Get value for grouping from measure object
   */
  private getGroupValue(measure: AppMeasure, groupBy: string): string {
    switch (groupBy) {
      case 'practice_uid':
        return measure.practice_uid || 'Unknown Practice';
      case 'provider_uid':
        return measure.provider_uid || 'Unknown Provider';
      case 'measure':
        return measure.measure;
      case 'frequency':
        return measure.frequency;
      default:
        return 'Unknown';
    }
  }

  /**
   * Format date label based on frequency
   */
  private formatDateLabel(dateString: string, frequency: string): string {
    const date = new Date(dateString);
    
    switch (frequency) {
      case 'Monthly':
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      case 'Weekly':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case 'Quarterly': {
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        return `Q${quarter} ${date.getFullYear()}`;
      }
      default:
        return date.toLocaleDateString('en-US');
    }
  }

  /**
   * Get color palette for charts
   */
  private getColorPalette(): string[] {
    return [
      getCssVariable('--color-violet-500'),
      getCssVariable('--color-sky-500'),
      getCssVariable('--color-green-500'),
      getCssVariable('--color-yellow-500'),
      getCssVariable('--color-red-500'),
      getCssVariable('--color-pink-500'),
      getCssVariable('--color-indigo-500'),
      getCssVariable('--color-orange-500'),
    ];
  }

  /**
   * Adjust color opacity
   */
  private adjustColorOpacity(color: string, opacity: number): string {
    // Simple opacity adjustment - in production you might want a more robust solution
    if (color.startsWith('rgb(')) {
      return color.replace('rgb(', 'rgba(').replace(')', `, ${opacity})`);
    }
    
    // For hex colors, convert to rgba
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  /**
   * Format value based on axis configuration
   */
  formatValue(value: number, format: ChartAxisConfig['format']): string {
    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(value);
      
      case 'percentage':
        return `${(value * 100).toFixed(1)}%`;
      
      case 'number':
        return new Intl.NumberFormat('en-US').format(value);
      
      default:
        return value.toString();
    }
  }

  /**
   * Create practice revenue trend chart data (common use case)
   */
  createPracticeRevenueTrendData(measures: AppMeasure[]): ChartData {
    return this.transformMeasuresData(measures, 'line', 'practice_uid');
  }

  /**
   * Create provider performance comparison chart data
   */
  createProviderComparisonData(measures: AppMeasure[]): ChartData {
    return this.transformMeasuresData(measures, 'bar', 'provider_uid');
  }
}

// Export singleton instance
export const chartDataTransformer = new ChartDataTransformer();
