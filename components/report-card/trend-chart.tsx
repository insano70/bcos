'use client';

import { motion } from 'framer-motion';
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState, useMemo } from 'react';
import type { PracticeTrend } from '@/lib/types/report-card';
import type { TrendPeriod } from '@/lib/constants/report-card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getReportCardMonth, getPriorMonthsRange, getYearOverYearRange } from '@/lib/utils/format-value';

// Register Chart.js components
Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Tooltip,
  Filler,
  Legend
);

interface TrendChartProps {
  trends: PracticeTrend[];
  selectedPeriod: TrendPeriod;
  onPeriodChange: (period: TrendPeriod) => void;
  className?: string;
}

/**
 * Get color and icon for trend direction
 * Labels now reference the report card month explicitly
 */
function getTrendDisplay(
  direction: string,
  percentage: number,
  shortMonth: string
): {
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  label: string;
} {
  const absPercent = Math.abs(percentage);
  const sign = percentage > 0 ? '+' : '';

  switch (direction) {
    case 'improving':
      return {
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
        icon: <TrendingUp className="w-4 h-4" />,
        label: `${shortMonth}: ${sign}${absPercent.toFixed(1)}%`,
      };
    case 'declining':
      return {
        color: 'text-rose-600 dark:text-white',
        bgColor: 'bg-rose-100 dark:bg-rose-900/30',
        icon: <TrendingDown className="w-4 h-4" />,
        label: `${shortMonth}: ${sign}${percentage.toFixed(1)}%`,
      };
    default:
      return {
        color: 'text-slate-500',
        bgColor: 'bg-slate-100 dark:bg-slate-800',
        icon: <Minus className="w-4 h-4" />,
        label: `${shortMonth}: Stable`,
      };
  }
}

/**
 * Format measure name for display
 */
function formatMeasureName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Trend Chart Component
 *
 * Displays trend visualization comparing Report Card Month to historical data.
 * - 3 Month: Report Card Month vs Average of prior 3 months
 * - 6 Month: Report Card Month vs Average of prior 6 months
 * - Year-over-Year: Report Card Month vs Same month last year (direct comparison)
 */
