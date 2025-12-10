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
 * - Mobile-optimized bottom sheet for export menu
 */

'use client';

import { Download, Maximize2, RefreshCcw, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ExportFormat } from '@/lib/utils/chart-export-formats';

/**
 * Chart header props
 */
interface ChartHeaderProps {
  /** Chart title (can be string or React element for custom formatting) */
  title?: React.ReactNode;

  /** Export callback - called when export is requested */
  onExport?: (format: 'png' | 'pdf' | 'csv') => void;

  /**
   * Available export formats for this chart type
   * If not provided, defaults to all formats (backwards compatibility)
   * If empty array, export button is hidden
   */
  availableExportFormats?: ExportFormat[];

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
  availableExportFormats,
  onRefresh,
  onFullscreen,
  isLoading = false,
  className = '',
}: ChartHeaderProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isMobile = useIsMobile();

  // Determine which formats are available
  // Default to all formats for backwards compatibility
  const formats = availableExportFormats ?? (['png', 'pdf', 'csv'] as const);
  const hasPng = formats.includes('png');
  const hasPdf = formats.includes('pdf');
  const hasCsv = formats.includes('csv');
  const hasAnyFormat = formats.length > 0;

  /**
   * Handle export format selection
   */
  const handleExport = (format: 'png' | 'pdf' | 'csv') => {
    onExport?.(format);
    setShowExportMenu(false);
  };

  /**
   * Update dropdown position when menu opens
   */
  useEffect(() => {
    if (showExportMenu && buttonRef.current && !isMobile) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8, // 8px gap below button
        right: window.innerWidth - rect.right,
      });
    }
  }, [showExportMenu, isMobile]);

  return (
    <header
      className={`px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800 rounded-t-2xl ${className}`}
    >
      {/* Title */}
      <div className="flex-1 min-w-0">
        {title && (
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</h2>
        )}
      </div>

      {/* Actions - 44px minimum touch targets for mobile accessibility */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {/* Export Button - only show if there are available formats */}
        {onExport && hasAnyFormat && (
          <div className="relative">
            <button
              ref={buttonRef}
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isLoading}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export chart"
              aria-label="Export chart"
            >
              <Download className="w-5 h-5" />
            </button>

            {/* Export menu - Bottom sheet on mobile, portal dropdown on desktop */}
            {showExportMenu && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-[9998] bg-black/20 md:bg-transparent" 
                  onClick={() => setShowExportMenu(false)} 
                />

                {isMobile ? (
                  /* Mobile: Bottom Sheet */
                  <div className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-gray-800 rounded-t-2xl shadow-xl animate-in slide-in-from-bottom duration-200">
                    {/* Handle bar */}
                    <div className="flex justify-center pt-3 pb-2">
                      <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
                    </div>
                    
                    {/* Header with close button */}
                    <div className="flex items-center justify-between px-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        Export Chart
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowExportMenu(false)}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        aria-label="Close"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    
                    {/* Export options - conditionally rendered based on availability */}
                    <div className="p-4 space-y-2 pb-safe">
                      {hasPng && (
                        <button
                          type="button"
                          onClick={() => handleExport('png')}
                          className="w-full min-h-[48px] flex items-center justify-center px-4 py-3 text-base font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors"
                        >
                          Export as PNG
                        </button>
                      )}
                      {hasPdf && (
                        <button
                          type="button"
                          onClick={() => handleExport('pdf')}
                          className="w-full min-h-[48px] flex items-center justify-center px-4 py-3 text-base font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors"
                        >
                          Export as PDF
                        </button>
                      )}
                      {hasCsv && (
                        <button
                          type="button"
                          onClick={() => handleExport('csv')}
                          className="w-full min-h-[48px] flex items-center justify-center px-4 py-3 text-base font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors"
                        >
                          Export as CSV
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Desktop: Portal dropdown to escape stacking context */
                  createPortal(
                    <div 
                      className="fixed w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-[9999]"
                      style={{ top: dropdownPosition.top, right: dropdownPosition.right }}
                    >
                      <div className="py-1">
                        {hasPng && (
                          <button
                            type="button"
                            onClick={() => handleExport('png')}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            Export as PNG
                          </button>
                        )}
                        {hasPdf && (
                          <button
                            type="button"
                            onClick={() => handleExport('pdf')}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            Export as PDF
                          </button>
                        )}
                        {hasCsv && (
                          <button
                            type="button"
                            onClick={() => handleExport('csv')}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            Export as CSV
                          </button>
                        )}
                      </div>
                    </div>,
                    document.body
                  )
                )}
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
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh chart data"
            aria-label="Refresh chart data"
          >
            <RefreshCcw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        )}

        {/* Fullscreen Button */}
        {onFullscreen && (
          <button
            type="button"
            onClick={onFullscreen}
            disabled={isLoading}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Fullscreen"
            aria-label="View in fullscreen"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        )}
      </div>
    </header>
  );
}
