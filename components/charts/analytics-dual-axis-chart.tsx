'use client';

import { useState, useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import type { ChartData as ChartJSData, ChartConfiguration } from 'chart.js';
import { ChartData, type DualAxisConfig, type ChartFilter, AggAppMeasure } from '@/lib/types/analytics';
import { apiClient } from '@/lib/api/client';
import { ChartSkeleton } from '@/components/ui/loading-skeleton';
import { chartColors } from '@/components/charts/chartjs-config';
import { simplifiedChartTransformer } from '@/lib/utils/simplified-chart-transformer';

// Register Chart.js components
Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface AnalyticsDualAxisChartProps {
  dualAxisConfig: DualAxisConfig; // Required since checked before passing
  frequency?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  groupBy?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  title?: string | undefined;
  calculatedField?: string | undefined;
  advancedFilters?: ChartFilter[] | undefined;
  dataSourceId?: number | undefined;
  colorPalette?: string | undefined;
}

interface ApiResponse {
  measures: AggAppMeasure[];
  pagination: {
    total_count: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
  metadata: {
    query_time_ms: number;
    cache_hit: boolean;
    generatedAt: string;
  };
}

export default function AnalyticsDualAxisChart({
  dualAxisConfig,
  frequency = 'Monthly',
  startDate,
  endDate,
  groupBy = 'none',
  width = 800,
  height = 400,
  title,
  calculatedField,
  advancedFilters = [],
  dataSourceId,
  colorPalette = 'default'
}: AnalyticsDualAxisChartProps) {
  const [chartData, setChartData] = useState<ChartData>({ labels: [], datasets: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chart, setChart] = useState<Chart | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';
  const { textColor, gridColor, tooltipBodyColor, tooltipBgColor, tooltipBorderColor } = chartColors;

  useEffect(() => {
    const fetchDualMeasureData = async () => {
      if (!dualAxisConfig || !dualAxisConfig.enabled) {
        setError('Dual-axis configuration is required');
        setIsLoading(false);
        return;
      }

      if (!dualAxisConfig.primary.measure || !dualAxisConfig.secondary.measure) {
        setError('Both primary and secondary measures are required');
        setIsLoading(false);
        return;
      }

      if (dualAxisConfig.primary.measure === dualAxisConfig.secondary.measure) {
        setError('Primary and secondary measures must be different');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Fetch data for both measures in parallel with better error handling
        const [primaryResult, secondaryResult] = await Promise.allSettled([
          fetchMeasureData(dualAxisConfig.primary.measure),
          fetchMeasureData(dualAxisConfig.secondary.measure)
        ]);

        // Check if primary fetch failed
        if (primaryResult.status === 'rejected') {
          throw new Error(`Failed to fetch primary measure "${dualAxisConfig.primary.measure}": ${primaryResult.reason}`);
        }

        // Check if secondary fetch failed
        if (secondaryResult.status === 'rejected') {
          throw new Error(`Failed to fetch secondary measure "${dualAxisConfig.secondary.measure}": ${secondaryResult.reason}`);
        }

        // Transform data using SimplifiedChartTransformer
        const transformedData = simplifiedChartTransformer.transformDualAxisData(
          primaryResult.value,
          secondaryResult.value,
          dualAxisConfig.primary.axisLabel || dualAxisConfig.primary.measure,
          dualAxisConfig.secondary.axisLabel || dualAxisConfig.secondary.measure,
          dualAxisConfig.secondary.chartType,
          groupBy,
          colorPalette
        );

        setChartData(transformedData);
      } catch (err) {
        console.error('Failed to fetch dual-axis data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load chart data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDualMeasureData();
  }, [
    dualAxisConfig,
    frequency,
    startDate,
    endDate,
    groupBy,
    calculatedField,
    advancedFilters,
    dataSourceId,
    colorPalette
  ]);

  // Helper function to fetch data for a single measure
  const fetchMeasureData = async (measure: string): Promise<AggAppMeasure[]> => {
    const params = new URLSearchParams({
      frequency,
      measure,
      ...(groupBy && groupBy !== 'none' && { group_by: groupBy }),
      ...(startDate && { start_date: startDate }),
      ...(endDate && { end_date: endDate }),
      ...(dataSourceId && { data_source_id: dataSourceId.toString() })
    });

    if (calculatedField) {
      params.append('calculated_field', calculatedField);
    }

    if (advancedFilters.length > 0) {
      params.append('advanced_filters', JSON.stringify(advancedFilters));
    }

    const response = await apiClient.get<ApiResponse>(
      `/api/admin/analytics/measures?${params.toString()}`
    );

    return response.measures;
  };

  // Cleanup chart on unmount
  useEffect(() => {
    return () => {
      if (chart) {
        chart.destroy();
      }
    };
  }, []); // Run only on unmount

  // Create and update chart with Chart.js
  useEffect(() => {
    if (!canvas.current || !chartData || chartData.datasets.length === 0) return;

    // Destroy existing chart before creating new one
    if (chart) {
      chart.destroy();
    }

    const ctx = canvas.current.getContext('2d');
    if (!ctx) return;

    // Create chart configuration
    const config: ChartConfiguration = {
      type: 'bar',
      data: chartData as ChartJSData<'bar'>,
      options: {
        layout: {
          padding: 0,
        },
        scales: {
          x: {
            display: true,
            grid: {
              display: false,
            },
            ticks: {
              color: darkMode ? textColor.dark : textColor.light,
              font: {
                size: 11,
              },
              maxRotation: 45,
              minRotation: 0,
            },
          },
          'y-left': {
            type: 'linear',
            position: 'left',
            display: true,
            title: {
              display: !!dualAxisConfig?.primary.axisLabel,
              text: dualAxisConfig?.primary.axisLabel || '',
              color: darkMode ? textColor.dark : textColor.light,
              font: {
                size: 12,
                weight: 'bold',
              },
            },
            grid: {
              color: darkMode ? gridColor.dark : gridColor.light,
            },
            ticks: {
              color: darkMode ? textColor.dark : textColor.light,
              font: {
                size: 11,
              },
              callback: function(tickValue: string | number) {
                const value = Number(tickValue);
                const primaryMeasureType = chartData.datasets[0]?.measureType;
                return simplifiedChartTransformer.formatValueCompact(value, primaryMeasureType || 'number');
              },
            },
          },
          'y-right': {
            type: 'linear',
            position: 'right',
            display: true,
            title: {
              display: !!dualAxisConfig?.secondary.axisLabel,
              text: dualAxisConfig?.secondary.axisLabel || '',
              color: darkMode ? textColor.dark : textColor.light,
              font: {
                size: 12,
                weight: 'bold',
              },
            },
            grid: {
              drawOnChartArea: false, // Only show grid for left y-axis
            },
            ticks: {
              color: darkMode ? textColor.dark : textColor.light,
              font: {
                size: 11,
              },
              callback: function(tickValue: string | number) {
                const value = Number(tickValue);
                const secondaryMeasureType = chartData.datasets[1]?.measureType;
                return simplifiedChartTransformer.formatValueCompact(value, secondaryMeasureType || 'number');
              },
            },
          },
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 15,
              color: darkMode ? textColor.dark : textColor.light,
              font: {
                size: 12,
              },
            },
          },
          title: {
            display: !!title,
            text: title || '',
            color: darkMode ? textColor.dark : textColor.light,
            font: {
              size: 16,
              weight: 'bold',
            },
            padding: {
              top: 10,
              bottom: 20,
            },
          },
          tooltip: {
            backgroundColor: darkMode ? tooltipBgColor.dark : tooltipBgColor.light,
            titleColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
            bodyColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
            borderColor: darkMode ? tooltipBorderColor.dark : tooltipBorderColor.light,
            borderWidth: 1,
            padding: 12,
            displayColors: true,
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || '';
                const value = context.parsed.y;
                const measureType = (context.dataset as unknown as { measureType?: string }).measureType;
                const formattedValue = simplifiedChartTransformer.formatValue(value, measureType || 'number');
                return `${label}: ${formattedValue}`;
              },
            },
          },
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        responsive: true,
        maintainAspectRatio: false,
      },
    };

    const newChart = new Chart(ctx, config);
    setChart(newChart);
  }, [chartData, darkMode, theme, title, dualAxisConfig, chart]);

  if (isLoading) {
    return <ChartSkeleton height={height} />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-8" style={{ height }}>
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 font-medium mb-2">Chart Error</p>
          <p className="text-sm text-red-500 dark:text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  if (chartData.datasets.length === 0) {
    return (
      <div className="flex items-center justify-center bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-8" style={{ height }}>
        <p className="text-gray-500 dark:text-gray-400">No data available</p>
      </div>
    );
  }

  return (
    <div style={{ width, height }}>
      <canvas ref={canvas} width={width} height={height}></canvas>
    </div>
  );
}
