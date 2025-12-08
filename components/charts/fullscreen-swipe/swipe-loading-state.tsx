'use client';

/**
 * Swipe Loading State Component
 *
 * Displays a loading skeleton while dashboards are being fetched.
 * Provides close button for user to exit if needed.
 */

import { X } from 'lucide-react';
import { ChartSkeleton } from '@/components/ui/loading-skeleton';

interface SwipeLoadingStateProps {
  /** Callback to close fullscreen mode */
  onClose: () => void;
}

export default function SwipeLoadingState({ onClose }: SwipeLoadingStateProps) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-gray-900 dark:bg-black flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Loading charts"
    >
      {/* Header with close button */}
      <div className="flex items-center justify-between px-4 py-3 pt-safe">
        <div className="flex-1">
          <div className="h-6 w-48 bg-gray-700 rounded animate-pulse" />
          <div className="h-4 w-32 bg-gray-800 rounded animate-pulse mt-2" />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80 hover:text-white"
          aria-label="Exit fullscreen"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Loading skeleton for chart */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-6">
        <div className="w-full max-w-5xl">
          <ChartSkeleton />
        </div>
      </div>

      {/* Loading indicator for position */}
      <div className="flex items-center justify-center py-4 pb-safe">
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full bg-gray-600 animate-pulse`}
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

