import type { 
  AggAppMeasure, 
  ChartData, 
  ChartDataset
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
    groupBy: string = 'none'
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
      // Single series - use MM-DD-YYYY format for LineChart01
      const sortedMeasures = measures.sort((a, b) => 
        new Date(a.date_index + 'T00:00:00').getTime() - new Date(b.date_index + 'T00:00:00').getTime()
      );

      // Handle dates based on frequency
      const dateObjects = sortedMeasures.map(m => {
        const date = new Date(m.date_index + 'T12:00:00Z');
        
        // Only convert to month-start for Monthly/Quarterly data
        // Keep actual dates for Weekly data  
        if (m.frequency === 'Weekly') {
          return date; // Use actual weekly dates
        } else {
          // For Monthly/Quarterly, convert to first day of month for Chart.js
          return new Date(date.getUTCFullYear(), date.getUTCMonth(), 1, 12, 0, 0);
        }
      });

      console.log('🔍 SINGLE SERIES TIME LABELS:', {
        originalDates: sortedMeasures.map(m => m.date_index),
        dateObjects: dateObjects,
        sampleConversion: {
          original: sortedMeasures[0]?.date_index,
          dateObject: dateObjects[0]
        }
      });

      return {
        labels: dateObjects, // Use Date objects for proper time axis
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
      return this.createMultiSeriesChart(measures, groupBy, filled, true);
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
        labels: sortedMeasures.map(m => {
          const date = new Date(m.date_index + 'T12:00:00Z');
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const day = String(date.getUTCDate()).padStart(2, '0');
          const year = date.getUTCFullYear();
          return `${month}-${day}-${year}`;
        }), // Convert to MM-DD-YYYY format
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
    filled: boolean = false,
    isTimeSeries: boolean = false
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

    // Filter out dates where no providers have data (all values would be 0)
    const datesWithData = sortedDates.filter(dateIndex => {
      return Array.from(groupedData.values()).some(dateMap => {
        const value = dateMap.get(dateIndex) || 0;
        return value > 0;
      });
    });

    console.log('🔍 DATE FILTERING:', {
      allDates: sortedDates,
      datesWithData: datesWithData,
      filteredOut: sortedDates.filter(d => !datesWithData.includes(d))
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
      const data = datesWithData.map(dateIndex => dateMap.get(dateIndex) || 0);
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
        borderColor: color || '#00AEEF',
        backgroundColor: color || '#00AEEF', // Ensure color is always defined
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

    console.log('🔍 FINAL CHART DATA:', {
      labels: sortedDates,
      labelCount: sortedDates.length,
      datasetCount: datasets.length,
      sampleLabels: sortedDates.slice(0, 3),
      lastLabels: sortedDates.slice(-3),
      allLabels: sortedDates
    });

    // For bar charts, create readable category labels based on frequency
    const categoryLabels = datesWithData.map(dateStr => {
      const date = new Date(dateStr + 'T12:00:00Z');
      
      if (measures[0]?.frequency === 'Quarterly') {
        const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
        return `Q${quarter} ${date.getUTCFullYear()}`;
      } else if (measures[0]?.frequency === 'Monthly') {
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
      } else if (measures[0]?.frequency === 'Weekly') {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      }
      
      return dateStr;
    });

    console.log('🔍 CATEGORY LABELS:', {
      originalDates: datesWithData,
      categoryLabels: categoryLabels,
      frequency: measures[0]?.frequency,
      sampleConversion: {
        original: datesWithData[0],
        category: categoryLabels[0]
      }
    });

    // Choose label format based on chart type
    let finalLabels;
    if (isTimeSeries) {
      // For line charts, handle dates based on frequency
      finalLabels = datesWithData.map(dateStr => {
        const date = new Date(dateStr + 'T12:00:00Z');
        
        // Only convert to month-start for Monthly/Quarterly data
        // Keep actual dates for Weekly data
        if (measures[0]?.frequency === 'Weekly') {
          return date; // Use actual weekly dates
        } else {
          // For Monthly/Quarterly, convert to first day of month for Chart.js
          return new Date(date.getUTCFullYear(), date.getUTCMonth(), 1, 12, 0, 0);
        }
      });
      
      console.log('🔍 LINE CHART DATE OBJECTS:', {
        originalDates: datesWithData,
        dateObjects: finalLabels,
        sampleConversion: {
          original: datesWithData[0],
          dateObject: finalLabels[0],
          isoString: finalLabels[0]?.toISOString()
        }
      });
    } else {
      // For bar charts, use category labels
      finalLabels = categoryLabels;
    }

    return {
      labels: finalLabels,
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
      // Convert string values to numbers before adding
      const measureValue = typeof measure.measure_value === 'string' 
        ? parseFloat(measure.measure_value) 
        : measure.measure_value;
      groupedData.set(groupKey, currentValue + measureValue);
    });

    const labels = Array.from(groupedData.keys());
    const data = labels.map(label => groupedData.get(label) || 0);
    const colors = this.getColorPalette();

    console.log('🔍 PIE CHART DATA:', {
      groupField,
      labels,
      data,
      groupedDataEntries: Array.from(groupedData.entries()),
      sampleMeasure: measures[0]
    });

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
   * TODO: Load from database via API call in the future
   */
  private getColorPalette(): string[] {
    // Using default palette for now - will be loaded from database via API
    return [
      '#00AEEF', '#67bfff', '#3ec972', '#f0bb33', '#ff5656', 
      'oklch(65.6% 0.241 354.308)', 'oklch(58.5% 0.233 277.117)', 'oklch(70.5% 0.213 47.604)'
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
