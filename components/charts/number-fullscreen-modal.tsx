'use client';

/**
 * Number Fullscreen Modal
 *
 * Displays KPI/number charts in fullscreen with navigation support.
 * Enhanced layout with centered chart title, filter description, and larger number display.
 *
 * Navigation: Footer zone with prev/next buttons and swipe gestures.
 * Content area is swipe-free for better interaction.
 */

import { useId, useRef } from 'react';
import { useChartFullscreen } from '@/hooks/useChartFullscreen';
import FullscreenModalAnimation from './fullscreen-modal-animation';
import type { ChartData } from '@/lib/types/analytics';
import AnalyticsNumberChart from './analytics-number-chart';
import FullscreenModalFooter from './fullscreen-modal-footer';

interface NumberFullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartTitle: string;
  data: ChartData;
  format?: 'currency' | 'number' | 'percentage';
  /** Active filter description, e.g., "Trailing 6 Months" */
  filterDescription?: string;
  // Mobile navigation support
  onNextChart?: () => void;
  onPreviousChart?: () => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  /** Position indicator, e.g., "3 of 8" */
  chartPosition?: string;
  // Cross-dashboard navigation
  dashboardName?: string | undefined;
  onNextDashboard?: (() => void) | undefined;
  onPreviousDashboard?: (() => void) | undefined;
  canGoNextDashboard?: boolean | undefined;
  canGoPreviousDashboard?: boolean | undefined;
}

export default function NumberFullscreenModal({
  isOpen,
  onClose,
  chartTitle,
  data,
  format,
  filterDescription,
  onNextChart,
  onPreviousChart,
  canGoNext,
  canGoPrevious,
  chartPosition,
  dashboardName,
  onNextDashboard,
  onPreviousDashboard,
  canGoNextDashboard,
  canGoPreviousDashboard,
}: NumberFullscreenModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Use shared hook for modal lifecycle (scroll lock, escape key)
  useChartFullscreen(isOpen, onClose);

  // Don't render if not open (AnimatePresence handles exit animations)
  if (!isOpen) {
    return null;
  }

  return (
    <FullscreenModalAnimation onOverlayClick={onClose} ariaLabelledBy={titleId}>
      <div
        ref={modalRef}
        className="relative bg-white dark:bg-gray-900 rounded-lg w-full h-[100dvh] sm:h-[90vh] sm:max-w-4xl flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
          <h2 id={titleId} className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
            {chartTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close fullscreen view"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content - Enhanced with centered title, filter, and larger number */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 gap-4 sm:gap-6">
          {/* Chart title - centered, prominent */}
          <h3 className="text-xl sm:text-2xl md:text-3xl font-semibold text-gray-800 dark:text-gray-100 text-center px-4">
            {chartTitle}
          </h3>

          {/* Filter/period indicator */}
          {filterDescription && (
            <span className="text-sm sm:text-base md:text-lg text-gray-500 dark:text-gray-400">
              {filterDescription}
            </span>
          )}

          {/* Number display - larger for fullscreen */}
          <div className="flex-1 flex items-center justify-center w-full max-w-lg">
            <AnalyticsNumberChart
              data={data}
              format={format}
              animationDuration={1}
              responsive={true}
              minHeight={200}
              maxHeight={400}
              size="large"
            />
          </div>
        </div>

        {/* Footer with navigation */}
        <FullscreenModalFooter
          onNextChart={onNextChart}
          onPreviousChart={onPreviousChart}
          onClose={onClose}
          canGoNext={canGoNext}
          canGoPrevious={canGoPrevious}
          chartPosition={chartPosition}
          dashboardName={dashboardName}
          onNextDashboard={onNextDashboard}
          onPreviousDashboard={onPreviousDashboard}
          canGoNextDashboard={canGoNextDashboard}
          canGoPreviousDashboard={canGoPreviousDashboard}
        />
      </div>
    </FullscreenModalAnimation>
  );
}
