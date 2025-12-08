'use client';

/**
 * Swipe Empty State Component
 *
 * Displays when no dashboards are available for swipe mode.
 * Provides helpful message and close button.
 */

import { X, BarChart3 } from 'lucide-react';

interface SwipeEmptyStateProps {
  /** Callback to close fullscreen mode */
  onClose: () => void;
}

export default function SwipeEmptyState({ onClose }: SwipeEmptyStateProps) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-gray-900 dark:bg-black flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="No dashboards available"
    >
      {/* Header with close button */}
      <div className="flex items-center justify-end px-4 py-3 pt-safe">
        <button
          type="button"
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80 hover:text-white"
          aria-label="Exit fullscreen"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Empty state content */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-6">
        <div className="text-center max-w-md">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-gray-800 rounded-full">
              <BarChart3 className="w-12 h-12 text-gray-500" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-xl font-semibold text-white mb-3">No Dashboards Available</h2>

          {/* Description */}
          <p className="text-gray-400 mb-6">
            There are no published dashboards with charts to display. Create and publish a dashboard
            with at least one chart to use presentation mode.
          </p>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}

