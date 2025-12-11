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

import { ChevronLeft, ChevronRight } from 'lucide-react';
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
}

export default function FullscreenModalFooter({
  onNextChart,
  onPreviousChart,
  onClose,
  canGoNext,
  canGoPrevious,
  chartPosition,
  children,
}: FullscreenModalFooterProps) {
  const isMobile = useIsMobile();

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
  if (!hasNavigation && !children) {
    return null;
  }

  return (
    <div
      className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0"
      {...(isMobile ? swipeHandlers : {})}
    >
      <div className="flex items-center justify-between">
        {/* Left side: Custom content or spacer */}
        <div className="flex-1 flex items-center text-sm text-gray-500 dark:text-gray-400">
          {children}
        </div>

        {/* Center: Position indicator */}
        {chartPosition && (
          <div className="flex-shrink-0 px-4">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {chartPosition}
            </span>
          </div>
        )}

        {/* Right side: Navigation buttons */}
        {hasNavigation && (
          <div className="flex-1 flex items-center justify-end gap-2">
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
