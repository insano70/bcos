'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChartData, AnalyticsQueryParams, MeasureType, FrequencyType, ChartFilter, MultipleSeriesConfig, PeriodComparisonConfig, DualAxisConfig, AggAppMeasure } from '@/lib/types/analytics';
import type { ResponsiveChartProps } from '@/lib/types/responsive-charts';
import { chartExportService } from '@/lib/services/chart-export';
import ChartErrorBoundary from './chart-error-boundary';
import { apiClient } from '@/lib/api/client';
import { ChartSkeleton } from '@/components/ui/loading-skeleton';
import ResponsiveChartContainer from './responsive-chart-container';
import dynamic from 'next/dynamic';
import { GlassCard } from '@/components/ui/glass-card';

// Lazy load the fullscreen modals to prevent affecting global Chart.js state at page load
const ChartFullscreenModal = dynamic(() => import('./chart-fullscreen-modal'), {
  ssr: false,
});

const DualAxisFullscreenModal = dynamic(() => import('./dual-axis-fullscreen-modal'), {
  ssr: false,
});

// Import existing chart components
import LineChart01 from './line-chart-01';
import BarChart01 from './bar-chart-01';
import AnalyticsBarChart from './analytics-bar-chart';
import AnalyticsStackedBarChart from './analytics-stacked-bar-chart';
import AnalyticsHorizontalBarChart from './analytics-horizontal-bar-chart';
import AnalyticsProgressBarChart from './analytics-progress-bar-chart';
import AnalyticsTableChart from './analytics-table-chart';
import DoughnutChart from './doughnut-chart';
import AnalyticsDualAxisChart from './analytics-dual-axis-chart';
import AnalyticsNumberChart from './analytics-number-chart';

interface AnalyticsChartProps extends ResponsiveChartProps {
  chartType: 'line' | 'bar' | 'stacked-bar' | 'horizontal-bar' | 'progress-bar' | 'doughnut' | 'table' | 'dual-axis' | 'number';
  measure?: MeasureType;
  frequency?: FrequencyType;
  practice?: string | undefined;
  practiceUid?: string | undefined; // Legacy support
  providerName?: string | undefined;
  providerUid?: string | undefined; // Legacy support
  startDate?: string | undefined;
  endDate?: string | undefined;
  dateRangePreset?: string | undefined; // For dynamic date range calculation
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
  dualAxisConfig?: DualAxisConfig; // Dual-axis configuration for combo charts
  // Phase 3: Server-side aggregation for number and progress-bar charts
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max'; // Aggregation type for number charts
  target?: number; // Target value for progress-bar charts
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
  dateRangePreset, // For dynamic date range calculation
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
  dualAxisConfig, // Dual-axis configuration
  aggregation = 'sum', // Phase 3: Aggregation type for number charts
  target, // Phase 3: Target value for progress-bar charts
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

  // Phase 3.2: Server-formatted table data
  interface FormattedCellState {
    formatted: string;
    raw: unknown;
    icon?: {
      name: string;
      color?: string;
      type?: string;
    };
  }
  const [formattedData, setFormattedData] = useState<Array<Record<string, FormattedCellState>> | undefined>(undefined);

