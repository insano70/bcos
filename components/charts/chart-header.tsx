/**
 * ChartHeader Component
 *
 * Phase 4.3: Reusable chart header with actions
 *
 * Extracts header UI from analytics-chart.tsx into a reusable component.
 * Provides consistent header design across all chart types with export,
 * refresh, and fullscreen actions.
 *
 * Benefits:
 * - Consistent header design across all charts
 * - Reduces duplication in chart components
 * - Centralized action button styling
 * - Easy to add new header actions
 */

'use client';

import { Download, Maximize2, RefreshCcw } from 'lucide-react';
import { useState } from 'react';

/**
 * Chart header props
 */
interface ChartHeaderProps {
  /** Chart title (can be string or React element for custom formatting) */
  title?: React.ReactNode;

  /** Export callback - called when export is requested */
  onExport?: (format: 'png' | 'pdf' | 'csv') => void;

  /** Refresh callback - called when refresh is clicked */
  onRefresh?: () => void;

  /** Fullscreen callback - called when fullscreen is toggled */
  onFullscreen?: () => void;

  /** Whether the chart is currently loading */
  isLoading?: boolean;

  /** Additional CSS classes */
  className?: string;
}

/**
 * ChartHeader
 *
 * Reusable header component for analytics charts with title and action buttons.
 *
 * @param props - Chart header props
 * @returns Chart header component
 *
 * @example
 * ```tsx
 * <ChartHeader
 *   title="Monthly Revenue"
 *   onExport={handleExport}
 *   onRefresh={refetch}
 *   onFullscreen={() => setIsFullscreen(true)}
 *   isLoading={isLoading}
 * />
 * ```
 */
export default function ChartHeader({
  title,
  onExport,
  onRefresh,
  onFullscreen,
  isLoading = false,
  className = '',
}: ChartHeaderProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  /**
   * Handle export format selection
   */
  const handleExport = (format: 'png' | 'pdf' | 'csv') => {
    onExport?.(format);
    setShowExportMenu(false);
  };

  return (
    <header
      className={`px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800 rounded-t-2xl ${className}`}
    >
      {/* Title */}
      <div className="flex-1">
        {title && (
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Export Button */}
        {onExport && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isLoading}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export chart"
              aria-label="Export chart"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Export dropdown */}
            {showExportMenu && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />

                {/* Dropdown menu */}
                <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => handleExport('png')}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Export as PNG
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport('pdf')}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Export as PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport('csv')}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Export as CSV
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Refresh Button */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh chart data"
            aria-label="Refresh chart data"
          >
            <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        )}

        {/* Fullscreen Button */}
        {onFullscreen && (
          <button
            type="button"
            onClick={onFullscreen}
            disabled={isLoading}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Fullscreen"
            aria-label="View in fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}
