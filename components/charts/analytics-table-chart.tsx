'use client';

import { useEffect, useState, useRef } from 'react';

interface TableColumn {
  columnName: string;
  displayName: string;
  dataType: string;
  formatType?: string | null | undefined;
  displayIcon?: boolean | null | undefined;
  iconType?: string | null | undefined;
  iconColorMode?: string | null | undefined;
  iconColor?: string | null | undefined;
  iconMapping?: unknown;
}

interface FormattedCell {
  formatted: string; // Display value (e.g., "$1,000.00")
  raw: unknown; // Original value for sorting/exporting
  icon?: {
    name: string;
    color?: string;
    type?: string;
  };
}

interface AnalyticsTableChartProps {
  data: Record<string, unknown>[]; // Legacy: raw data (for backward compatibility)
  formattedData?: Array<Record<string, FormattedCell>>; // Phase 3.2: Server-formatted data
  columns: TableColumn[];
  colorPalette?: string;
  title?: string;
  height?: number;
}

export default function AnalyticsTableChart({
  data,
  formattedData,
  columns,
  colorPalette = 'default',
  title,
  height = 400
}: AnalyticsTableChartProps) {
  // Phase 3.2: Use server-formatted data if available, otherwise fall back to raw data
  const useFormattedData = formattedData && formattedData.length > 0;
  const displayData = useFormattedData ? formattedData : data;
  const [mounted, setMounted] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    console.log('🎨 AnalyticsTableChart mounted:', {
      dataRows: data?.length,
      formattedDataRows: formattedData?.length,
      useFormattedData,
      columns: columns?.length,
      columnsData: columns
    });
  }, [data, formattedData, useFormattedData, columns]);

  // Check if content is scrollable and update indicator
  useEffect(() => {
    const checkScrollable = () => {
      if (scrollContainerRef.current) {
        // Check if we're inside a ResponsiveChartContainer that handles scrolling
        let scrollElement: HTMLElement = scrollContainerRef.current;
        const parent = scrollContainerRef.current.parentElement;

        // If parent has overflow, it's the scroll container
        if (parent) {
          const parentStyles = window.getComputedStyle(parent);
          if (parentStyles.overflowY === 'auto' || parentStyles.overflowY === 'scroll') {
            scrollElement = parent;
          }
        }

        const { scrollHeight, clientHeight, scrollTop } = scrollElement;
        const isScrollable = scrollHeight > clientHeight;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 5; // 5px threshold

        console.log('📏 Scroll check:', {
          element: scrollElement === parent ? 'parent' : 'self',
          scrollHeight,
          clientHeight,
          scrollTop,
          isScrollable,
          isAtBottom,
          willShowIndicator: isScrollable && !isAtBottom
        });

        setShowScrollIndicator(isScrollable && !isAtBottom);
        setHasScrolledToBottom(isAtBottom);
      }
    };

    checkScrollable();

    // Re-check when data changes and after a delay for rendering
    const timer = setTimeout(checkScrollable, 100);
    const timer2 = setTimeout(checkScrollable, 500);
    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
    };
  }, [data, columns]);

  // Handle scroll events
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      // Use the same scroll element detection as in useEffect
      let scrollElement: HTMLElement = scrollContainerRef.current;
      const parent = scrollContainerRef.current.parentElement;

      if (parent) {
        const parentStyles = window.getComputedStyle(parent);
        if (parentStyles.overflowY === 'auto' || parentStyles.overflowY === 'scroll') {
          scrollElement = parent;
        }
      }

      const { scrollHeight, clientHeight, scrollTop } = scrollElement;
      const isScrollable = scrollHeight > clientHeight;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 5;

      setShowScrollIndicator(isScrollable && !isAtBottom);
      setHasScrolledToBottom(isAtBottom);
    }
  };

  if (!mounted) {
    return (
      <div style={{ height: `${height}px` }} className="flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  console.log('🎨 Rendering table with:', {
    dataLength: data?.length,
    formattedDataLength: formattedData?.length,
    useFormattedData,
    columnsLength: columns?.length
  });

  if (!displayData || displayData.length === 0) {
    console.log('⚠️ No data to display');
    return (
      <div style={{ height: `${height}px` }} className="flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10" />
        </svg>
        <p className="text-sm font-medium">No Data Available</p>
      </div>
    );
  }

  if (!columns || columns.length === 0) {
    console.log('⚠️ No columns configured');
    return (
      <div style={{ height: `${height}px` }} className="flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
        <p className="text-sm font-medium">No columns configured</p>
      </div>
    );
  }

  /**
   * Get cell value from either formatted or raw data
   * Phase 3.2: Prioritize server-formatted data, fallback to client formatting
   */
  const getCellValue = (
    row: Record<string, unknown> | Record<string, FormattedCell>,
    columnName: string
  ): { displayValue: string; rawValue: unknown; icon?: { name: string; color?: string; type?: string } } => {
    const cellData = row[columnName];

    // Phase 3.2: Check if this is formatted data from server
    if (cellData && typeof cellData === 'object' && 'formatted' in cellData) {
      const formattedCell = cellData as FormattedCell;
      const result: { displayValue: string; rawValue: unknown; icon?: { name: string; color?: string; type?: string } } = {
        displayValue: formattedCell.formatted,
        rawValue: formattedCell.raw
      };
      if (formattedCell.icon) {
        result.icon = formattedCell.icon;
      }
      return result;
    }

    // Legacy: Client-side formatting for backward compatibility
    return {
      displayValue: formatValueLegacy(cellData, columns.find(c => c.columnName === columnName)!),
      rawValue: cellData
    };
  };

  /**
   * Legacy client-side formatting (kept for backward compatibility)
   * Will be removed once all table charts use universal endpoint
   */
  const formatValueLegacy = (value: unknown, column: TableColumn): string => {
    if (value === null || value === undefined) return '-';

    const formatType = column.formatType || column.dataType;

    if (formatType === 'currency' || formatType === 'decimal') {
      const numValue = typeof value === 'string' ? parseFloat(value) : Number(value);
      if (Number.isNaN(numValue)) return String(value);

      if (formatType === 'currency') {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(numValue);
      }

      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(numValue);
    }

    if (formatType === 'date' || column.dataType === 'date') {
      try {
        const date = new Date(String(value));
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
      } catch {
        return String(value);
      }
    }

    if (formatType === 'integer' || column.dataType === 'integer') {
      const numValue = typeof value === 'string' ? Number.parseInt(value) : Number(value);
      if (Number.isNaN(numValue)) return String(value);
      return new Intl.NumberFormat('en-US').format(numValue);
    }

    return String(value);
  };

  // Determine text alignment based on data type
  const getAlignment = (column: TableColumn): string => {
    const formatType = column.formatType || column.dataType;
    // Right-align numeric fields (currency, decimal, integer)
    if (['currency', 'decimal', 'integer'].includes(formatType)) {
      return 'text-right';
    }
    return 'text-left';
  };

  // Extract initials from text
  const getInitials = (text: string, type: 'initials' | 'first_letter' = 'initials'): string => {
    if (!text) return '?';

    const cleaned = String(text).trim();
    if (!cleaned) return '?';

    if (type === 'first_letter') {
      return cleaned.charAt(0).toUpperCase();
    }

    // Extract initials from words
    const words = cleaned.split(/\s+/).filter(word => word.length > 0);
    if (words.length === 0) return '?';

    if (words.length === 1) {
      // Single word: take first letter only
      return cleaned.charAt(0).toUpperCase();
    }

    // Multiple words: take first letter of first 3 words
    return words
      .slice(0, 3)
      .map(word => word.charAt(0).toUpperCase())
      .join('');
  };

  // Generate color from text hash - returns hex color
  const getColorFromText = (text: string): string => {
    if (!text) return '#6b7280'; // gray

    // Color palette matching fintech examples (hex colors)
    const colors = [
      '#8b5cf6', // violet
      '#0ea5e9', // sky
      '#22c55e', // green
      '#ef4444', // red
      '#f59e0b', // amber
      '#6366f1', // indigo
      '#ec4899', // pink
      '#06b6d4', // cyan
      '#10b981', // emerald
      '#f97316', // orange
    ];

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash; // Convert to 32-bit integer
    }

    const index = Math.abs(hash) % colors.length;
    return colors[index] ?? '#6b7280';
  };

  // Get icon color for a value - returns hex color
  const getIconColor = (value: unknown, column: TableColumn): string => {
    const stringValue = String(value || '');

    if (column.iconColorMode === 'fixed' && column.iconColor) {
      // Return the hex color directly (user should enter hex codes like #8b5cf6)
      return column.iconColor || '#6b7280';
    }

    if (column.iconColorMode === 'mapped' && column.iconMapping && typeof column.iconMapping === 'object' && column.iconMapping !== null) {
      const mappingObj = column.iconMapping as Record<string, unknown>;
      const mapping = mappingObj[stringValue];
      if (mapping && typeof mapping === 'object' && 'color' in mapping) {
        return String((mapping as { color: string }).color);
      }
      if (typeof mapping === 'string') {
        return mapping;
      }
    }

    // Default: auto-generate from text
    return getColorFromText(stringValue);
  };

  // Get icon content (initials or emoji)
  const getIconContent = (value: unknown, column: TableColumn): string => {
    const stringValue = String(value || '');

    // Check for emoji mapping first
    if (column.iconMapping && typeof column.iconMapping === 'object' && column.iconMapping !== null) {
      const mappingObj = column.iconMapping as Record<string, unknown>;
      const mapping = mappingObj[stringValue];
      if (mapping && typeof mapping === 'object' && 'icon' in mapping) {
        return String((mapping as { icon: string }).icon);
      }
      if (mapping && typeof mapping === 'object' && 'emoji' in mapping) {
        return String((mapping as { emoji: string }).emoji);
      }
    }

    // Fall back to initials
    const iconType: string = column.iconType || 'initials';
    if (iconType === 'emoji') {
      return '📋'; // Default emoji fallback
    }

    return getInitials(stringValue, iconType === 'first_letter' ? 'first_letter' : 'initials');
  };

  // Calculate the available height for the scrollable content
  const titleHeight = title ? 50 : 0; // Title + border height
  const padding = 24; // 12px top + 12px bottom
  const availableHeight = height - titleHeight - padding;

  return (
    <div className="w-full relative" style={{ height: `${height}px` }}>
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="w-full"
        style={{ height: `${height}px`, overflowY: 'auto', overflowX: 'auto' }}
      >
        {title && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          </div>
        )}

        <div style={{ padding: '12px' }}>
          {/* Table - matches fintech card styling */}
          <table className="table-auto w-full dark:text-gray-300">
            {/* Table header - matches fintech card styling exactly */}
            <thead className="text-xs uppercase text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-xs">
              <tr>
                {columns.map((column) => (
                  <th key={column.columnName} className="p-2 whitespace-nowrap">
                    <div className={`font-semibold ${getAlignment(column)}`}>
                      {column.displayName}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            {/* Table body - matches fintech card styling exactly */}
            <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
              {displayData.map((row, rowIndex) => {
                console.log(`🔍 Rendering row ${rowIndex}:`, row);
                return (
                <tr key={rowIndex}>
                  {columns.map((column, colIndex) => {
                    const { displayValue, rawValue, icon } = getCellValue(row, column.columnName);
                    const showIcon = column.displayIcon && colIndex === 0;

                    // Phase 3.2: Use server-provided icon if available, otherwise fall back to client generation
                    const iconColor = icon?.color || getIconColor(rawValue, column);
                    const iconContent = icon?.name || getIconContent(rawValue, column);

                    return (
                      <td key={`${rowIndex}-${column.columnName}`} className="p-2 whitespace-nowrap">
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
                          <div className={`${colIndex === 0 ? 'font-medium text-gray-800 dark:text-gray-100' : ''} ${getAlignment(column)}`}>
                            {displayValue}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scroll indicator - shows in the bottom buffer area when there's more content below */}
      {showScrollIndicator && (
        <div
          className="absolute left-0 right-0 flex justify-center pointer-events-none"
          style={{
            bottom: '20px',
            zIndex: 10
          }}
        >
          <div
            className="bg-white dark:bg-gray-700 shadow-lg border border-gray-200 dark:border-gray-600"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-600 dark:text-gray-300"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