  const [dataSourceColumns, setDataSourceColumns] = useState<Array<{
    column_name: string;
    display_name: string;
    data_type: string;
    format_type: string | null;
    display_icon?: boolean | null | undefined;
    icon_type?: string | null | undefined;
    icon_color_mode?: string | null | undefined;
    icon_color?: string | null | undefined;
    icon_mapping?: unknown;
  }>>([]);
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDualAxisFullscreen, setIsDualAxisFullscreen] = useState(false);

  // Memoize complex dependencies to prevent infinite loops
  const stableAdvancedFilters = useMemo(() => JSON.stringify(advancedFilters || []), [advancedFilters]);
  const stableMultipleSeries = useMemo(() => JSON.stringify(multipleSeries || []), [multipleSeries]);
  const stablePeriodComparison = useMemo(() => JSON.stringify(periodComparison || null), [periodComparison]);


  const fetchChartData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
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

      // Dynamic date range calculation - pass preset for server-side calculation
      if (dateRangePreset && dateRangePreset.trim()) {
        params.append('date_range_preset', dateRangePreset);
      }
      if (startDate && startDate.trim()) params.append('start_date', startDate);
      if (endDate && endDate.trim()) params.append('end_date', endDate);

      // Add chart type for server-side aggregation (e.g., number charts need sum)
      params.append('chart_type', chartType);

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

      // Add groupBy parameter if provided (not for table charts or number charts)
      if (chartType !== 'table' && chartType !== 'number' && groupBy && groupBy !== 'none') {
        params.append('group_by', groupBy);
      }

      // Add multiple series configuration if provided (not for table charts)
      if (chartType !== 'table' && multipleSeries && multipleSeries.length > 0) {
        console.log('🔍 MULTIPLE SERIES CONFIG:', {
          seriesCount: multipleSeries.length,
          measures: multipleSeries.map(s => s.measure)
        });
        params.append('multiple_series', encodeURIComponent(JSON.stringify(multipleSeries)));
        // Don't add individual measure param when using multiple series
      } else if (chartType !== 'table') {
        if (measure) params.append('measure', measure);
      }

      // Add period comparison configuration if provided (not for table charts)
      if (chartType !== 'table' && periodComparison?.enabled) {
        console.log('🔍 PERIOD COMPARISON:', periodComparison.comparisonType);
        params.append('period_comparison', encodeURIComponent(JSON.stringify(periodComparison)));
      }

      // Chart parameters configured

      // Set reasonable defaults for chart display
      params.append('limit', '1000');

      // Add timestamp for cache busting - ensures fresh data on every request
      params.append('_t', Date.now().toString());

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
          format_type: col.format_type,
          display_icon: (col as { display_icon?: boolean | null }).display_icon ?? undefined,
          icon_type: (col as { icon_type?: string | null }).icon_type ?? undefined,
          icon_color_mode: (col as { icon_color_mode?: string | null }).icon_color_mode ?? undefined,
          icon_color: (col as { icon_color?: string | null }).icon_color ?? undefined,
          icon_mapping: (col as { icon_mapping?: unknown }).icon_mapping ?? undefined
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
      } else if (chartType === 'number' || chartType === 'progress-bar' || chartType === 'dual-axis') {
        // Phase 3: Number, progress-bar, and dual-axis charts use universal endpoint with server-side transformation
        if (!dataSourceId) {
          throw new Error(`Data source ID is required for ${chartType} charts`);
        }

        // Phase 3.3: Validate dual-axis config
        if (chartType === 'dual-axis') {
          if (!dualAxisConfig || !dualAxisConfig.enabled) {
            throw new Error('Dual-axis configuration is required');
          }
          if (!dualAxisConfig.primary?.measure || !dualAxisConfig.secondary?.measure) {
            throw new Error('Both primary and secondary measures are required for dual-axis charts');
          }
        }

        console.log(`🚀 FETCHING ${chartType.toUpperCase()} CHART DATA via universal endpoint`);

        const requestPayload = {
          chartConfig: {
            chartType,
            dataSourceId,
            ...(chartType === 'number' || chartType === 'progress-bar' ? {
              aggregation: aggregation || 'sum', // Default to sum if not specified
            } : {}),
            ...(chartType === 'progress-bar' && target !== undefined && { target }),
            ...(chartType === 'dual-axis' && dualAxisConfig && { dualAxisConfig }),
            // Include groupBy for progress-bar and dual-axis charts (number charts aggregate to single value)
            ...((chartType === 'progress-bar' || chartType === 'dual-axis') && groupBy && groupBy !== 'none' && { groupBy }),
            ...(title && { title }),
            colorPalette: colorPalette || 'default',
          },
          runtimeFilters: {
            startDate,
            endDate,
            dateRangePreset,
            practice,
            practiceUid,
            providerName,
            ...(chartType !== 'dual-axis' && measure && { measure }), // Dual-axis uses dualAxisConfig measures
            frequency,
          },
        };

        if (process.env.NODE_ENV === 'development') {
          console.log('📤 UNIVERSAL ENDPOINT REQUEST:', {
            chartType,
            ...(chartType !== 'dual-axis' && { aggregation: aggregation || 'sum' }),
            hasTarget: chartType === 'progress-bar' && target !== undefined,
            ...(chartType === 'dual-axis' && {
              primaryMeasure: dualAxisConfig?.primary?.measure,
              secondaryMeasure: dualAxisConfig?.secondary?.measure,
              secondaryChartType: dualAxisConfig?.secondary?.chartType,
            }),
          });
        }

        interface FormattedCell {
          formatted: string;
          raw: unknown;
          icon?: {
            name: string;
            color?: string;
            type?: string;
          };
        }

        const response: {
          chartData: ChartData;
          rawData: Record<string, unknown>[];
          columns?: Array<{
            columnName: string;
            displayName: string;
            dataType: string;
            formatType?: string | null;
            displayIcon?: boolean | null;
            iconType?: string | null;
            iconColorMode?: string | null;
            iconColor?: string | null;
            iconMapping?: Record<string, unknown> | null;
          }>;
          formattedData?: Array<Record<string, FormattedCell>>;
          metadata: {
            chartType: string;
            dataSourceId: number;
            queryTimeMs: number;
            cacheHit: boolean;
            recordCount: number;
          };
        } = await apiClient.post('/api/admin/analytics/chart-data/universal', requestPayload);

        if (process.env.NODE_ENV === 'development') {
          console.log('✅ UNIVERSAL ENDPOINT RESPONSE:', {
            chartType: response.metadata.chartType,
            queryTimeMs: response.metadata.queryTimeMs,
            cacheHit: response.metadata.cacheHit,
            datasetCount: response.chartData.datasets?.length ?? 0,
          });
        }

        // Store transformed chart data
        setChartData(response.chartData);
        setRawData(response.rawData);

        // Phase 3.2: Store formatted data for table charts
        if (response.formattedData) {
          setFormattedData(response.formattedData);
        }

        // Phase 3.2: Store columns from server if available
        if (response.columns) {
          setDataSourceColumns(response.columns.map(col => ({
            column_name: col.columnName,
            display_name: col.displayName,
            data_type: col.dataType,
            format_type: col.formatType || null,
            display_icon: col.displayIcon,
            icon_type: col.iconType,
            icon_color_mode: col.iconColorMode,
            icon_color: col.iconColor,
            icon_mapping: col.iconMapping || undefined
          })));
        }

        setMetadata({
          query_time_ms: response.metadata.queryTimeMs,
          cache_hit: response.metadata.cacheHit,
          generatedAt: new Date().toISOString(),
        });
      } else {
        // Standard chart types: line, bar, stacked-bar, horizontal-bar, pie, doughnut, area
        // Phase 5: Migrated to universal endpoint
        if (process.env.NODE_ENV === 'development') {
          console.log(`🚀 FETCHING ${chartType.toUpperCase()} CHART DATA via universal endpoint`);
        }

        // Client-side validation
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
          setError('Start date must be before end date');
          setIsLoading(false);
          return;
        }

        // Build universal endpoint request payload
        const requestPayload = {
          chartConfig: {
            chartType,
            dataSourceId: dataSourceId!,
            groupBy: groupBy || 'none',
            colorPalette: colorPalette || 'default',
            ...(chartType === 'stacked-bar' && { stackingMode }),
            ...(multipleSeries && multipleSeries.length > 0 && { multipleSeries }),
            ...(periodComparison && { periodComparison }),
            ...(title && { title }),
          },
          runtimeFilters: {
            startDate,
            endDate,
            dateRangePreset,
            practice,
            practiceUid,
            providerName,
            // Only include measure if NOT using multipleSeries (multipleSeries contains its own measures)
            ...(!(multipleSeries && multipleSeries.length > 0) && measure && { measure }),
            frequency,
            ...(advancedFilters && advancedFilters.length > 0 && { advancedFilters }),
            ...(calculatedField && { calculatedField }),
          },
        };

        if (process.env.NODE_ENV === 'development') {
          console.log('📤 UNIVERSAL ENDPOINT REQUEST:', {
            chartType,
            groupBy: groupBy || 'none',
            colorPalette: colorPalette || 'default',
            hasMultipleSeries: !!(multipleSeries && multipleSeries.length > 0),
            multipleSeriesCount: multipleSeries?.length,
            hasPeriodComparison: !!periodComparison,
            hasAdvancedFilters: !!(advancedFilters && advancedFilters.length > 0),
          });
        }

        // Universal endpoint response format
        const response: {
          chartData: ChartData;
          rawData: Record<string, unknown>[];
          metadata: {
            chartType: string;
            dataSourceId: number;
            queryTimeMs: number;
            cacheHit: boolean;
            recordCount: number;
          };
        } = await apiClient.post('/api/admin/analytics/chart-data/universal', requestPayload);

        if (process.env.NODE_ENV === 'development') {
          console.log('✅ UNIVERSAL ENDPOINT RESPONSE:', {
            chartType: response.metadata.chartType,
            recordCount: response.metadata.recordCount,
            queryTimeMs: response.metadata.queryTimeMs,
            cacheHit: response.metadata.cacheHit,
            labelCount: response.chartData.labels.length,
            datasetCount: response.chartData.datasets?.length ?? 0,
            datasetLabels: response.chartData.datasets?.map(d => d.label) ?? [],
          });
        }

        // Validate response has data
        if (!response.chartData.datasets || response.chartData.datasets.length === 0) {
          if (!response.rawData || response.rawData.length === 0) {
            setError('No data available for the selected filters');
            setIsLoading(false);
            return;
          }
        }

        setChartData(response.chartData);
        setRawData(response.rawData);
        setMetadata(null); // Universal endpoint uses different metadata format
      } // End of else block for standard charts

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch chart data';
      setError(errorMessage);
      console.error('Chart data fetch error:', err);
      // Don't retry on error - let the user manually retry
    } finally {
      setIsLoading(false);
    }
  }, [chartType, measure, frequency, practice, practiceUid, providerName, providerUid, startDate, endDate, dateRangePreset, groupBy, calculatedField, colorPalette, stackingMode, stableAdvancedFilters, stableMultipleSeries, stablePeriodComparison, dataSourceId]);

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

    // Skip empty data check for table charts and number charts (they use rawData)
    if (chartType !== 'table' && chartType !== 'number' && chartData.datasets.length === 0) {
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
          // Phase 3: Progress bar uses server-side calculation
          // Data comes pre-calculated from ProgressBarChartHandler
          const dataset = chartData.datasets[0];
          const rawValues = (dataset as any)?.rawValues as number[] | undefined;
          const originalMeasureType = (dataset as any)?.originalMeasureType as string | undefined;

          const progressData = chartData.labels.map((label, index) => ({
            label: String(label),
            // dataset.data contains percentages, rawValues contains actual values
            value: rawValues?.[index] ?? Number(dataset?.data[index] || 0),
            percentage: Number(dataset?.data[index] || 0)
          }));
          return (
            <AnalyticsProgressBarChart
              data={progressData}
              colorPalette={colorPalette}
              measureType={originalMeasureType || chartData.measureType}
              height={height}
            />
          );
        case 'doughnut':
          return <DoughnutChart ref={chartRef} data={chartData} width={width} height={height} />;
        case 'table':
          // Phase 3.2: Pass server-formatted data to table component
          const tableProps = {
            data: rawData,
            columns: dataSourceColumns.map(col => ({
              columnName: col.column_name,
              displayName: col.display_name,
              dataType: col.data_type,
              formatType: col.format_type,
              displayIcon: col.display_icon,
              iconType: col.icon_type,
              iconColorMode: col.icon_color_mode,
              iconColor: col.icon_color,
              iconMapping: col.icon_mapping
            })),
            colorPalette,
            height,
            ...(formattedData && { formattedData })
          };

          return <AnalyticsTableChart {...tableProps} />;
        case 'dual-axis':
          if (!dualAxisConfig) {
            console.error('Dual-axis configuration is missing');
            return <div>Dual-axis configuration is required</div>;
          }
          return (
            <AnalyticsDualAxisChart
              dualAxisConfig={dualAxisConfig}
              chartData={chartData}
              title={title}
              width={width}
              height={height}
              responsive={responsive}
              minHeight={minHeight}
              maxHeight={maxHeight}
              aspectRatio={aspectRatio}
            />
          );
        case 'number':
          return (
            <AnalyticsNumberChart
              data={chartData}
              title={measure}
              animationDuration={2}
              responsive={responsive}
              minHeight={minHeight}
              maxHeight={maxHeight}
              aspectRatio={aspectRatio}
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

  // If loading, show shimmer card instead of entire chart UI
  if (isLoading) {
    return (
      <GlassCard className={`flex flex-col ${className}`}>
        <ChartSkeleton />
      </GlassCard>
    );
  }

  return (
    <GlassCard className={`flex flex-col ${className}`}>
      {/* Chart Header */}
      <header className="px-4 py-2 border-b border-white/20 dark:border-gray-700/50 flex items-center justify-between">
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

          {/* Expand to Fullscreen - For bar, stacked-bar, horizontal-bar, and dual-axis charts */}
          {(chartType === 'bar' || chartType === 'stacked-bar' || chartType === 'horizontal-bar') && (
            <button
              onClick={() => setIsFullscreen(true)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Expand to fullscreen"
              aria-label="Expand chart to fullscreen"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          )}

          {chartType === 'dual-axis' && (
            <button
              onClick={() => setIsDualAxisFullscreen(true)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Expand to fullscreen"
              aria-label="Expand chart to fullscreen"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          )}

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

      {/* Fullscreen Modal */}
      {isFullscreen && (chartType === 'bar' || chartType === 'stacked-bar' || chartType === 'horizontal-bar') && (
        <ChartFullscreenModal
          isOpen={isFullscreen}
          onClose={() => setIsFullscreen(false)}
          chartTitle={title || `${measure} - ${frequency}`}
          chartData={chartData}
          chartType={chartType}
          frequency={frequency}
          stackingMode={stackingMode}
        />
      )}

      {/* Dual-Axis Fullscreen Modal */}
      {isDualAxisFullscreen && chartType === 'dual-axis' && chartData && dualAxisConfig && (
        <DualAxisFullscreenModal
          isOpen={isDualAxisFullscreen}
          onClose={() => setIsDualAxisFullscreen(false)}
          chartTitle={title || 'Dual-Axis Chart'}
          chartData={chartData}
          primaryAxisLabel={dualAxisConfig.primary.axisLabel}
          secondaryAxisLabel={dualAxisConfig.secondary.axisLabel}
        />
      )}
    </GlassCard>
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
