'use client';

import { memo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';

/**
 * Animation configuration for dashboard chart cards
 * Shared across all chart card variants for consistent entrance animations
 */
export const CHART_CARD_ANIMATION = {
  initial: { opacity: 0, y: 12, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: (index: number) => ({
    duration: 0.4,
    delay: index * 0.06,
    ease: [0.25, 0.46, 0.45, 0.94] as const,
  }),
} as const;

interface DashboardCardFrameProps {
  /** Unique key for the chart card */
  id: string;
  /** Chart index for staggered animation */
  chartIndex: number;
  /** Responsive column span class */
  colSpanClass: string;
  /** Container height in pixels */
  containerHeight: number;
  /** Layout margin in pixels */
  layoutMargin: number;
  /** Whether in mobile mode (adds tap styling) */
  isMobile: boolean;
  /** Click handler (for mobile tap-to-zoom) */
  onClick?: (() => void) | undefined;
  /** Child content */
  children: ReactNode;
}

/**
 * Animated frame wrapper for dashboard chart cards
 * Provides consistent animation, sizing, and mobile interaction styling
 *
 * Memoized to prevent unnecessary re-renders when parent updates.
 * Uses custom comparison for primitive props (children always cause re-render).
 */
export const DashboardCardFrame = memo(function DashboardCardFrame({
  id,
  chartIndex,
  colSpanClass,
  containerHeight,
  layoutMargin,
  isMobile,
  onClick,
  children,
}: DashboardCardFrameProps) {
  return (
    <motion.div
      key={id}
      initial={CHART_CARD_ANIMATION.initial}
      animate={CHART_CARD_ANIMATION.animate}
      transition={CHART_CARD_ANIMATION.transition(chartIndex)}
      className={`${colSpanClass} flex flex-col relative ${isMobile ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
      style={{
        marginBottom: `${layoutMargin}px`,
        height: `${containerHeight}px`,
        maxHeight: `${containerHeight}px`,
        overflow: 'hidden',
      }}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
});

interface DashboardChartPlaceholderProps {
  /** Unique key for the chart card */
  id: string;
  /** Chart index for staggered animation */
  chartIndex: number;
  /** Responsive column span class */
  colSpanClass: string;
  /** Message to display */
  message: string;
  /** Chart ID to display (will be truncated) */
  chartId: string;
  /** Optional: Show revert button for swapped charts */
  onRevert?: (() => void) | undefined;
}

/**
 * Placeholder component for dashboard charts that cannot be rendered
 * Used when chart definition is missing or batch data is unavailable
 */
export function DashboardChartPlaceholder({
  id,
  chartIndex,
  colSpanClass,
  message,
  chartId,
  onRevert,
}: DashboardChartPlaceholderProps) {
  return (
    <motion.div
      key={id}
      initial={CHART_CARD_ANIMATION.initial}
      animate={CHART_CARD_ANIMATION.animate}
      transition={CHART_CARD_ANIMATION.transition(chartIndex)}
      className={`${colSpanClass} flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-dashed border-gray-300 dark:border-gray-600`}
    >
      <div className="flex items-center justify-center h-48 text-center text-gray-500 dark:text-gray-400">
        <div>
          <div className="text-2xl mb-2">⚠️</div>
          <p className="text-sm">{message}</p>
          <p className="text-xs">ID: {chartId.slice(0, 8)}...</p>
          {onRevert && (
            <button
              type="button"
              onClick={onRevert}
              className="mt-2 inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 dark:text-violet-400"
            >
              <RotateCcw className="w-3 h-3" />
              Revert to original chart
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
