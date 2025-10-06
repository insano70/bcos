'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChartData, AnalyticsQueryParams, MeasureType, FrequencyType, ChartFilter, MultipleSeriesConfig, PeriodComparisonConfig } from '@/lib/types/analytics';
import type { ResponsiveChartProps } from '@/lib/types/responsive-charts';
import { simplifiedChartTransformer } from '@/lib/utils/simplified-chart-transformer';
import { calculatedFieldsService } from '@/lib/services/calculated-fields';
import { chartExportService } from '@/lib/services/chart-export';
import { usageAnalyticsService } from '@/lib/services/usage-analytics';
import ChartErrorBoundary from './chart-error-boundary';
import { apiClient } from '@/lib/api/client';
import { ChartSkeleton } from '@/components/ui/loading-skeleton';
import ResponsiveChartContainer from './responsive-chart-container';

// Import existing chart components
import LineChart01 from './line-chart-01';
import BarChart01 from './bar-chart-01';
import AnalyticsBarChart from './analytics-bar-chart';
import AnalyticsStackedBarChart from './analytics-stacked-bar-chart';
import AnalyticsHorizontalBarChart from './analytics-horizontal-bar-chart';
import AnalyticsProgressBarChart from './analytics-progress-bar-chart';
import AnalyticsTableChart from './analytics-table-chart';
import DoughnutChart from './doughnut-chart';

interface AnalyticsChartProps extends ResponsiveChartProps {
  chartType: 'line' | 'bar' | 'stacked-bar' | 'horizontal-bar' | 'progress-bar' | 'doughnut' | 'table';
  measure?: MeasureType;
  frequency?: FrequencyType;
  practice?: string | undefined;
  practiceUid?: string | undefined; // Legacy support
  providerName?: string | undefined;
  providerUid?: string | undefined; // Legacy support
  startDate?: string | undefined;
  endDate?: string | undefined;
  width?: number;
  height?: number;
  title?: string;
  groupBy?: string;
  className?: string;
  calculatedField?: string | undefined; // Phase 3: Calculated fields support
  advancedFilters?: ChartFilter[]; // Phase 3: Advanced filtering support
  multipleSeries?: MultipleSeriesConfig[]; // Phase 3: Multiple series support
  dataSourceId?: number | undefined; // Data source ID for configurable data sources
  stackingMode?: 'normal' | 'percentage'; // Stacking mode for stacked-bar charts
  colorPalette?: string; // Color palette ID for chart colors
  periodComparison?: PeriodComparisonConfig; // Period comparison support
}

