'use client';

import { useState, useEffect, useRef } from 'react';
import { ChartData, AnalyticsQueryParams, MeasureType, FrequencyType, ChartFilter } from '@/lib/types/analytics';
import { simplifiedChartTransformer } from '@/lib/utils/simplified-chart-transformer';
import { calculatedFieldsService } from '@/lib/services/calculated-fields';
import { chartExportService } from '@/lib/services/chart-export';

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
  advancedFilters = [] // Phase 3: Advanced filters
}: AnalyticsChartProps) {
  const [chartData, setChartData] = useState<ChartData>({ labels: [], datasets: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ApiResponse['data']['metadata'] | null>(null);
  const [rawData, setRawData] = useState<any[]>([]);
  const chartRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    fetchChartData();
  }, [chartType, measure, frequency, practiceUid, providerUid, startDate, endDate, groupBy, calculatedField, advancedFilters]);

  const fetchChartData = async () => {
    setIsLoading(true);
    setError(null);

    try {
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

      // Debug logging
      console.log('🔍 ANALYTICS CHART PARAMS:', {
        measure,
        frequency,
        practice,
        practiceUid,
        providerName,
        providerUid,
        startDate,
        endDate,
        groupBy,
        finalUrl: `/api/admin/analytics/measures?${params.toString()}`
      });
      
      // Set reasonable defaults for chart display
      params.append('limit', '1000');

      // Fetch data from admin analytics API
      const response = await fetch(`/api/admin/analytics/measures?${params.toString()}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ApiResponse = await response.json();
      
      // Transform data for Chart.js
      console.log('🔍 BEFORE TRANSFORMATION:', {
        rawDataCount: data.data.measures.length,
        chartType,
        groupBy,
        sampleRecord: data.data.measures[0]
      });

      // Map groupBy values correctly
      let mappedGroupBy = 'none';
      if (groupBy === 'practice_uid' || groupBy === 'practice') mappedGroupBy = 'practice';
      if (groupBy === 'provider_uid' || groupBy === 'provider_name') mappedGroupBy = 'provider_name';
      if (groupBy === 'measure') mappedGroupBy = 'measure';

      console.log('🔍 GROUPBY MAPPING:', {
        originalGroupBy: groupBy,
        mappedGroupBy: mappedGroupBy
      });

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

      const transformedData = simplifiedChartTransformer.transformData(
        processedMeasures,
        chartType,
        mappedGroupBy
      );

      console.log('🔍 AFTER TRANSFORMATION:', {
        labels: transformedData.labels,
        datasetCount: transformedData.datasets.length,
        sampleDataset: transformedData.datasets[0]
      });

      // Show EXACT data structure being passed to Chart.js
      console.log('📊 EXACT CHART.JS DATA STRUCTURE:', JSON.stringify({
        labels: transformedData.labels,
        datasets: transformedData.datasets.map(dataset => ({
          label: dataset.label,
          data: dataset.data,
          backgroundColor: dataset.backgroundColor,
          borderColor: dataset.borderColor
        }))
      }, null, 2));

      setChartData(transformedData);
      setMetadata(data.data.metadata);
      setRawData(data.data.measures); // Store raw data for export

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch chart data';
      setError(errorMessage);
      console.error('Chart data fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

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
      return (
        <div className="flex items-center justify-center" style={{ width, height }}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
          <span className="ml-2 text-gray-600 dark:text-gray-400">Loading chart data...</span>
        </div>
      );
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

    // Render appropriate chart component based on type
    switch (chartType) {
      case 'line':
        return <LineChart01 data={chartData} width={width} height={height} />;
      case 'bar':
        return <AnalyticsBarChart data={chartData} width={width} height={height} frequency={frequency} />;
      case 'doughnut':
        return <DoughnutChart data={chartData} width={width} height={height} />;
      default:
        return <div>Unsupported chart type: {chartType}</div>;
    }
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
