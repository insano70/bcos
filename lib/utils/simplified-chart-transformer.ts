import type { 
  AggAppMeasure, 
  ChartData, 
  ChartDataset
} from '@/lib/types/analytics';
import { getCssVariable } from '@/components/utils/utils';
import { createAppLogger } from '@/lib/logger/factory';
import { getPaletteColors } from '@/lib/services/color-palettes';

// Use Universal Logging System - dynamic imports prevent Winston bundling in client contexts
const chartLogger = createAppLogger('chart-transformer', {
  component: 'analytics',
  feature: 'data-transformation',
  module: 'chart-transformer'
});

/**
 * Simplified Chart Data Transformer
 * Works with pre-aggregated data from ih.agg_app_measures
 * No complex grouping or calculations needed
 */

export class SimplifiedChartTransformer {

  /**
   * Extract measure type from data (assumes all records have same measure type)
   */
  private extractMeasureType(measures: AggAppMeasure[]): string {
    if (measures.length === 0) return 'number';
    
    // Get measure type from first record (all should be the same for a single chart)
    const measureType = measures[0]?.measure_type;
    return measureType || 'number'; // Default fallback
  }

  /**
   * Transform pre-aggregated data to Chart.js format
   */
  transformData(
    measures: AggAppMeasure[],
    chartType: 'line' | 'bar' | 'horizontal-bar' | 'pie' | 'doughnut' | 'area',
    groupBy: string = 'none',
    paletteId: string = 'default'
  ): ChartData {

    if (measures.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Extract measure type from data
    const measureType = this.extractMeasureType(measures);

    chartLogger.debug('🔍 SIMPLIFIED TRANSFORMATION:', {
      recordCount: measures.length,
      chartType,
      groupBy,
      measureType,
      sampleRecord: measures[0]
    });

    let chartData: ChartData;
    switch (chartType) {
      case 'line':
      case 'area':
        chartData = this.createTimeSeriesChart(measures, groupBy, chartType === 'area', paletteId);
        break;
      case 'bar':
        chartData = this.createBarChart(measures, groupBy, paletteId);
        break;
      case 'horizontal-bar':
        chartData = this.createHorizontalBarChart(measures, groupBy, paletteId);
        break;
      case 'pie':
      case 'doughnut':
        chartData = this.createPieChart(measures, groupBy, paletteId);
        break;
      default:
        throw new Error(`Unsupported chart type: ${chartType}`);
    }

    // Attach measure type to chart data and all datasets
    chartData.measureType = measureType;
    chartData.datasets.forEach(dataset => {
      dataset.measureType = measureType;
    });

    return chartData;
  }

  /**
   * Create time series chart (line/area)
   */
  private createTimeSeriesChart(
    measures: AggAppMeasure[], 
    groupBy: string,
    filled: boolean = false,
    paletteId: string = 'default'
  ): ChartData {
    
    if (groupBy === 'none') {
      // Single series - use MM-DD-YYYY format for LineChart01
      const sortedMeasures = measures.sort((a, b) =>
        new Date(`${a.date_index}T00:00:00`).getTime() - new Date(`${b.date_index}T00:00:00`).getTime()
      );

      // Handle dates based on frequency
      const dateObjects = sortedMeasures.map(m => {
        const date = new Date(`${m.date_index}T12:00:00Z`);
        
        // Only convert to month-start for Monthly/Quarterly data
        // Keep actual dates for Weekly data  
        if (m.frequency === 'Weekly') {
          return date; // Use actual weekly dates
        } else {
          // For Monthly/Quarterly, convert to first day of month for Chart.js
          return new Date(date.getUTCFullYear(), date.getUTCMonth(), 1, 12, 0, 0);
        }
      });

      chartLogger.debug('🔍 SINGLE SERIES TIME LABELS:', {
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
      return this.createMultiSeriesChart(measures, groupBy, filled, true, paletteId);
    }
  }

  /**
   * Create bar chart
   */
  private createBarChart(measures: AggAppMeasure[], groupBy: string, paletteId: string = 'default'): ChartData {
    
    if (groupBy === 'none') {
      // Single series - use date_index as actual dates for Chart.js time axis
      const sortedMeasures = measures.sort((a, b) =>
        new Date(`${a.date_index}T00:00:00`).getTime() - new Date(`${b.date_index}T00:00:00`).getTime()
      );

      return {
        labels: sortedMeasures.map(m => {
          const date = new Date(`${m.date_index}T12:00:00Z`);
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
      return this.createMultiSeriesChart(measures, groupBy, false, false, paletteId);
    }
  }

  /**
   * Create multi-series chart (multiple providers/practices)
   */
  private createMultiSeriesChart(
    measures: AggAppMeasure[], 
    groupBy: string,
    filled: boolean = false,
    isTimeSeries: boolean = false,
    paletteId: string = 'default'
  ): ChartData {
    
    // Group data by the groupBy field and date
    const groupedData = new Map<string, Map<string, number>>();
    const allDates = new Set<string>();

    measures.forEach(measure => {
      const groupKey = this.getGroupValue(measure, groupBy);
      const dateKey = measure.date_index; // Use date_index for proper sorting

      allDates.add(dateKey);

      let dateMap = groupedData.get(groupKey);
      if (!dateMap) {
        dateMap = new Map();
        groupedData.set(groupKey, dateMap);
      }
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

    chartLogger.debug('🔍 DATE FILTERING:', {
      allDates: sortedDates,
      datesWithData: datesWithData,
      filteredOut: sortedDates.filter(d => !datesWithData.includes(d))
    });

    chartLogger.debug('🔍 DATE PROCESSING:', {
      sortedDateIndexes: sortedDates,
      sampleDate: sortedDates[0],
      parsedSampleDate: new Date(sortedDates[0] + 'T00:00:00')
    });

    chartLogger.debug('🔍 MULTI-SERIES DATA:', {
      groupBy,
      sortedDates,
      groupCount: groupedData.size,
      groups: Array.from(groupedData.keys()),
      sampleGroupData: Array.from(groupedData.entries())[0]
    });

    // Create datasets for each group
    const datasets: ChartDataset[] = [];
    const colors = this.getColorPalette(paletteId);
    let colorIndex = 0;

    groupedData.forEach((dateMap, groupKey) => {
      const data = datesWithData.map(dateIndex => dateMap.get(dateIndex) || 0);
      const color = colors[colorIndex % colors.length];

      chartLogger.debug('🔍 CREATING DATASET:', {
        groupKey,
        color,
        dataPoints: data,
        dateMapSize: dateMap.size,
        dateMapEntries: Array.from(dateMap.entries())
      });

      // Build dataset with conditional properties based on chart type
      const dataset: ChartDataset = {
        label: groupKey,
        data,
        borderColor: color || '#00AEEF',
        backgroundColor: color || '#00AEEF',
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.7,
      };

      // Add line chart specific properties
      if (isTimeSeries || filled) {
        dataset.fill = filled;
        dataset.tension = 0.4;
        dataset.pointRadius = 3;
        dataset.pointHoverRadius = 5;
      } else {
        // Bar chart specific properties - match single-series styling
        dataset.hoverBackgroundColor = this.adjustColorOpacity(color || '#00AEEF', 0.8);
      }

      datasets.push(dataset);

      colorIndex++;
    });

    chartLogger.debug('🔍 FINAL CHART DATA:', {
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

    chartLogger.debug('🔍 CATEGORY LABELS:', {
      originalDates: datesWithData,
      categoryLabels: categoryLabels,
      frequency: measures[0]?.frequency,
      sampleConversion: {
        original: datesWithData[0],
        category: categoryLabels[0]
      }
    });

    // Choose label format based on chart type
    let finalLabels: (string | Date)[];
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
      
      chartLogger.debug('🔍 LINE CHART DATE OBJECTS:', {
        originalDates: datesWithData,
        dateObjects: finalLabels,
        sampleConversion: {
          original: datesWithData[0],
          dateObject: finalLabels[0],
          isoString: finalLabels[0] instanceof Date ? finalLabels[0].toISOString() : finalLabels[0]
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
  private createPieChart(measures: AggAppMeasure[], groupBy: string, paletteId: string = 'default'): ChartData {
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
    const colors = this.getColorPalette(paletteId);

    chartLogger.debug('🔍 PIE CHART DATA:', {
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
   * Create horizontal bar chart (aggregates across dates by groupBy field)
   */
  private createHorizontalBarChart(measures: AggAppMeasure[], groupBy: string, paletteId: string = 'default'): ChartData {
    if (groupBy === 'none') {
      throw new Error('Horizontal bar charts require a groupBy field');
    }

    // Aggregate data by groupBy field, summing across all dates
    const aggregatedData = new Map<string, number>();

    measures.forEach(measure => {
      const groupKey = this.getGroupValue(measure, groupBy);
      const measureValue = typeof measure.measure_value === 'string' 
        ? parseFloat(measure.measure_value) 
        : measure.measure_value;
      
      const currentValue = aggregatedData.get(groupKey) || 0;
      aggregatedData.set(groupKey, currentValue + measureValue);
    });

    // Sort by value (descending) - highest to lowest
    const sortedEntries = Array.from(aggregatedData.entries())
      .sort((a, b) => b[1] - a[1]);

    const colors = this.getColorPalette(paletteId);
    const colorArray = Array.from(colors);

    return {
      labels: sortedEntries.map(([label]) => label),
      datasets: [{
        label: measures[0]?.measure || 'Value',
        data: sortedEntries.map(([, value]) => value),
        backgroundColor: colorArray,
        hoverBackgroundColor: colorArray.map(color => this.adjustColorOpacity(color, 0.8)),
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.9,
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
   * Enhanced with multiple palette support
   */
  private getColorPalette(paletteId: string = 'default'): readonly string[] {
    return getPaletteColors(paletteId);
  }

  /**
   * Format date label based on frequency (consolidated from chart-data-transformer)
   */
  private formatDateLabel(dateIndex: string, frequency: string): string {
    const date = new Date(dateIndex + 'T12:00:00Z');
    
    switch (frequency) {
      case 'Weekly':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      case 'Monthly':
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
      case 'Quarterly': {
        const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
        return `Q${quarter} ${date.getUTCFullYear()}`;
      }
      default:
        return dateIndex;
    }
  }

  /**
   * Enhanced multi-series support with better data handling
   */
  createEnhancedMultiSeriesChart(
    measures: AggAppMeasure[],
    groupBy: string,
    aggregations: Record<string, 'sum' | 'avg' | 'count' | 'min' | 'max'> = {},
    paletteId: string = 'default'
  ): ChartData {
    // Extract measure type from data
    const measureType = this.extractMeasureType(measures);
    chartLogger.debug('🔍 ENHANCED MULTI-SERIES INPUT:', {
      measureCount: measures.length,
      groupBy,
      aggregations,
      sampleMeasure: measures[0],
      hasSeriesLabels: measures.some(m => m.series_label)
    });

    // Check if we have series-tagged data (from multiple series query)
    const hasSeriesLabels = measures.some(m => m.series_label);
    
    if (hasSeriesLabels) {
      const chartData = this.createMultiSeriesFromTaggedData(measures, aggregations, paletteId);
      // Attach measure type to chart data and all datasets
      chartData.measureType = measureType;
      chartData.datasets.forEach(dataset => {
        dataset.measureType = measureType;
      });
      return chartData;
    }

    // Original logic for non-tagged data
    const groupedData = new Map<string, Map<string, number[]>>();
    const allDates = new Set<string>();

    // Group data with support for multiple aggregation types
    measures.forEach(measure => {
      const groupKey = this.getGroupValue(measure, groupBy);
      const dateKey = measure.date_index;
      
      allDates.add(dateKey);
      
      if (!groupedData.has(groupKey)) {
        groupedData.set(groupKey, new Map());
      }
      
      const dateMap = groupedData.get(groupKey)!;
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, []);
      }
      
      const measureValue = typeof measure.measure_value === 'string' 
        ? parseFloat(measure.measure_value) 
        : measure.measure_value;
      
      dateMap.get(dateKey)!.push(measureValue);
    });

    const sortedDates = Array.from(allDates).sort((a, b) => 
      new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()
    );

    const datasets: ChartDataset[] = [];
    const colors = this.getColorPalette(paletteId);
    let colorIndex = 0;

    groupedData.forEach((dateMap, groupKey) => {
      const aggregationType = aggregations[groupKey] || 'sum';
      
      const data = sortedDates.map(dateIndex => {
        const values = dateMap.get(dateIndex) || [0];
        
        switch (aggregationType) {
          case 'sum':
            return values.reduce((sum, val) => sum + val, 0);
          case 'avg':
            return values.reduce((sum, val) => sum + val, 0) / values.length;
          case 'count':
            return values.length;
          case 'min':
            return Math.min(...values);
          case 'max':
            return Math.max(...values);
          default:
            return values.reduce((sum, val) => sum + val, 0);
        }
      });

      datasets.push({
        label: `${groupKey} (${aggregationType})`,
        data,
        borderColor: colors[colorIndex % colors.length] || '#00AEEF',
        backgroundColor: colors[colorIndex % colors.length] || '#00AEEF',
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
      });

      colorIndex++;
    });

    return {
      labels: sortedDates.map(dateStr => {
        const date = new Date(dateStr + 'T12:00:00Z');
        return this.formatDateLabel(dateStr, measures[0]?.frequency || 'Monthly');
      }),
      datasets
    };
  }

  /**
   * Create multi-series chart from tagged data (optimized for multiple measures)
   */
  createMultiSeriesFromTaggedData(
    measures: AggAppMeasure[], // Tagged measures with series_label, etc.
    aggregations: Record<string, 'sum' | 'avg' | 'count' | 'min' | 'max'> = {},
    paletteId: string = 'default'
  ): ChartData {
    chartLogger.debug('🔍 CREATING MULTI-SERIES FROM TAGGED DATA:', {
      measureCount: measures.length,
      seriesLabels: Array.from(new Set(measures.map(m => m.series_label))),
      sampleMeasure: measures[0]
    });

    // Group by series label and date
    const groupedBySeries = new Map<string, Map<string, number[]>>();
    const allDates = new Set<string>();

    measures.forEach(measure => {
      const seriesLabel = measure.series_label || measure.measure;
      const dateKey = measure.date_index;
      
      allDates.add(dateKey);
      
      if (!groupedBySeries.has(seriesLabel)) {
        groupedBySeries.set(seriesLabel, new Map());
      }
      
      const dateMap = groupedBySeries.get(seriesLabel)!;
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, []);
      }
      
      const measureValue = typeof measure.measure_value === 'string' 
        ? parseFloat(measure.measure_value) 
        : measure.measure_value;
      
      dateMap.get(dateKey)!.push(measureValue);
    });

    const sortedDates = Array.from(allDates).sort((a, b) => 
      new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()
    );

    const datasets: ChartDataset[] = [];
    const colors = this.getColorPalette(paletteId);
    let colorIndex = 0;

    groupedBySeries.forEach((dateMap, seriesLabel) => {
      const aggregationType = aggregations[seriesLabel] || 'sum';
      
      const data = sortedDates.map(dateIndex => {
        const values = dateMap.get(dateIndex) || [0];
        
        switch (aggregationType) {
          case 'sum':
            return values.reduce((sum, val) => sum + val, 0);
          case 'avg':
            return values.reduce((sum, val) => sum + val, 0) / values.length;
          case 'count':
            return values.length;
          case 'min':
            return Math.min(...values);
          case 'max':
            return Math.max(...values);
          default:
            return values.reduce((sum, val) => sum + val, 0);
        }
      });

      // Find the series config to get custom color
      const sampleMeasure = measures.find(m => m.series_label === seriesLabel);
      const customColor = sampleMeasure?.series_color;
      const color = customColor || colors[colorIndex % colors.length] || '#00AEEF';

      datasets.push({
        label: seriesLabel,
        data,
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
      });

      colorIndex++;
    });

    chartLogger.debug('🔍 TAGGED DATA TRANSFORMATION RESULT:', {
      seriesCount: datasets.length,
      dateCount: sortedDates.length,
      seriesLabels: datasets.map(d => d.label),
      sampleData: datasets[0]?.data?.slice(0, 3)
    });

    return {
      labels: sortedDates.map(dateStr => {
        const date = new Date(dateStr + 'T12:00:00Z');
        return this.formatDateLabel(dateStr, measures[0]?.frequency || 'Monthly');
      }),
      datasets
    };
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
