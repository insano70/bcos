'use client';

/**
 * Fullscreen Modal Footer
 *
 * Shared footer component for all fullscreen chart modals.
 * Provides navigation buttons and swipe zone for mobile navigation.
 *
 * Design principles:
 * - Fixed height (h-14) to prevent layout reflows during transitions
 * - Never returns null - always renders consistent footer
 * - Responsive sizing for mobile (text-xs on mobile, text-sm on desktop)
 * - 44px minimum touch targets for accessibility
 */

import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useIsMobile } from '@/hooks/useIsMobile';

interface FullscreenModalFooterProps {
  onNextChart?: (() => void) | undefined;
  onPreviousChart?: (() => void) | undefined;
  onClose: () => void;
  canGoNext?: boolean | undefined;
  canGoPrevious?: boolean | undefined;
  /** Position indicator, e.g., "3 of 8" */
  chartPosition?: string | undefined;
  /** Optional additional content (e.g., row count for tables) */
  children?: React.ReactNode;
  /** Dashboard name to display (for cross-dashboard navigation) */
  dashboardName?: string | undefined;
  /** Navigate to next dashboard */
  onNextDashboard?: (() => void) | undefined;
  /** Navigate to previous dashboard */
  onPreviousDashboard?: (() => void) | undefined;
  /** Can navigate to next dashboard */
  canGoNextDashboard?: boolean | undefined;
  /** Can navigate to previous dashboard */
  canGoPreviousDashboard?: boolean | undefined;
}

export default function FullscreenModalFooter({
  onNextChart,
  onPreviousChart,
  onClose,
  canGoNext,
  canGoPrevious,
  chartPosition,
  children,
  dashboardName,
  onNextDashboard,
  onPreviousDashboard,
  canGoNextDashboard,
  canGoPreviousDashboard,
}: FullscreenModalFooterProps) {
  const isMobile = useIsMobile();
  const hasDashboardNavigation = canGoNextDashboard || canGoPreviousDashboard;

  // Swipe gesture for footer zone navigation
  // Swipe left/right = navigate, swipe down = close
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: canGoNext ? onNextChart : undefined,
    onSwipeRight: canGoPrevious ? onPreviousChart : undefined,
    onSwipeDown: onClose,
    onSwipeUp: undefined,
  });

  const hasChartNavigation = canGoNext || canGoPrevious;

  // Always render footer for consistent layout - never return null
  return (
    <div
      className="h-14 px-3 sm:px-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0 flex items-center"
      {...(isMobile ? swipeHandlers : {})}
    >
      <div className="flex items-center justify-between w-full">
        {/* Left side: Dashboard name + up/down navigation OR custom children */}
        <div className="flex-1 flex items-center gap-1 sm:gap-2 min-w-0">
          {dashboardName ? (
            <>
              <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 truncate max-w-[100px] sm:max-w-[180px]">
                {dashboardName}
              </span>
              {hasDashboardNavigation && (
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={onPreviousDashboard}
                    disabled={!canGoPreviousDashboard}
                    className={`
                      min-w-[44px] min-h-[44px] flex items-center justify-center rounded transition-colors
                      ${canGoPreviousDashboard
                        ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      }
                    `}
                    aria-label="Previous dashboard"
                  >
                    <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={onNextDashboard}
                    disabled={!canGoNextDashboard}
                    className={`
                      min-w-[44px] min-h-[44px] flex items-center justify-center rounded transition-colors
                      ${canGoNextDashboard
                        ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      }
                    `}
                    aria-label="Next dashboard"
                  >
                    <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              )}
            </>
          ) : children ? (
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {children}
            </div>
          ) : (
            // Empty placeholder to maintain layout
            <div />
          )}
        </div>

        {/* Center: Position indicator */}
        {chartPosition && (
          <span className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 px-2 min-w-[50px] sm:min-w-[60px] text-center">
            {chartPosition}
          </span>
        )}

        {/* Right side: Chart navigation buttons */}
        <div className="flex items-center gap-0 sm:gap-1">
          {hasChartNavigation ? (
            <>
              <button
                type="button"
                onClick={onPreviousChart}
                disabled={!canGoPrevious}
                className={`
                  min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors
                  ${canGoPrevious
                    ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  }
                `}
                aria-label="Previous chart"
              >
                <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
              <button
                type="button"
                onClick={onNextChart}
                disabled={!canGoNext}
                className={`
                  min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors
                  ${canGoNext
                    ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  }
                `}
                aria-label="Next chart"
              >
                <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </>
          ) : (
            // Empty placeholder to maintain layout
            <div className="w-[88px] sm:w-[98px]" />
          )}
        </div>
      </div>
    </div>
  );
}
