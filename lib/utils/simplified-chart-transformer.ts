import { 
  type AggAppMeasure, 
  type ChartData, 
  type ChartDataset
} from '@/lib/types/analytics';
import { getCssVariable } from '@/components/utils/utils';

/**
 * Simplified Chart Data Transformer
 * Works with pre-aggregated data from ih.agg_app_measures
 * No complex grouping or calculations needed
 */

export class SimplifiedChartTransformer {

  /**
   * Transform pre-aggregated data to Chart.js format
   */
  transformData(
    measures: AggAppMeasure[],
    chartType: 'line' | 'bar' | 'pie' | 'doughnut' | 'area',
    groupBy: 'provider_name' | 'practice' | 'measure' | 'none' = 'none'
  ): ChartData {

    if (measures.length === 0) {
      return { labels: [], datasets: [] };
    }

    console.log('🔍 SIMPLIFIED TRANSFORMATION:', {
      recordCount: measures.length,
      chartType,
      groupBy,
      sampleRecord: measures[0]
    });

    switch (chartType) {
      case 'line':
      case 'area':
        return this.createTimeSeriesChart(measures, groupBy, chartType === 'area');
      case 'bar':
        return this.createBarChart(measures, groupBy);
      case 'pie':
      case 'doughnut':
        return this.createPieChart(measures, groupBy);
      default:
        throw new Error(`Unsupported chart type: ${chartType}`);
    }
  }

  /**
   * Create time series chart (line/area)
   */
  private createTimeSeriesChart(
    measures: AggAppMeasure[], 
    groupBy: string,
    filled: boolean = false
  ): ChartData {
    
    if (groupBy === 'none') {
      // Single series - use date_index as actual dates for Chart.js time axis
      const sortedMeasures = measures.sort((a, b) => 
        new Date(a.date_index + 'T00:00:00').getTime() - new Date(b.date_index + 'T00:00:00').getTime()
      );

      return {
        labels: sortedMeasures.map(m => m.date_index), // Use actual dates for Chart.js
        datasets: [{
          label: sortedMeasures[0]?.measure || 'Value',
          data: sortedMeasures.map(m => typeof m.measure_value === 'string' ? parseFloat(m.measure_value) : m.measure_value),
          borderColor: getCssVariable('--color-violet-500'),
          backgroundColor: filled ? 
            this.adjustColorOpacity(getCssVariable('--color-violet-500'), 0.1) : 
            getCssVariable('--color-violet-500'),
          fill: filled,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
        }]
      };
    } else {
      // Multiple series - group by specified field
      return this.createMultiSeriesChart(measures, groupBy, filled);
    }
  }

  /**
   * Create bar chart
   */
  private createBarChart(measures: AggAppMeasure[], groupBy: string): ChartData {
    
    if (groupBy === 'none') {
      // Single series - use date_index as actual dates for Chart.js time axis
      const sortedMeasures = measures.sort((a, b) => 
        new Date(a.date_index + 'T00:00:00').getTime() - new Date(b.date_index + 'T00:00:00').getTime()
      );

      return {
        labels: sortedMeasures.map(m => m.date_index), // Use actual dates for Chart.js
        datasets: [{
          label: sortedMeasures[0]?.measure || 'Value',
          data: sortedMeasures.map(m => typeof m.measure_value === 'string' ? parseFloat(m.measure_value) : m.measure_value),
          backgroundColor: getCssVariable('--color-violet-500'),
          hoverBackgroundColor: getCssVariable('--color-violet-600'),
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.7,
        }]
      };
    } else {
      // Multiple series - group by provider/practice
      return this.createMultiSeriesChart(measures, groupBy, false);
    }
  }

  /**
   * Create multi-series chart (multiple providers/practices)
   */
  private createMultiSeriesChart(
    measures: AggAppMeasure[], 
    groupBy: string,
    filled: boolean = false
  ): ChartData {
    
    // Group data by the groupBy field and date
    const groupedData = new Map<string, Map<string, number>>();
    const allDates = new Set<string>();

    measures.forEach(measure => {
      const groupKey = this.getGroupValue(measure, groupBy);
      const dateKey = measure.date_index; // Use date_index for proper sorting
      
      allDates.add(dateKey);
      
      if (!groupedData.has(groupKey)) {
        groupedData.set(groupKey, new Map());
      }
      
      const dateMap = groupedData.get(groupKey)!;
      // Convert string values to numbers
      const measureValue = typeof measure.measure_value === 'string' 
        ? parseFloat(measure.measure_value) 
        : measure.measure_value;
      dateMap.set(dateKey, measureValue);
    });

    // Sort dates chronologically using date_index
    const sortedDates = Array.from(allDates).sort((a, b) => {
      return new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime();
    });

    console.log('🔍 DATE PROCESSING:', {
      sortedDateIndexes: sortedDates,
      sampleDate: sortedDates[0],
      parsedSampleDate: new Date(sortedDates[0] + 'T00:00:00')
    });

    console.log('🔍 MULTI-SERIES DATA:', {
      groupBy,
      sortedDates,
      groupCount: groupedData.size,
      groups: Array.from(groupedData.keys()),
      sampleGroupData: Array.from(groupedData.entries())[0]
    });

    // Create datasets for each group
    const datasets: ChartDataset[] = [];
    const colors = this.getColorPalette();
    let colorIndex = 0;

    groupedData.forEach((dateMap, groupKey) => {
      const data = sortedDates.map(dateIndex => dateMap.get(dateIndex) || 0);
      const color = colors[colorIndex % colors.length];

      console.log('🔍 CREATING DATASET:', {
        groupKey,
        color,
        dataPoints: data,
        dateMapSize: dateMap.size,
        dateMapEntries: Array.from(dateMap.entries())
      });

      datasets.push({
        label: groupKey,
        data,
        borderColor: color,
        backgroundColor: color, // Remove filled logic for bar charts
        fill: filled,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.7,
      });

      colorIndex++;
    });

    return {
      labels: sortedDates, // Use date_index for Chart.js time axis
      datasets
    };
  }

  /**
   * Create pie/doughnut chart
   */
  private createPieChart(measures: AggAppMeasure[], groupBy: string): ChartData {
    const groupField = groupBy === 'none' ? 'measure' : groupBy;
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
  private getGroupValue(measure: AggAppMeasure, groupBy: string): string {
    switch (groupBy) {
      case 'practice':
        return measure.practice || 'Unknown Practice';
      case 'practice_primary':
        return measure.practice_primary || 'Unknown Practice';
      case 'provider_name':
        return measure.provider_name || 'Unknown Provider';
      case 'measure':
        return measure.measure;
      case 'frequency':
        return measure.frequency;
      default:
        return 'Unknown';
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
   * Format value based on measure type
   */
  formatValue(value: number, measureType: string): string {
    switch (measureType) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(value);
      
      case 'count':
        return new Intl.NumberFormat('en-US').format(value);
      
      default:
        return value.toString();
    }
  }
}

// Export singleton instance
export const simplifiedChartTransformer = new SimplifiedChartTransformer();
