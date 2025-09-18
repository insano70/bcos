'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChartData, AnalyticsQueryParams, MeasureType, FrequencyType, ChartFilter, MultipleSeriesConfig } from '@/lib/types/analytics';
import { simplifiedChartTransformer } from '@/lib/utils/simplified-chart-transformer';
import { calculatedFieldsService } from '@/lib/services/calculated-fields';
import { chartExportService } from '@/lib/services/chart-export';
import { usageAnalyticsService } from '@/lib/services/usage-analytics';
import ChartErrorBoundary from './chart-error-boundary';
import { ChartSkeleton } from '@/components/ui/loading-skeleton';

// Import existing chart components
import LineChart01 from './line-chart-01';
import BarChart01 from './bar-chart-01';
import AnalyticsBarChart from './analytics-bar-chart';
import DoughnutChart from './doughnut-chart';

interface AnalyticsChartProps {
  chartType: 'line' | 'bar' | 'doughnut';
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
}

interface ApiResponse {
  success: boolean;
  data: {
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
  multipleSeries = [] // Phase 3: Multiple series
}: AnalyticsChartProps) {
  const [chartData, setChartData] = useState<ChartData>({ labels: [], datasets: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ApiResponse['data']['metadata'] | null>(null);
  const [rawData, setRawData] = useState<any[]>([]);
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

      // Build query parameters
      const params = new URLSearchParams();
      
      if (measure) params.append('measure', measure);
      if (frequency) params.append('frequency', frequency);
      
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

      // Add multiple series configuration if provided
      if (multipleSeries && multipleSeries.length > 0) {
        params.append('multiple_series', encodeURIComponent(JSON.stringify(multipleSeries)));
      }

      // Chart parameters configured
      
      // Set reasonable defaults for chart display
      params.append('limit', '1000');

      // Fetch data from admin analytics API
      const response = await fetch(`/api/admin/analytics/measures?${params.toString()}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ApiResponse = await response.json();

      if (!data.success || !data.data.measures) {
        throw new Error('Invalid response format from analytics API');
      }

      // Map groupBy values correctly
      let mappedGroupBy = 'none';
      if (groupBy === 'practice_uid' || groupBy === 'practice') mappedGroupBy = 'practice';
      if (groupBy === 'provider_uid' || groupBy === 'provider_name') mappedGroupBy = 'provider_name';
      if (groupBy === 'measure') mappedGroupBy = 'measure';

      // GroupBy mapping completed

      // Apply calculated fields if selected
      let processedMeasures = data.data.measures;
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

      // Transform data - use enhanced multi-series transformer if multiple series are configured
      let transformedData: ChartData;
      if (multipleSeries && multipleSeries.length > 0) {
        // Build aggregation configuration from series configs
        const aggregations: Record<string, 'sum' | 'avg' | 'count' | 'min' | 'max'> = {};
        multipleSeries.forEach(series => {
          if (series.label) {
            aggregations[series.label] = series.aggregation;
          }
        });
        
        transformedData = simplifiedChartTransformer.createEnhancedMultiSeriesChart(
          processedMeasures,
          mappedGroupBy,
          aggregations
        );
      } else {
        transformedData = simplifiedChartTransformer.transformData(
          processedMeasures,
          chartType,
          mappedGroupBy
        );
      }

      // Transformation completed

      // Show EXACT data structure being passed to Chart.js
      // Chart data structure prepared

      setChartData(transformedData);
      setMetadata(data.data.metadata);
      setRawData(data.data.measures); // Store raw data for export

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch chart data';
      setError(errorMessage);
      console.error('Chart data fetch error:', err);
      // Don't retry on error - let the user manually retry
    } finally {
      setIsLoading(false);
    }
  }, [chartType, measure, frequency, practice, practiceUid, providerName, providerUid, startDate, endDate, groupBy, calculatedField, stableAdvancedFilters, stableMultipleSeries]);

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
      return <ChartSkeleton width={width} height={height} />;
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center" style={{ width, height }}>
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
    }

    if (chartData.datasets.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center" style={{ width, height }}>
          <div className="text-gray-500 mb-2">📊 No Data</div>
          <div className="text-sm text-gray-600 dark:text-gray-400 text-center px-4">
            No data available for the selected criteria.
          </div>
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
        case 'doughnut':
          return <DoughnutChart ref={chartRef} data={chartData} width={width} height={height} />;
        default:
          return <div>Unsupported chart type: {chartType}</div>;
      }
    };

    return (
      <ChartErrorBoundary>
        {renderChartComponent()}
      </ChartErrorBoundary>
    );
  };

  return (
    <div className={`flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl ${className}`}>
      {/* Chart Header */}
      <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">
            {title || `${measure} - ${frequency}`}
          </h2>
          {metadata && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Query time: {metadata.query_time_ms}ms
              {metadata.cache_hit && ' (cached)'}
              {metadata.analytics_db_latency_ms && ` • DB: ${metadata.analytics_db_latency_ms}ms`}
            </div>
          )}
        </div>
        
        {/* Chart Controls */}
        <div className="flex items-center gap-2">
          {/* Export Dropdown */}
          <div className="relative group">
            <button
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
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
      <div className="flex-1 p-5">
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