interface ApiResponse {
  measures: any[];
  pagination: {
    total_count: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
  metadata: {
    query_time_ms: number;
    cache_hit: boolean;
    analytics_db_latency_ms?: number;
    generatedAt: string;
  };
}

export default function AnalyticsChart({
  chartType,
  measure = 'Charges by Provider',
  frequency = 'Monthly',
  practice,
  practiceUid, // Legacy support
  providerName,
  providerUid, // Legacy support
  startDate,
  endDate,
  width = 800,
  height = 400,
  title,
  groupBy,
  className = '',
  calculatedField, // Phase 3: Calculated fields
  advancedFilters = [], // Phase 3: Advanced filters
  multipleSeries = [], // Phase 3: Multiple series
  dataSourceId, // Data source ID for configurable data sources
  stackingMode = 'normal', // Stacking mode for stacked-bar charts
  colorPalette = 'default', // Color palette for chart colors
  periodComparison, // Period comparison support
  // Responsive sizing options
  responsive = false,
  minHeight = 200,
  maxHeight = 800,
  aspectRatio
}: AnalyticsChartProps) {
  const [chartData, setChartData] = useState<ChartData>({ labels: [], datasets: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ApiResponse['metadata'] | null>(null);
  const [rawData, setRawData] = useState<Record<string, unknown>[]>([]);
  const [dataSourceColumns, setDataSourceColumns] = useState<Array<{ column_name: string; display_name: string; data_type: string; format_type: string | null }>>([]);
  const chartRef = useRef<HTMLCanvasElement | null>(null);

  // Memoize complex dependencies to prevent infinite loops
  const stableAdvancedFilters = useMemo(() => JSON.stringify(advancedFilters || []), [advancedFilters]);
  const stableMultipleSeries = useMemo(() => JSON.stringify(multipleSeries || []), [multipleSeries]);

  const fetchChartData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Track chart access for usage analytics
      usageAnalyticsService.trackChartAccess(
        'chart-' + Date.now(), // chartDefinitionId - would come from actual chart ID
        `${measure} - ${frequency}`, // chartName
        'anonymous', // userId - would come from auth context
        'Anonymous User', // userName - would come from auth context
        0 // loadTime - would be calculated
      );

      // Handle multiple series by passing the configuration to the API
      if (multipleSeries && multipleSeries.length > 0) {
        console.log('🚀 FETCHING MULTIPLE SERIES DATA:', multipleSeries);
        // The API will handle multiple measures efficiently with WHERE measure IN (...)
      }

      // Build query parameters
      const params = new URLSearchParams();

      // Note: measure and frequency params are not needed for table charts
      if (chartType !== 'table' && frequency) params.append('frequency', frequency);

      // Support both new and legacy field names
      if (practice && practice.trim()) {
        const practiceUidInt = parseInt(practice, 10);
        if (!isNaN(practiceUidInt)) {
          params.append('practice_uid', practiceUidInt.toString());
        } else {
          params.append('practice', practice);
        }
      }
      if (practiceUid && practiceUid.trim()) {
        const practiceUidInt = parseInt(practiceUid, 10);
        if (!isNaN(practiceUidInt)) {
          params.append('practice_uid', practiceUidInt.toString());
        }
      }
      
      if (providerName && providerName.trim()) params.append('provider_name', providerName);
      if (providerUid && providerUid.trim()) params.append('provider_name', providerUid); // Legacy mapping
      
      if (startDate && startDate.trim()) params.append('start_date', startDate);
      if (endDate && endDate.trim()) params.append('end_date', endDate);

      // Add advanced filters if provided
      if (advancedFilters && advancedFilters.length > 0) {
        params.append('advanced_filters', encodeURIComponent(JSON.stringify(advancedFilters)));
      }

      // Add calculated field if provided
      if (calculatedField && calculatedField.trim()) {
        params.append('calculated_field', calculatedField);
      }

      // Add data source ID if provided
      if (dataSourceId) {
        params.append('data_source_id', dataSourceId.toString());
      }

      // Add groupBy parameter if provided (not for table charts)
      if (chartType !== 'table' && groupBy && groupBy !== 'none') {
        params.append('group_by', groupBy);
      }

      // Add multiple series configuration if provided (not for table charts)
      if (chartType !== 'table' && multipleSeries && multipleSeries.length > 0) {
        console.log('🔍 MULTIPLE SERIES CONFIG:', {
          multipleSeries,
          seriesCount: multipleSeries.length,
          measures: multipleSeries.map(s => s.measure),
          labels: multipleSeries.map(s => s.label)
        });
        params.append('multiple_series', encodeURIComponent(JSON.stringify(multipleSeries)));
        // Don't add individual measure param when using multiple series
      } else if (chartType !== 'table') {
        console.log('🔍 SINGLE SERIES MODE:', { measure, frequency });
        if (measure) params.append('measure', measure);
      }

      // Add period comparison configuration if provided (not for table charts)
      if (chartType !== 'table' && periodComparison?.enabled) {
        console.log('🔍 PERIOD COMPARISON CONFIG:', {
          periodComparison,
          comparisonType: periodComparison.comparisonType,
          labelFormat: periodComparison.labelFormat
        });
        params.append('period_comparison', encodeURIComponent(JSON.stringify(periodComparison)));
      }

      // Chart parameters configured
      
      // Set reasonable defaults for chart display
      params.append('limit', '1000');

      // For table charts, use the data source query endpoint
      if (chartType === 'table') {
        if (!dataSourceId) {
          throw new Error('Data source ID is required for table charts');
        }

        console.log('🚀 FETCHING TABLE DATA from data source:', dataSourceId);
        const tableData: { data: Record<string, unknown>[]; total_count: number; columns: Array<{ name: string; display_name: string; data_type: string; format_type: string | null }> } = await apiClient.get(`/api/admin/data-sources/${dataSourceId}/query?${params.toString()}`);

        console.log('📊 TABLE DATA RECEIVED:', {
          rowCount: tableData.data?.length,
          columnCount: tableData.columns?.length,
          sampleRow: tableData.data?.[0]
        });

        if (!tableData.data) {
          throw new Error('Invalid response format from data source query API');
        }

        // Map API column names to match our interface
        const mappedColumns = (tableData.columns || []).map(col => ({
          column_name: col.name,
          display_name: col.display_name,
          data_type: col.data_type,
          format_type: col.format_type
        }));

        // For tables, store raw data directly - no transformation needed
        setChartData({ labels: [], datasets: [] }); // Not used for tables
        setRawData(tableData.data);
        setDataSourceColumns(mappedColumns); // Use columns from API response
        setMetadata(null);

        console.log('✅ TABLE DATA STORED:', {
          rawDataLength: tableData.data.length,
          columnsLength: mappedColumns.length
        });
      } else {
        // Fetch data from admin analytics API (for chart visualizations)
        console.log('🚀 FETCHING SINGLE SERIES DATA:', { measure, frequency });
        const data: ApiResponse = await apiClient.get(`/api/admin/analytics/measures?${params.toString()}`);

        if (!data.measures) {
          throw new Error('Invalid response format from analytics API');
        }

      // Use groupBy directly - no hard-coded mapping needed
      const mappedGroupBy = groupBy || 'none';

      // GroupBy mapping completed

      // Apply calculated fields if selected
      let processedMeasures = data.measures;
      if (calculatedField) {
        try {
          console.log('🔍 APPLYING CALCULATED FIELD:', {
            calculatedFieldId: calculatedField,
            originalDataCount: processedMeasures.length
          });
          
          processedMeasures = calculatedFieldsService.applyCalculatedField(calculatedField, processedMeasures);
          
          console.log('🔍 CALCULATED FIELD RESULT:', {
            processedDataCount: processedMeasures.length,
            sampleCalculatedRecord: processedMeasures[0]
          });
        } catch (error) {
          console.error('❌ Calculated field processing failed:', error);
          setError(`Calculated field error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return;
        }
      }

      // Transform data - handle both single and multiple series
      let transformedData: ChartData;
      
      if (multipleSeries && multipleSeries.length > 0) {
        console.log('🔍 USING MULTI-SERIES TRANSFORMER:', {
          seriesCount: multipleSeries.length,
          dataCount: processedMeasures.length,
          mappedGroupBy,
          seriesLabels: multipleSeries.map(s => s.label)
        });
        
        // Use the enhanced multi-series transformer
        const aggregations: Record<string, 'sum' | 'avg' | 'count' | 'min' | 'max'> = {};
        multipleSeries.forEach(series => {
          if (series.label) {
            aggregations[series.label] = series.aggregation;
          }
        });
        
        transformedData = simplifiedChartTransformer.createEnhancedMultiSeriesChart(
          processedMeasures,
          'measure', // Group by measure for multiple series
          aggregations,
          colorPalette
        );
        
        console.log('🔍 MULTI-SERIES RESULT:', {
          labelCount: transformedData.labels.length,
          datasetCount: transformedData.datasets.length,
          datasetLabels: transformedData.datasets.map(d => d.label)
        });
      } else if (processedMeasures.some(m => m.series_id === 'current' || m.series_id === 'comparison')) {
        console.log('🔍 USING PERIOD COMPARISON TRANSFORMER:', {
          chartType,
          mappedGroupBy,
          dataCount: processedMeasures.length,
          currentRecords: processedMeasures.filter(m => m.series_id === 'current').length,
          comparisonRecords: processedMeasures.filter(m => m.series_id === 'comparison').length
        });
        
        // Use the period comparison transformer
        transformedData = simplifiedChartTransformer.transformDataWithPeriodComparison(
          processedMeasures,
          chartType === 'stacked-bar' ? 'bar' : chartType, // Map stacked-bar to bar for transformation
          mappedGroupBy,
          colorPalette
        );
        
        console.log('🔍 PERIOD COMPARISON RESULT:', {
          labelCount: transformedData.labels.length,
          datasetCount: transformedData.datasets.length,
          datasetLabels: transformedData.datasets.map(d => d.label)
        });
      } else {
        console.log('🔍 USING SINGLE-SERIES TRANSFORMER:', {
          measure,
          chartType,
          mappedGroupBy,
          dataCount: processedMeasures.length
        });
        
        // Map stacked-bar to bar for data transformation (progress-bar uses its own method)
        const transformChartType = chartType === 'stacked-bar' ? 'bar' : chartType;
        
        transformedData = simplifiedChartTransformer.transformData(
          processedMeasures,
          transformChartType,
          mappedGroupBy,
          colorPalette
        );
        
        console.log('🔍 SINGLE-SERIES RESULT:', {
          labelCount: transformedData.labels.length,
          datasetCount: transformedData.datasets.length,
          datasetLabels: transformedData.datasets.map(d => d.label)
        });
      }

        // Transformation completed

        // Show EXACT data structure being passed to Chart.js
        // Chart data structure prepared

        setChartData(transformedData);
        setMetadata(data.metadata);
        setRawData(data.measures); // Store raw data for export
      } // End of else block for non-table charts

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch chart data';
      setError(errorMessage);
      console.error('Chart data fetch error:', err);
      // Don't retry on error - let the user manually retry
    } finally {
      setIsLoading(false);
    }
  }, [chartType, measure, frequency, practice, practiceUid, providerName, providerUid, startDate, endDate, groupBy, calculatedField, stableAdvancedFilters, stableMultipleSeries, dataSourceId]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);


  const handleExport = async (format: 'png' | 'csv' | 'pdf') => {
    try {
      let result;
      
      if (format === 'csv') {
        result = chartExportService.exportChartDataAsCSV(chartData, rawData, { format });
      } else if (chartRef.current) {
        if (format === 'pdf') {
          result = await chartExportService.exportChartAsPDF(chartRef.current, { format });
        } else {
          result = await chartExportService.exportChartAsImage(chartRef.current, { format });
        }
      } else {
        throw new Error('Chart not available for export');
      }

      if (result.success) {
        chartExportService.downloadFile(result);
      } else {
        throw new Error(result.error || 'Export failed');
      }
    } catch (error) {
      console.error('Export failed:', error);
      // Could show a toast notification here
    }
  };

  const renderChart = () => {
    if (isLoading) {
      return responsive ? (
        <div className="w-full h-full flex items-center justify-center" style={{ minHeight: `${minHeight}px` }}>
          <ChartSkeleton width={400} height={200} />
        </div>
      ) : (
        <ChartSkeleton width={width} height={height} />
      );
    }

    if (error) {
      const errorContainer = (
        <div className="flex flex-col items-center justify-center">
          <div className="text-red-500 mb-2">⚠️ Chart Error</div>
          <div className="text-sm text-gray-600 dark:text-gray-400 text-center px-4">
            {error}
          </div>
          <button 
            onClick={fetchChartData}
            className="mt-3 px-4 py-2 bg-violet-500 text-white rounded-md text-sm hover:bg-violet-600 transition-colors"
          >
            Retry
          </button>
        </div>
      );

      return responsive ? (
        <div className="w-full h-full flex items-center justify-center" style={{ minHeight: `${minHeight}px` }}>
          {errorContainer}
        </div>
      ) : (
        <div className="chart-error-container" style={{ width, height }}>
          {errorContainer}
        </div>
      );
    }

    // Skip empty data check for table charts (they use rawData instead of chartData.datasets)
    if (chartType !== 'table' && chartData.datasets.length === 0) {
      const noDataContainer = (
        <div className="flex flex-col items-center justify-center">
          <div className="text-gray-500 mb-2">📊 No Data</div>
          <div className="text-sm text-gray-600 dark:text-gray-400 text-center px-4">
            No data available for the selected criteria.
          </div>
        </div>
      );

      return responsive ? (
        <div className="w-full h-full flex items-center justify-center" style={{ minHeight: `${minHeight}px` }}>
          {noDataContainer}
        </div>
      ) : (
        <div className="chart-error-container" style={{ width, height }}>
          {noDataContainer}
        </div>
      );
    }

    // Render appropriate chart component based on type with error boundary
    const renderChartComponent = () => {
      switch (chartType) {
        case 'line':
          return <LineChart01 ref={chartRef} data={chartData} width={width} height={height} />;
        case 'bar':
          return <AnalyticsBarChart ref={chartRef} data={chartData} width={width} height={height} frequency={frequency} />;
        case 'stacked-bar':
          return <AnalyticsStackedBarChart ref={chartRef} data={chartData} width={width} height={height} frequency={frequency} stackingMode={stackingMode} />;
        case 'horizontal-bar':
          return <AnalyticsHorizontalBarChart ref={chartRef} data={chartData} width={width} height={height} />;
        case 'progress-bar':
          // Progress bar uses custom CSS rendering, not Chart.js
          // Reconstruct progress data from chartData
          const dataset = chartData.datasets[0];
          const total = dataset?.data.reduce((sum: number, val: number) => sum + val, 0) || 0;
          const progressData = chartData.labels.map((label, index) => ({
            label: String(label),
            value: Number(dataset?.data[index] || 0),
            percentage: total > 0 ? (Number(dataset?.data[index] || 0) / total) * 100 : 0
          }));
          return (
            <AnalyticsProgressBarChart
              data={progressData}
              colorPalette={colorPalette}
              measureType={chartData.measureType}
              height={height}
            />
          );
        case 'doughnut':
          return <DoughnutChart ref={chartRef} data={chartData} width={width} height={height} />;
        case 'table':
          return (
            <AnalyticsTableChart
              data={rawData}
              columns={dataSourceColumns.map(col => ({
                columnName: col.column_name,
                displayName: col.display_name,
                dataType: col.data_type,
                formatType: col.format_type
              }))}
              colorPalette={colorPalette}
              height={height}
            />
          );
        default:
          return <div>Unsupported chart type: {chartType}</div>;
      }
    };

    const chartComponent = (
      <ChartErrorBoundary>
        {renderChartComponent()}
      </ChartErrorBoundary>
    );

    // Wrap in responsive container if responsive mode is enabled
    if (responsive) {
      return (
        <ResponsiveChartContainer
          minHeight={minHeight}
          maxHeight={maxHeight}
          {...(aspectRatio && { aspectRatio })}
          className="w-full h-full"
        >
          {chartComponent}
        </ResponsiveChartContainer>
      );
    }

    return chartComponent;
  };

  return (
    <div className={`flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl ${className}`}>
      {/* Chart Header */}
      <header className="px-4 py-2 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">
            {title || `${measure} - ${frequency}`}
          </h2>
        </div>
        
        {/* Chart Controls */}
        <div className="flex items-center gap-1">
          {/* Export Dropdown */}
          <div className="relative group">
            <button
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Export chart"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
            
            {/* Export Menu */}
            <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={() => handleExport('png')}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Export PNG
              </button>
              <button
                onClick={() => handleExport('pdf')}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Export PDF
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Export Data
              </button>
            </div>
          </div>

          <button
            onClick={fetchChartData}
            disabled={isLoading}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
            title="Refresh chart data"
          >
            <svg 
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Chart Content */}
      <div className="flex-1 p-2">
        {renderChart()}
      </div>
    </div>
  );
}

/**
 * Predefined chart configurations for common use cases
 */
export const AnalyticsChartPresets = {
  PracticeRevenueTrend: (props: Partial<AnalyticsChartProps>) => (
    <AnalyticsChart
      chartType="line"
      measure="Charges by Provider"
      frequency="Monthly"
      groupBy="practice_uid"
      title="Practice Revenue Trend"
      {...props}
    />
  ),

  ProviderPerformance: (props: Partial<AnalyticsChartProps>) => (
    <AnalyticsChart
      chartType="bar"
      measure="Charges by Provider"
      frequency="Monthly"
      groupBy="provider_uid"
      title="Provider Performance"
      {...props}
    />
  ),

  RevenueDistribution: (props: Partial<AnalyticsChartProps>) => (
    <AnalyticsChart
      chartType="doughnut"
      measure="Charges by Provider"
      frequency="Monthly"
      groupBy="practice_uid"
      title="Revenue Distribution"
      {...props}
    />
  ),
};
