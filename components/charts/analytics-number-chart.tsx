'use client';

import { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
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
  decimals = 0
}: AnimatedCounterProps) {
  const spring = useSpring(0, {
    mass: 0.8,
    stiffness: 75,
    damping: 15,
    duration: duration * 1000
  });

  const display = useTransform(spring, (current) => {
    const rounded = decimals > 0 ? Number(current.toFixed(decimals)) : Math.round(current);

    if (format === 'currency') {
      return `$${rounded.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    } else if (format === 'percentage') {
      return `${rounded.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
    } else {
      return rounded.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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
  data: Array<Record<string, unknown>>;
  title?: string | undefined;
  format?: 'currency' | 'number' | 'percentage' | undefined;
  animationDuration?: number | undefined;
  className?: string | undefined;
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
}: AnalyticsNumberChartProps) {
  // Extract the total value (should be a single aggregated value from API)
  const value = typeof data[0]?.measure_value === 'number' ? data[0].measure_value : 0;

  // Determine format from measure_type if not explicitly provided
  const displayFormat = format || (data[0]?.measure_type === 'currency' ? 'currency' : 'number');

  // Determine decimals: 0 for currency and large numbers, 1 for percentages
  const decimals = displayFormat === 'percentage' ? 1 : 0;

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
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-4">
            {title}
          </p>
        )}
        <div className="text-7xl font-bold text-slate-800 dark:text-white">
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
