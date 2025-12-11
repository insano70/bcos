'use client';

/**
 * Number Fullscreen Modal
 *
 * Displays KPI/number charts in fullscreen with swipe navigation support.
 * Simple modal that enlarges the number display for better visibility.
 */

import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useChartFullscreen } from '@/hooks/useChartFullscreen';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import type { ChartData } from '@/lib/types/analytics';
import AnalyticsNumberChart from './analytics-number-chart';

interface NumberFullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartTitle: string;
  data: ChartData;
  format?: 'currency' | 'number' | 'percentage';
  // Mobile navigation support (swipe between charts)
  onNextChart?: () => void;
  onPreviousChart?: () => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  /** Position indicator, e.g., "3 of 8" */
  chartPosition?: string;
}

export default function NumberFullscreenModal({
  isOpen,
  onClose,
  chartTitle,
  data,
  format,
  onNextChart,
  onPreviousChart,
  canGoNext,
  canGoPrevious,
  chartPosition,
}: NumberFullscreenModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Use shared hook for modal lifecycle (mounting, scroll lock, escape key)
  const { mounted } = useChartFullscreen(isOpen, onClose);

  // Mobile detection for swipe navigation
  const isMobile = useIsMobile();

  // Swipe gesture for mobile navigation
  const swipeHandlers = useSwipeGesture({
    onSwipeUp: canGoNext ? onNextChart : undefined,
    onSwipeDown: canGoPrevious ? onPreviousChart : undefined,
    onSwipeLeft: onClose,
    onSwipeRight: onClose,
  });

  // Handle clicks outside modal
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
      aria-labelledby={titleId}
    >
      <div className="relative bg-white dark:bg-gray-900 rounded-lg w-full h-full sm:h-[90vh] sm:max-w-4xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-3 min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
              {chartTitle}
            </h2>
            {/* Position indicator for mobile navigation */}
            {chartPosition && (
              <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {chartPosition}
              </span>
            )}
          </div>
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

        {/* Content - swipe handlers for mobile navigation */}
        <div
          className="flex-1 flex items-center justify-center p-6"
          {...(isMobile ? swipeHandlers : {})}
        >
          <AnalyticsNumberChart
            data={data}
            format={format}
            animationDuration={1}
            responsive={true}
            minHeight={300}
            maxHeight={600}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
