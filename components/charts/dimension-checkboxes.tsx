'use client';

/**
 * Dimension Checkboxes
 *
 * Inline horizontal checkbox UI for dimension expansion.
 * Displays dimensions as pill-style buttons for quick selection.
 *
 * Features:
 * - Horizontal pill layout (fits in header)
 * - Multi-select with limit enforcement
 * - Value count badges
 * - Compact design for inline use
 * - Auto-apply on click (no Apply button needed)
 * - Reset button (always visible, disabled when nothing to reset)
 */

import { useMemo, useCallback } from 'react';
import type { ExpansionDimension } from '@/lib/types/dimensions';
import { MAX_DIMENSIONS_PER_EXPANSION } from '@/lib/constants/dimension-expansion';

interface DimensionCheckboxesProps {
  /** Available dimensions (already filtered to have 2+ values) */
  availableDimensions: ExpansionDimension[];
  /** Currently selected column names */
  selectedColumns: string[];
  /** Callback when selection is applied */
  onApply: (columnNames: string[]) => void;
  /** Whether expansion is loading */
  isLoading?: boolean;
  /** Whether dimensions are loading */
  isDimensionsLoading?: boolean;
  /** Maximum selectable dimensions (default: 3) */
  maxSelectable?: number;
  /** Compact mode for tighter spacing */
  compact?: boolean;
  /** Current count of displayed charts (for "Showing X of Y" display) */
  showingCount?: number | undefined;
  /** Total count of available values/combinations */
  totalCount?: number | undefined;
}

/**
 * Inline pill checkboxes for dimension expansion selection
 */
export function DimensionCheckboxes({
  availableDimensions,
  selectedColumns,
  onApply,
  isLoading = false,
  isDimensionsLoading = false,
  maxSelectable = MAX_DIMENSIONS_PER_EXPANSION,
  compact = false,
  showingCount,
  totalCount,
}: DimensionCheckboxesProps) {
  // Convert to Set for easy lookup
  const selectedSet = useMemo(() => new Set(selectedColumns), [selectedColumns]);

  // Toggle dimension and auto-apply immediately
  const toggleDimension = useCallback((columnName: string) => {
    const newSelection = new Set(selectedColumns);
    
    if (newSelection.has(columnName)) {
      newSelection.delete(columnName);
    } else {
      // Enforce maximum
      if (newSelection.size >= maxSelectable) {
        return;
      }
      newSelection.add(columnName);
    }
    
    // Auto-apply immediately
    onApply(Array.from(newSelection));
  }, [selectedColumns, maxSelectable, onApply]);

  // Calculate estimated chart count based on current selection
  const estimatedCharts = useMemo(() => {
    if (selectedColumns.length === 0) return 0;
    const selectedDims = availableDimensions.filter((d) => selectedSet.has(d.columnName));
    return selectedDims.reduce((product, dim) => product * (dim.valueCount || 1), 1);
  }, [selectedColumns, availableDimensions, selectedSet]);

  // Don't render if no dimensions available
  if (availableDimensions.length === 0) {
    return null;
  }

  // Loading state for dimensions
  if (isDimensionsLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <svg
          className="w-4 h-4 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span>Loading dimensions...</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 flex-wrap ${compact ? 'gap-2' : ''}`}>
      {/* Label */}
      <span className={`text-slate-600 dark:text-slate-400 font-medium ${compact ? 'text-xs' : 'text-sm'}`}>
        Expand by:
      </span>

      {/* Dimension pills */}
      {availableDimensions.map((dimension) => {
        const isSelected = selectedSet.has(dimension.columnName);
        const isDisabled = !isSelected && selectedColumns.length >= maxSelectable;

        return (
          <button
            key={dimension.columnName}
            type="button"
            onClick={() => !isDisabled && toggleDimension(dimension.columnName)}
            disabled={isDisabled || isLoading}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all
              ${isDisabled || isLoading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
              ${isSelected
                ? 'bg-violet-100 dark:bg-violet-900/30 border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-violet-300 dark:hover:border-violet-600'
              }
              ${compact ? 'text-xs py-0.5 px-2' : 'text-sm'}
            `}
          >
            <span className="font-medium">{dimension.displayName}</span>
            {dimension.valueCount !== undefined && (
              <span className={`text-slate-500 dark:text-slate-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                ({dimension.valueCount})
              </span>
            )}
          </button>
        );
      })}

      {/* Chart count indicator - show actual count when expanded, estimate otherwise */}
      {selectedColumns.length > 0 && (
        <span className={`text-slate-500 dark:text-slate-400 ${compact ? 'text-xs' : 'text-sm'}`}>
          {showingCount !== undefined && totalCount !== undefined
            ? `${showingCount} of ${totalCount}`
            : `~${estimatedCharts} chart${estimatedCharts !== 1 ? 's' : ''}`}
        </span>
      )}

      {/* Reset button (always visible, disabled when nothing to reset) */}
      <button
        type="button"
        onClick={() => onApply([])}
        disabled={isLoading || selectedColumns.length === 0}
        className={`
          px-3 py-1 font-medium text-slate-600 dark:text-slate-400 
          hover:text-slate-800 dark:hover:text-slate-200
          border border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500
          rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed
          ${compact ? 'text-xs px-2 py-0.5' : 'text-sm'}
        `}
      >
        Reset
      </button>
    </div>
  );
}

export default DimensionCheckboxes;
