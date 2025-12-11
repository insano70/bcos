'use client';

/**
 * Fullscreen Modal Footer
 *
 * Shared footer component for all fullscreen chart modals.
 * Provides navigation buttons and swipe zone for mobile navigation.
 *
 * Navigation pattern:
 * - Swipe gestures work in this footer zone (not in content area)
 * - Explicit prev/next buttons always visible
 * - Swipe left/right = navigate between charts
 * - Swipe down = close modal (pull-down-to-dismiss)
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

  // Don't render if no navigation is available
  const hasNavigation = canGoNext || canGoPrevious;
  if (!hasNavigation && !children && !dashboardName) {
    return null;
  }

  return (
    <div
      className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0"
      {...(isMobile ? swipeHandlers : {})}
    >
      <div className="flex items-center justify-between">
        {/* Left side: Dashboard name + up/down navigation OR custom children */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {dashboardName ? (
            <>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate max-w-[200px]">
                {dashboardName}
              </span>
              {hasDashboardNavigation && (
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={onPreviousDashboard}
                    disabled={!canGoPreviousDashboard}
                    className={`
                      p-1 rounded transition-colors
                      ${canGoPreviousDashboard
                        ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      }
                    `}
                    aria-label="Previous dashboard"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onNextDashboard}
                    disabled={!canGoNextDashboard}
                    className={`
                      p-1 rounded transition-colors
                      ${canGoNextDashboard
                        ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      }
                    `}
                    aria-label="Next dashboard"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {children}
            </div>
          )}
        </div>

        {/* Right side: Chart navigation buttons with position indicator */}
        {hasNavigation && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPreviousChart}
              disabled={!canGoPrevious}
              className={`
                p-2 rounded-lg transition-colors
                ${canGoPrevious
                  ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                }
              `}
              aria-label="Previous chart"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {chartPosition && (
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300 px-2 min-w-[60px] text-center">
                {chartPosition}
              </span>
            )}
            <button
              type="button"
              onClick={onNextChart}
              disabled={!canGoNext}
              className={`
                p-2 rounded-lg transition-colors
                ${canGoNext
                  ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                }
              `}
              aria-label="Next chart"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Mobile hint */}
      {isMobile && hasNavigation && (
        <div className="mt-2 text-center text-xs text-gray-400 dark:text-gray-500">
          Swipe here to navigate
        </div>
      )}
    </div>
  );
}
