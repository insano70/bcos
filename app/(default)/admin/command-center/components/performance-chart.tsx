'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { Chart, LineController, LineElement, PointElement, LinearScale, TimeScale, Tooltip, Legend } from 'chart.js';
import 'chartjs-adapter-moment';
import type { Chart as ChartType } from 'chart.js';
import { chartColors } from '@/components/charts/chartjs-config';
import { apiClient } from '@/lib/api/client';
import type { PerformanceHistoryResponse } from '@/lib/monitoring/types';
import { BRAND_COLOR } from '@/lib/monitoring/chart-config';

Chart.register(LineController, LineElement, PointElement, LinearScale, TimeScale, Tooltip, Legend);

interface PerformanceChartProps {
  category: 'standard' | 'analytics';
  timeRange: string;
  height?: number;
}

export default function PerformanceChart({
  category,
  timeRange,
  height = 300,
}: PerformanceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await apiClient.get(
          `/api/admin/monitoring/performance-history?timeRange=${timeRange}&category=${category}`
        );
        const data = response as PerformanceHistoryResponse;

        const labels = data.dataPoints.map((dp) => dp.timestamp);
        const p50Data = data.dataPoints.map((dp) => dp.responseTime.p50);
        const p95Data = data.dataPoints.map((dp) => dp.responseTime.p95);
        const p99Data = data.dataPoints.map((dp) => dp.responseTime.p99);

        const chartData = {
          labels,
          datasets: [
            {
              label: 'p50 (median)',
              data: p50Data,
              borderColor: BRAND_COLOR,
              backgroundColor: `${BRAND_COLOR}20`,
              borderWidth: 2,
              tension: 0.4,
              pointRadius: 2,
              pointHoverRadius: 4,
            },
            {
              label: 'p95',
              data: p95Data,
              borderColor: '#8B5CF6',
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              borderWidth: 2,
              tension: 0.4,
              pointRadius: 2,
              pointHoverRadius: 4,
            },
            {
              label: 'p99',
              data: p99Data,
              borderColor: '#F59E0B',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderWidth: 2,
              tension: 0.4,
              pointRadius: 2,
              pointHoverRadius: 4,
            },
          ],
        };

        if (chartRef.current) {
          chartRef.current.data = chartData;
          chartRef.current.update();
        } else if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            chartRef.current = new Chart(ctx, {
              type: 'line',
              data: chartData,
              options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  x: {
                    type: 'time',
                    time: {
                      unit: 'minute',
                      displayFormats: { minute: 'HH:mm' },
                    },
                    grid: { display: false },
                    ticks: {
                      color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
                    },
                  },
                  y: {
                    beginAtZero: true,
                    title: {
                      display: true,
                      text: 'Response Time (ms)',
                      color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
                    },
                    grid: {
                      color: darkMode ? chartColors.gridColor.dark : chartColors.gridColor.light,
                    },
                    ticks: {
                      color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
                    },
                  },
                },
                plugins: {
                  legend: {
                    display: true,
                    position: 'top',
                    labels: {
                      color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
                    },
                  },
                  tooltip: {
                    backgroundColor: darkMode ? chartColors.tooltipBgColor.dark : chartColors.tooltipBgColor.light,
                    titleColor: darkMode ? chartColors.tooltipTitleColor.dark : chartColors.tooltipTitleColor.light,
                    bodyColor: darkMode ? chartColors.tooltipBodyColor.dark : chartColors.tooltipBodyColor.light,
                    borderColor: darkMode ? chartColors.tooltipBorderColor.dark : chartColors.tooltipBorderColor.light,
                    borderWidth: 1,
                  },
                },
              },
            });
          }
        }

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load performance data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [timeRange, category, darkMode]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6" style={{ height }}>
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
        {category === 'standard' ? 'API' : 'Analytics'} Response Times
      </h3>
      {loading && <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div></div>}
      {error && <div className="text-center text-red-600 py-8">{error}</div>}
      {!loading && !error && <canvas ref={canvasRef} />}
    </div>
  );
}

