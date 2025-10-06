'use client';

import { useEffect, useState } from 'react';

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

interface AnalyticsTableChartProps {
  data: Record<string, unknown>[];
  columns: TableColumn[];
  colorPalette?: string;
  title?: string;
  height?: number;
}

export default function AnalyticsTableChart({
  data,
  columns,
  colorPalette = 'default',
  title,
  height = 400
}: AnalyticsTableChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    console.log('🎨 AnalyticsTableChart mounted:', {
      dataRows: data?.length,
      columns: columns?.length,
      columnsData: columns
    });
  }, [data, columns]);

  if (!mounted) {
    return (
      <div style={{ height: `${height}px` }} className="flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  console.log('🎨 Rendering table with:', { dataLength: data?.length, columnsLength: columns?.length });

  if (!data || data.length === 0) {
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

  // Format value based on column type
  const formatValue = (value: unknown, column: TableColumn): string => {
    if (value === null || value === undefined) return '-';

    const formatType = column.formatType || column.dataType;

    if (formatType === 'currency' || formatType === 'decimal') {
      const numValue = typeof value === 'string' ? parseFloat(value) : Number(value);
      if (isNaN(numValue)) return String(value);

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
      const numValue = typeof value === 'string' ? parseInt(value) : Number(value);
      if (isNaN(numValue)) return String(value);
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

  // Generate color from text hash
  const getColorFromText = (text: string): string => {
    if (!text) return 'gray-500';

    // Color palette matching fintech examples
    const colors = [
      'violet-500',
      'sky-500',
      'green-500',
      'red-500',
      'amber-500',
      'indigo-500',
      'pink-500',
      'cyan-500',
      'emerald-500',
      'orange-500',
    ];

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash; // Convert to 32-bit integer
    }

    const index = Math.abs(hash) % colors.length;
    return colors[index] ?? 'gray-500';
  };

  // Get icon color for a value
  const getIconColor = (value: unknown, column: TableColumn): string => {
    const stringValue = String(value || '');

    if (column.iconColorMode === 'fixed' && column.iconColor) {
      return column.iconColor || 'gray-500';
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

  return (
    <div style={{ height: `${height}px` }} className="w-full">
      {title && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
      )}

      <div className="p-3">
        {/* Table - matches fintech card styling */}
        <div className="overflow-x-auto">
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
              {data.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column, colIndex) => {
                    const cellValue = row[column.columnName];
                    const showIcon = column.displayIcon && colIndex === 0;

                    return (
                      <td key={`${rowIndex}-${column.columnName}`} className="p-2 whitespace-nowrap">
                        {showIcon ? (
                          <div className="flex items-center">
                            <div className={`shrink-0 rounded-full mr-2 sm:mr-3 bg-${getIconColor(cellValue, column)} flex items-center justify-center w-9 h-9`}>
                              <span className="text-white font-semibold text-sm">
                                {getIconContent(cellValue, column)}
                              </span>
                            </div>
                            <div className="font-medium text-gray-800 dark:text-gray-100">
                              {formatValue(cellValue, column)}
                            </div>
                          </div>
                        ) : (
                          <div className={`${colIndex === 0 ? 'font-medium text-gray-800 dark:text-gray-100' : ''} ${getAlignment(column)}`}>
                            {formatValue(cellValue, column)}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
