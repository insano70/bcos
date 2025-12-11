'use client';

import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { ChartData } from '@/lib/types/analytics';
import type { ResponsiveChartProps } from '@/lib/types/responsive-charts';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  format?: 'currency' | 'number' | 'percentage';
  decimals?: number;
}

function AnimatedCounter({
  value,
  duration = 2,
  format = 'number',
  decimals = 0,
}: AnimatedCounterProps) {
  const spring = useSpring(0, {
    mass: 0.8,
    stiffness: 75,
    damping: 15,
    duration: duration * 1000,
  });

  const display = useTransform(spring, (current) => {
    const rounded = decimals > 0 ? Number(current.toFixed(decimals)) : Math.round(current);

    if (format === 'currency') {
      return `$${rounded.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    } else if (format === 'percentage') {
      return `${rounded.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
    } else {
      return rounded.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
  });

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    spring.set(value);
  }, [spring, value]);

  if (!mounted) {
    if (format === 'currency') return <span>$0</span>;
    if (format === 'percentage') return <span>0%</span>;
    return <span>0</span>;
  }

  return <motion.span>{display}</motion.span>;
}

interface AnalyticsNumberChartProps extends ResponsiveChartProps {
  data: ChartData | Array<Record<string, unknown>>; // Phase 3: Supports both ChartData and raw data array
  title?: string | undefined;
  format?: 'currency' | 'number' | 'percentage' | undefined;
  animationDuration?: number | undefined;
  className?: string | undefined;
  /** Size variant for different contexts - 'large' for fullscreen modals */
  size?: 'default' | 'large' | undefined;
}

export default function AnalyticsNumberChart({
  data,
  title,
  format,
  animationDuration = 2,
  className = '',
  responsive = false,
  minHeight = 200,
  maxHeight = 400,
  size = 'default',
}: AnalyticsNumberChartProps) {
  // Phase 3: Server-side aggregation complete
  // Data now comes pre-aggregated from MetricChartHandler
  // Extract the value - supports both old format (raw data) and new format (ChartData)
  let value = 0;
  let measureType = 'number';

  // Check if data is in new ChartData format (from universal endpoint)
  if (data && typeof data === 'object' && 'datasets' in data) {
    // New format: ChartData with datasets
    const chartData = data as ChartData;
    const datasets = chartData.datasets;
    if (datasets && datasets.length > 0) {
      const dataset = datasets[0];
      if (dataset?.data) {
        const dataArray = dataset.data as number[];
        value = dataArray[0] || 0;
        measureType = (dataset.measureType as string) || 'number';
      }
    }
  } else if (Array.isArray(data) && data.length > 0) {
    // Old format: raw data array (backward compatibility)
    value = typeof data[0]?.measure_value === 'number' ? data[0].measure_value : 0;
    measureType = (data[0]?.measure_type as string) || 'number';
  }

  // Determine format from measure_type if not explicitly provided
  const displayFormat =
    format ||
    ((measureType === 'currency' ? 'currency' : 'number') as 'currency' | 'number' | 'percentage');

  // Determine decimals: 0 for currency and large numbers, 1 for percentages
  const decimals = displayFormat === 'percentage' ? 1 : 0;

  // Calculate formatted string to determine character count for dynamic font sizing
  const getFormattedString = (val: number): string => {
    const rounded = decimals > 0 ? Number(val.toFixed(decimals)) : Math.round(val);

    if (displayFormat === 'currency') {
      return `$${rounded.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    } else if (displayFormat === 'percentage') {
      return `${rounded.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
    } else {
      return rounded.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
  };

  const formattedValue = getFormattedString(value);
  const charCount = formattedValue.length;

  // Dynamic font size based on character count and size variant
  // Mobile-first with responsive scaling: smaller on mobile (<640px), larger on desktop (≥640px)
  // Mobile sizes reduced to prevent overflow on narrow screens (iPhone, etc.)
  // 'large' size variant provides bigger fonts for fullscreen modals
  let fontSizeClass = 'text-3xl sm:text-7xl'; // default

  if (size === 'large') {
    // Large size for fullscreen modals - bigger fonts
    if (charCount <= 5) {
      fontSizeClass = 'text-6xl sm:text-8xl md:text-9xl'; // ≤5 chars
    } else if (charCount <= 8) {
      fontSizeClass = 'text-5xl sm:text-7xl md:text-8xl'; // 6-8 chars
    } else if (charCount <= 12) {
      fontSizeClass = 'text-4xl sm:text-6xl md:text-7xl'; // 9-12 chars
    } else if (charCount <= 16) {
      fontSizeClass = 'text-3xl sm:text-5xl md:text-6xl'; // 13-16 chars
    } else {
      fontSizeClass = 'text-2xl sm:text-4xl md:text-5xl'; // 17+ chars
    }
  } else {
    // Default size
    if (charCount <= 5) {
      fontSizeClass = 'text-5xl sm:text-9xl'; // ≤5 chars: $123, 45.5% (48px→128px)
    } else if (charCount <= 8) {
      fontSizeClass = 'text-4xl sm:text-8xl'; // 6-8 chars: $1,234, 12.3% (36px→96px)
    } else if (charCount <= 12) {
      fontSizeClass = 'text-3xl sm:text-7xl'; // 9-12 chars: $1,234,567 (30px→72px)
    } else if (charCount <= 16) {
      fontSizeClass = 'text-2xl sm:text-6xl'; // 13-16 chars: $123,456,789 (24px→60px)
    } else {
      fontSizeClass = 'text-xl sm:text-5xl'; // 17+ chars: $1,234,567,890 (20px→48px)
    }
  }

  // Responsive sizing
  const containerStyle = responsive
    ? { minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` }
    : undefined;

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center ${className}`}
      style={containerStyle}
    >
      <div className="text-center">
        {title && (
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-4">{title}</p>
        )}
        <div
          className={`${fontSizeClass} font-bold text-slate-800 dark:text-white truncate max-w-full px-4`}
        >
          <AnimatedCounter
            value={value}
            format={displayFormat}
            decimals={decimals}
            duration={animationDuration}
          />
        </div>
      </div>
    </div>
  );
}
