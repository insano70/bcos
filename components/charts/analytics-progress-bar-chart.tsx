'use client';

import { memo, useEffect, useState } from 'react';
import { getPaletteColors } from '@/lib/services/color-palettes';
import { Spinner } from '@/components/ui/spinner';

interface ProgressBarData {
  label: string;
  value: number;
  percentage: number;
}

interface AnalyticsProgressBarChartProps {
  data: ProgressBarData[];
  colorPalette?: string;
  measureType?: string | undefined;
  title?: string;
  height?: number;
}

function AnalyticsProgressBarChartInner({
  data,
  colorPalette = 'default',
  measureType = 'number',
  title,
  height = 400,
}: AnalyticsProgressBarChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{ height: `${height}px` }} className="flex items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        style={{ height: `${height}px` }}
        className="flex flex-col items-center justify-center text-gray-500 dark:text-gray-400"
      >
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <p className="text-sm font-medium">No Data Available</p>
      </div>
    );
  }

  // Get colors from palette
  const colors = getPaletteColors(colorPalette);

  // Function to get color for each item (cycles through palette)
  const getColorForIndex = (index: number): string => {
    return colors[index % colors.length] || '#8B5CF6';
  };

  // Format value based on measure type
  const formatValue = (value: number): string => {
    if (measureType === 'currency') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    } else if (measureType === 'percentage') {
      return `${value.toFixed(1)}%`;
    } else {
      return new Intl.NumberFormat('en-US').format(value);
    }
  };

  // Calculate max value for scaling bars to use full width
  const maxValue = Math.max(...data.map((item) => item.value));

  // Calculate bar width as percentage of max value (so largest bar is ~95% width)
  const getBarWidth = (value: number): number => {
    return (value / maxValue) * 95; // Scale to 95% max width
  };

  return (
    <div style={{ height: `${height}px` }} className="w-full">
      {title && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
      )}

      <div
        className="p-4 overflow-y-auto"
        style={{ maxHeight: title ? `${height - 50}px` : `${height}px` }}
      >
        <ul className="space-y-2">
          {data.map((item, index) => {
            const barColor = getColorForIndex(index);
            const barWidth = getBarWidth(item.value);
            return (
              <li key={`${item.label}-${index}`} className="relative px-3 py-2 rounded-md">
                {/* Progress bar background - scales relative to max value */}
                <div
                  className="absolute inset-y-0 left-0 rounded-r opacity-20 dark:opacity-30 transition-all duration-300"
                  style={{
                    backgroundColor: barColor,
                    width: `${barWidth}%`,
                  }}
                  aria-hidden="true"
                />

                {/* Content */}
                <div className="relative flex justify-between items-center space-x-4">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Color indicator dot */}
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: barColor }}
                      aria-hidden="true"
                    />
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {item.label}
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex items-baseline gap-3">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {formatValue(item.value)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 min-w-[3rem] text-right">
                      {item.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

const AnalyticsProgressBarChart = memo(AnalyticsProgressBarChartInner);
export default AnalyticsProgressBarChart;