export default function TrendChart({
  trends,
  selectedPeriod,
  onPeriodChange,
  className = '',
}: TrendChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<'line'> | null>(null);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';
  const [mounted, setMounted] = useState(false);

  // Get report card month info
  const reportCardMonthInfo = useMemo(() => getReportCardMonth(), []);
  const { shortMonth, monthYear, date: reportCardDate } = reportCardMonthInfo;

  // Get period options with dynamic labels
  const periodOptions = useMemo(() => {
    const yoyRange = getYearOverYearRange(reportCardDate);
    return [
      {
        value: '3_month' as TrendPeriod,
        months: 3,
        label: 'vs Prior 3 Mo',
        rangeInfo: getPriorMonthsRange(reportCardDate, 3),
        isYoY: false,
      },
      {
        value: '6_month' as TrendPeriod,
        months: 6,
        label: 'vs Prior 6 Mo',
        rangeInfo: getPriorMonthsRange(reportCardDate, 6),
        isYoY: false,
      },
      {
        value: 'year_over_year' as TrendPeriod,
        months: 12,
        label: 'vs Last Year',
        rangeInfo: yoyRange,
        isYoY: true,
      },
    ];
  }, [reportCardDate]);

  // Track mounted state for SSR
  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter trends by selected period
  const filteredTrends = trends.filter((t) => t.trend_period === selectedPeriod);

  // Get period info for selected period
  const periodInfo = periodOptions.find((p) => p.value === selectedPeriod);
  const priorRange = periodInfo?.rangeInfo.rangeLabel || '';

  // Chart initialization and updates
  useEffect(() => {
    if (!mounted || !canvasRef.current) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (filteredTrends.length === 0) return;

    const ctx = canvasRef.current;
    const labels = filteredTrends.map((t) => formatMeasureName(t.measure_name));
    const data = filteredTrends.map((t) => t.trend_percentage);

    // Create gradient colors based on positive/negative values
    const backgroundColors = data.map((value) =>
      value >= 0
        ? 'rgba(16, 185, 129, 0.8)' // emerald
        : 'rgba(244, 63, 94, 0.8)' // rose
    );

    const borderColors = data.map((value) =>
      value >= 0 ? 'rgb(16, 185, 129)' : 'rgb(244, 63, 94)'
    );

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: periodInfo?.isYoY ? `${shortMonth} vs ${priorRange}` : `${shortMonth} vs ${priorRange} Avg`,
            data,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 3,
            pointBackgroundColor: borderColors,
            pointBorderColor: darkMode ? '#1e293b' : '#fff',
            pointBorderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8,
            fill: false,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: darkMode ? '#94a3b8' : '#64748b',
              font: { size: 12 },
              usePointStyle: true,
              pointStyle: 'circle',
            },
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 12,
            callbacks: {
              title: (context) => {
                const idx = context[0]?.dataIndex ?? 0;
                return filteredTrends[idx]?.measure_name
                  ? formatMeasureName(filteredTrends[idx].measure_name)
                  : '';
              },
              label: (context) => {
                const value = context.parsed?.y ?? 0;
                const sign = value > 0 ? '+' : '';
                if (periodInfo?.isYoY) {
                  return `${shortMonth} is ${sign}${value.toFixed(1)}% vs ${priorRange}`;
                }
                return `${shortMonth} is ${sign}${value.toFixed(1)}% vs ${priorRange} average`;
              },
              afterLabel: () => {
                if (periodInfo?.isYoY) {
                  return `Comparing ${monthYear} to same month last year`;
                }
                return `Comparing ${monthYear} to prior ${periodInfo?.months || 3} months`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
            ticks: {
              color: darkMode ? '#94a3b8' : '#64748b',
              font: {
                size: 11,
              },
              maxRotation: 45,
              minRotation: 45,
            },
          },
          y: {
            grid: {
              color: darkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.2)',
            },
            ticks: {
              color: darkMode ? '#94a3b8' : '#64748b',
              callback: (value) => {
                if (typeof value === 'number') {
                  return `${value > 0 ? '+' : ''}${value}%`;
                }
                return value;
              },
            },
            title: {
              display: true,
              text: periodInfo?.isYoY
                ? `% Change (${shortMonth} vs Last Year)`
                : `% Change (${shortMonth} vs Historical Avg)`,
              color: darkMode ? '#94a3b8' : '#64748b',
              font: { size: 11 },
            },
          },
        },
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [mounted, filteredTrends, darkMode, shortMonth, priorRange, monthYear, periodInfo?.months, periodInfo?.isYoY]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 ${className}`}
    >
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
            {shortMonth} vs Historical Trends
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {periodInfo?.isYoY
              ? `How ${monthYear} compared to ${priorRange}`
              : `How ${monthYear} compared to the prior ${periodInfo?.months || 3} months average`}
          </p>
        </div>

        {/* Period selector */}
        <div className="flex gap-2">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onPeriodChange(option.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                selectedPeriod === option.value
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
              title={`${shortMonth} vs ${option.rangeInfo.rangeLabel} average`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {filteredTrends.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-slate-500 dark:text-slate-400">
              {periodInfo?.isYoY
                ? `No trend data available for ${shortMonth} vs ${priorRange}`
                : `No trend data available for ${shortMonth} vs prior ${periodInfo?.months || 3} months`}
            </p>
          </div>
        ) : (
          <div className="h-64">
            <canvas ref={canvasRef} />
          </div>
        )}

        {/* Trend summary cards */}
        {filteredTrends.length > 0 && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredTrends.map((trend) => {
              const display = getTrendDisplay(trend.trend_direction, trend.trend_percentage, shortMonth);
              return (
                <div
                  key={`${trend.measure_name}-${trend.trend_period}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg ${display.bgColor}`}
                >
                  <span className={display.color}>{display.icon}</span>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs text-slate-600 dark:text-slate-400 block truncate">
                      {formatMeasureName(trend.measure_name)}
                    </span>
                    <span className={`text-sm font-medium ${display.color}`}>
                      {display.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
