'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { createPortal } from 'react-dom';
import {
  Chart,
  BarController,
  BarElement,
  LinearScale,
  CategoryScale,
  TimeScale,
  Tooltip,
  Legend,
} from 'chart.js';
import type { Chart as ChartType } from 'chart.js';
import type { ChartData } from '@/lib/types/analytics';
import 'chartjs-adapter-moment';
import moment from 'moment';
import zoomPlugin from 'chartjs-plugin-zoom';
import { chartColors } from '@/components/charts/chartjs-config';
import { simplifiedChartTransformer } from '@/lib/utils/simplified-chart-transformer';
import { createPeriodComparisonTooltipCallbacks } from '@/lib/utils/period-comparison-tooltips';
import { createPeriodComparisonLegendLabels, createPeriodComparisonHtmlLegend } from '@/lib/utils/period-comparison-legend';

// Register zoom plugin (moved inside component to avoid affecting global Chart.js state at module load time)
let pluginsRegistered = false;

interface ChartFullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartTitle: string;
  chartData: ChartData;
  chartType: 'bar' | 'stacked-bar' | 'horizontal-bar';
  frequency?: string;
  stackingMode?: 'normal' | 'percentage';
}

export default function ChartFullscreenModal({
  isOpen,
  onClose,
  chartTitle,
  chartData,
  chartType,
  frequency = 'Monthly',
  stackingMode = 'normal',
}: ChartFullscreenModalProps) {
  const [chart, setChart] = useState<ChartType | null>(null);
  const [mounted, setMounted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const legendRef = useRef<HTMLUListElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';

  // Callback ref to ensure canvas is mounted
  const setCanvasRef = (element: HTMLCanvasElement | null) => {
    canvasRef.current = element;
  };

  // Handle client-side mounting for portal and register plugins
  useEffect(() => {
    if (!pluginsRegistered) {
      Chart.register(BarController, BarElement, LinearScale, CategoryScale, TimeScale, Tooltip, Legend, zoomPlugin);
      pluginsRegistered = true;
    }
    setMounted(true);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // Configure time display formats based on frequency
  const getTimeConfig = () => {
    switch (frequency) {
      case 'Weekly':
        return {
          unit: 'week',
          displayFormats: {
            week: 'DD-MMM-YY',
          },
          tooltipFormat: 'DD-MMM-YYYY'
        };
      case 'Monthly':
        return {
          unit: 'month',
          displayFormats: {
            month: 'MMM YYYY',
          },
          tooltipFormat: 'MMM YYYY'
        };
      case 'Quarterly':
        return {
          unit: 'quarter',
          displayFormats: {
            quarter: '[Q]Q YYYY',
          },
          tooltipFormat: '[Q]Q YYYY'
        };
      default:
        return {
          unit: 'month',
          displayFormats: {
            month: 'MMM YYYY',
          },
          tooltipFormat: 'MMM YYYY'
        };
    }
  };

  // Initialize chart
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !chartData) return;

    const ctx = canvasRef.current;
    const timeConfig = getTimeConfig();

    // Get fresh color values inside useEffect to ensure they're read after theme is loaded
    const { textColor, gridColor, tooltipBodyColor, tooltipBgColor, tooltipBorderColor } = chartColors;

    // Check if this is period comparison data
    const hasPeriodComparison = chartData.datasets.some(ds =>
      ds.label?.includes('Current Period') || ds.label?.includes('Previous Period')
    );

    // Convert our ChartData to Chart.js ChartData format
    const chartjsData = {
      labels: chartData.labels,
      datasets: chartData.datasets,
    };

    const isHorizontal = chartType === 'horizontal-bar';

    const newChart = new Chart(ctx, {
      type: 'bar',
      data: chartjsData,
      options: {
        indexAxis: isHorizontal ? 'y' : 'x', // Horizontal bars use 'y' as the index axis
        layout: {
          padding: {
            top: 8,
            bottom: 4,
            left: 12,
            right: 12,
          },
        },
        scales: isHorizontal ? {
          // For horizontal bars: X is value, Y is category
          x: {
            border: {
              display: false,
            },
            grid: {
              color: darkMode ? gridColor.dark : gridColor.light,
            },
            beginAtZero: true,
            ticks: {
              maxTicksLimit: 5,
              color: darkMode ? textColor.dark : textColor.light,
              font: {
                size: 14,
              },
              callback: (value: string | number) => {
                const numValue = typeof value === 'string' ? parseFloat(value) : value;
                const measureType = chartData.measureType || 'number';
                return simplifiedChartTransformer.formatValueCompact(numValue, measureType);
              },
            },
          },
          y: {
            type: 'category',
            border: {
              display: false,
            },
            grid: {
              display: false,
            },
            ticks: {
              color: darkMode ? textColor.dark : textColor.light,
              font: {
                size: 14,
              },
            },
          },
        } : {
          // For vertical bars: X is category, Y is value
          x: {
            type: 'category',
            stacked: chartType === 'stacked-bar',
            border: {
              display: false,
            },
            grid: {
              display: false,
            },
            ticks: {
              color: darkMode ? textColor.dark : textColor.light,
              maxRotation: 0,
              autoSkipPadding: 48,
              font: {
                size: 14,
              },
            },
          },
          y: {
            stacked: chartType === 'stacked-bar',
            border: {
              display: false,
            },
            grid: {
              color: darkMode ? gridColor.dark : gridColor.light,
            },
            beginAtZero: true,
            max: chartType === 'stacked-bar' && stackingMode === 'percentage' ? 100 : undefined,
            ticks: {
              maxTicksLimit: 5,
              color: darkMode ? textColor.dark : textColor.light,
              font: {
                size: 14, // Larger font for fullscreen
              },
              callback: (value: string | number) => {
                const numValue = typeof value === 'string' ? parseFloat(value) : value;

                if (chartType === 'stacked-bar' && stackingMode === 'percentage') {
                  return `${numValue}%`;
                }

                const measureType = chartData.measureType || 'number';
                return simplifiedChartTransformer.formatValueCompact(numValue, measureType);
              },
            },
          },
        },
        interaction: {
          mode: 'nearest',
          intersect: true,
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: (hasPeriodComparison
            ? createPeriodComparisonTooltipCallbacks(frequency, darkMode)
            : {
              enabled: true,
              mode: 'nearest',
              intersect: true,
              backgroundColor: darkMode ? tooltipBgColor.dark : tooltipBgColor.light,
              borderColor: darkMode ? tooltipBorderColor.dark : tooltipBorderColor.light,
              borderWidth: 1,
              titleColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
              bodyColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
              bodySpacing: 8,
              padding: 12,
              boxPadding: 6,
              usePointStyle: true,
              callbacks: {
                title: (context: { label?: string }[]) => {
                  const labelValue = context[0]?.label || '';
                  const parsedDate = moment(labelValue, ['YYYY-MM-DD', 'MMM YYYY', 'DD-MMM-YY', moment.ISO_8601], true);

                  if (!parsedDate.isValid()) {
                    return labelValue;
                  }

                  if (frequency === 'Weekly') {
                    return parsedDate.format('MMM D, YYYY');
                  } else if (frequency === 'Quarterly') {
                    return parsedDate.format('[Q]Q YYYY');
                  } else {
                    return parsedDate.format('MMM YYYY');
                  }
                },
                label: (context: { dataset: { label?: string }; parsed: { y: number } }) => {
                  const label = context.dataset.label || '';
                  const value = context.parsed.y;
                  const measureType = chartData.measureType || 'number';
                  const formattedValue = simplifiedChartTransformer.formatValue(value, measureType);

                  if (chartType === 'stacked-bar' && stackingMode === 'percentage') {
                    return `${label}: ${value.toFixed(1)}%`;
                  }

                  return `${label}: ${formattedValue}`;
                },
              },
            }) as never,
          zoom: {
            pan: {
              enabled: true,
              mode: isHorizontal ? 'y' : 'x', // Horizontal: pan on Y (categories), Vertical: pan on X (categories)
            },
            zoom: {
              wheel: {
                enabled: true,
                speed: 0.05, // Slower zoom speed (was 0.1)
              },
              pinch: {
                enabled: true,
              },
              mode: isHorizontal ? 'y' : 'x', // Horizontal: zoom on Y (categories), Vertical: zoom on X (categories)
            },
            limits: isHorizontal ? {
              x: { min: 0, max: 'original' }, // Keep value axis full range
              y: { min: 'original', max: 'original' }, // Allow zooming on category axis
            } : {
              x: { min: 'original', max: 'original' }, // Allow zooming on category axis
              y: { min: 0, max: 'original' }, // Keep value axis full range
            },
          },
        },
        responsive: true,
        maintainAspectRatio: false,
      },
    });

    setChart(newChart);

    // Generate HTML legend
    if (legendRef.current) {
      const ul = legendRef.current;
      ul.innerHTML = '';

      if (hasPeriodComparison) {
        createPeriodComparisonHtmlLegend(newChart, ul, {});
      } else {
        const items = newChart.options.plugins?.legend?.labels?.generateLabels?.(newChart);

        // Calculate totals and sort by value
        const itemsWithTotals = items?.map((item) => {
          const dataset = newChart.data.datasets[item.datasetIndex!];
          const dataArray = dataset?.data || [];
          const total = dataArray.reduce((sum: number, value: unknown) => {
            if (typeof value === 'number') {
              return sum + value;
            } else if (value && typeof value === 'object' && 'y' in value) {
              const yValue = (value as { y: unknown }).y;
              return sum + (typeof yValue === 'number' ? yValue : 0);
            }
            return sum;
          }, 0) as number;
          return { item, total };
        }) || [];

        itemsWithTotals.sort((a, b) => b.total - a.total);

        itemsWithTotals.forEach(({ item, total }) => {
          const li = document.createElement('li');
          li.className = 'flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded transition-colors';

          const colorBox = document.createElement('span');
          colorBox.className = 'block w-3 h-3 rounded-sm mr-2 flex-shrink-0';
          colorBox.style.backgroundColor = String(item.fillStyle);
          colorBox.style.borderColor = String(item.strokeStyle);
          colorBox.style.borderWidth = `${item.lineWidth}px`;

          const labelContainer = document.createElement('div');
          labelContainer.className = 'flex items-center flex-1 min-w-0';
          labelContainer.appendChild(colorBox);

          const labelText = document.createElement('span');
          labelText.className = 'text-sm text-gray-600 dark:text-gray-400 truncate';
          labelText.textContent = item.text;
          labelContainer.appendChild(labelText);

          const valueSpan = document.createElement('span');
          valueSpan.className = 'text-[15px] font-semibold text-gray-800 dark:text-gray-100 ml-3';
          const measureType = chartData.measureType || 'number';
          valueSpan.textContent = simplifiedChartTransformer.formatValue(total, measureType);

          li.appendChild(labelContainer);
          li.appendChild(valueSpan);

          li.onclick = () => {
            const index = item.datasetIndex!;
            const meta = newChart.getDatasetMeta(index);
            meta.hidden = !meta.hidden;
            newChart.update();
          };

          ul.appendChild(li);
        });
      }
    }

    return () => {
      newChart.destroy();
    };
  }, [isOpen, mounted, chartData, chartType, frequency, stackingMode, darkMode]);

  const handleResetZoom = () => {
    if (chart) {
      chart.resetZoom();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen || !mounted) {
    return null;
  }

  const modalContent = (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 sm:p-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fullscreen-chart-title"
    >
      <div
        className="bg-white dark:bg-gray-800 sm:rounded-xl shadow-2xl w-full h-full sm:h-auto sm:max-w-7xl sm:max-h-[95vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <h2
            id="fullscreen-chart-title"
            className="font-semibold text-gray-800 dark:text-gray-100 text-lg"
          >
            {chartTitle}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetZoom}
              className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md transition-colors"
              aria-label="Reset zoom level"
            >
              Reset Zoom
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Close fullscreen view"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </header>

        {/* Chart Content */}
        <div className="flex-1 p-6 overflow-auto">
          <div className="w-full h-[calc(90vh-200px)] min-h-[400px]">
            <canvas ref={setCanvasRef} />
          </div>

          {/* Legend */}
          <div className="mt-4">
            <ul
              ref={legendRef}
              className="flex flex-wrap gap-x-6 gap-y-2 max-h-60 overflow-y-auto px-2 py-1"
            />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
