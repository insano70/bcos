'use client';

/**
 * Table Fullscreen Modal
 *
 * Displays table charts in fullscreen with swipe navigation support.
 * Uses swipe zones (header/footer) for navigation while allowing table body to scroll.
 */

import { useId, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useChartFullscreen } from '@/hooks/useChartFullscreen';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';

interface TableColumn {
  columnName: string;
  displayName: string;
  dataType: string;
  formatType?: string | null;
  displayIcon?: boolean | null;
  iconType?: string | null;
  iconColorMode?: string | null;
  iconColor?: string | null;
  iconMapping?: unknown;
}

interface FormattedCell {
  formatted: string;
  raw: unknown;
  icon?: {
    name: string;
    color?: string;
    type?: string;
  };
}

interface TableFullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartTitle: string;
  data: Record<string, unknown>[];
  columns: TableColumn[];
  formattedData?: Array<Record<string, FormattedCell>>;
  // Mobile navigation support (swipe between charts)
  onNextChart?: () => void;
  onPreviousChart?: () => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  /** Position indicator, e.g., "3 of 8" */
  chartPosition?: string;
}

export default function TableFullscreenModal({
  isOpen,
  onClose,
  chartTitle,
  data,
  columns,
  formattedData,
  onNextChart,
  onPreviousChart,
  canGoNext,
  canGoPrevious,
  chartPosition,
}: TableFullscreenModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Use shared hook for modal lifecycle (mounting, scroll lock, escape key)
  const { mounted } = useChartFullscreen(isOpen, onClose);

  // Mobile detection for swipe navigation
  const isMobile = useIsMobile();

  // Swipe gesture for header/footer zones (navigation)
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

  // Phase 7: Use server-formatted data (always present via universal endpoint), with safety fallback to raw data
  const useFormattedData = formattedData && formattedData.length > 0;
  const displayData = useFormattedData ? formattedData : data;

  // Get cell value from either formatted or raw data
  const getCellValue = useCallback((
    row: Record<string, unknown> | Record<string, FormattedCell>,
    columnName: string
  ): {
    displayValue: string;
    rawValue: unknown;
    icon?: { name: string; color?: string; type?: string };
  } => {
    const cellData = row[columnName];

    // Check if this is formatted data from server
    if (cellData && typeof cellData === 'object' && 'formatted' in cellData) {
      const formattedCell = cellData as FormattedCell;
      const result: {
        displayValue: string;
        rawValue: unknown;
        icon?: { name: string; color?: string; type?: string };
      } = {
        displayValue: formattedCell.formatted,
        rawValue: formattedCell.raw,
      };
      if (formattedCell.icon) {
        result.icon = formattedCell.icon;
      }
      return result;
    }

    // Fallback: raw data
    return {
      displayValue: cellData === null || cellData === undefined ? '-' : String(cellData),
      rawValue: cellData,
    };
  }, []);

  // Get unique row key for React reconciliation
  const getRowKey = useCallback((
    row: Record<string, unknown> | Record<string, FormattedCell>,
    rowIndex: number
  ): string => {
    const idField = row.id;
    if (idField && typeof idField === 'object' && 'raw' in idField) {
      const rawId = (idField as FormattedCell).raw;
      return String(rawId ?? rowIndex);
    }
    return String(idField ?? rowIndex);
  }, []);

  // Determine text alignment based on data type
  const getAlignment = useCallback((column: TableColumn): string => {
    const formatType = column.formatType || column.dataType;
    if (['currency', 'decimal', 'integer'].includes(formatType)) {
      return 'text-right';
    }
    return 'text-left';
  }, []);

  // Generate color from text hash
  const getColorFromText = useCallback((text: string): string => {
    if (!text) return '#6b7280';
    const colors = [
      '#8b5cf6', '#0ea5e9', '#22c55e', '#ef4444', '#f59e0b',
      '#6366f1', '#ec4899', '#06b6d4', '#10b981', '#f97316',
    ];
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index] ?? '#6b7280';
  }, []);

  // Get initials from text
  const getInitials = useCallback((text: string): string => {
    if (!text) return '?';
    const cleaned = String(text).trim();
    if (!cleaned) return '?';
    const words = cleaned.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) return '?';
    if (words.length === 1) return cleaned.charAt(0).toUpperCase();
    return words.slice(0, 3).map((word) => word.charAt(0).toUpperCase()).join('');
  }, []);

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
      <div className="relative bg-white dark:bg-gray-900 rounded-lg w-full h-full sm:h-[90vh] sm:max-w-6xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header - swipe zone for navigation */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
          {...(isMobile ? swipeHandlers : {})}
        >
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

        {/* Table content - scrollable body (no swipe here to allow table scrolling) */}
        <div className="flex-1 overflow-auto p-4">
          {(!displayData || displayData.length === 0) ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10"
                />
              </svg>
              <p className="text-sm font-medium">No Data Available</p>
            </div>
          ) : (
            <table className="table-auto w-full dark:text-gray-300">
              <thead className="text-xs uppercase text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-xs sticky top-0">
                <tr>
                  {columns.map((column) => (
                    <th key={column.columnName} className="p-3 whitespace-nowrap">
                      <div className={`font-semibold ${getAlignment(column)}`}>
                        {column.displayName}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {displayData.map((row, rowIndex) => (
                  <tr key={getRowKey(row, rowIndex)}>
                    {columns.map((column, colIndex) => {
                      const { displayValue, rawValue, icon } = getCellValue(row, column.columnName);
                      const showIcon = column.displayIcon && colIndex === 0;
                      const iconColor = icon?.color || getColorFromText(String(rawValue || ''));
                      const iconContent = icon?.name || getInitials(String(rawValue || ''));

                      return (
                        <td
                          key={`${rowIndex}-${column.columnName}`}
                          className="p-3 whitespace-nowrap"
                        >
                          {showIcon ? (
                            <div className="flex items-center">
                              <div
                                className="shrink-0 rounded-full mr-2 sm:mr-3 flex items-center justify-center w-9 h-9"
                                style={{ backgroundColor: iconColor }}
                              >
                                <span className="text-white font-semibold text-sm">
                                  {iconContent}
                                </span>
                              </div>
                              <div className="font-medium text-gray-800 dark:text-gray-100">
                                {displayValue}
                              </div>
                            </div>
                          ) : (
                            <div
                              className={`${colIndex === 0 ? 'font-medium text-gray-800 dark:text-gray-100' : ''} ${getAlignment(column)}`}
                            >
                              {displayValue}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer - swipe zone for navigation */}
        <div
          className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
          {...(isMobile ? swipeHandlers : {})}
        >
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>{displayData.length} rows</span>
            {isMobile && (
              <span className="text-xs">Swipe header/footer to navigate</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
