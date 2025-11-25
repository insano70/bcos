'use client';

/**
 * Dimension Checkboxes
 *
 * Inline horizontal checkbox UI for dimension expansion.
 * Replaces the modal-based DimensionSelector for cleaner UX.
 *
 * Features:
 * - Horizontal checkbox layout (fits in header)
 * - Multi-select with limit enforcement
 * - Value count badges
 * - Compact design for inline use
 * - Apply button for batch changes
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
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
 * Inline checkboxes for dimension expansion selection
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
  // Local selection state for batch changes
  const [localSelection, setLocalSelection] = useState<Set<string>>(
    () => new Set(selectedColumns)
  );

  // Sync with external selection changes
  useEffect(() => {
    setLocalSelection(new Set(selectedColumns));
  }, [selectedColumns]);

  // Check if local selection differs from applied selection
  const hasChanges = useMemo(() => {
    if (localSelection.size !== selectedColumns.length) return true;
    return !selectedColumns.every((col) => localSelection.has(col));
  }, [localSelection, selectedColumns]);

  // Toggle dimension in local selection
  const toggleDimension = useCallback((columnName: string) => {
    setLocalSelection((prev) => {
      const next = new Set(prev);
      if (next.has(columnName)) {
        next.delete(columnName);
      } else {
        // Enforce maximum
        if (next.size >= maxSelectable) {
          return prev;
        }
        next.add(columnName);
      }
      return next;
    });
  }, [maxSelectable]);

  // Apply changes
  const handleApply = useCallback(() => {
    onApply(Array.from(localSelection));
  }, [localSelection, onApply]);

  // Calculate estimated chart count
  const estimatedCharts = useMemo(() => {
    if (localSelection.size === 0) return 0;
    const selectedDims = availableDimensions.filter((d) => localSelection.has(d.columnName));
    return selectedDims.reduce((product, dim) => product * (dim.valueCount || 1), 1);
  }, [localSelection, availableDimensions]);

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

      {/* Checkboxes */}
      {availableDimensions.map((dimension) => {
        const isSelected = localSelection.has(dimension.columnName);
        const isDisabled =
          !isSelected && localSelection.size >= maxSelectable;

        return (
          <label
            key={dimension.columnName}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all cursor-pointer
              ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}
              ${isSelected
                ? 'bg-violet-100 dark:bg-violet-900/30 border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-violet-300 dark:hover:border-violet-600'
              }
              ${compact ? 'text-xs py-0.5 px-2' : 'text-sm'}
            `}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleDimension(dimension.columnName)}
              disabled={isDisabled}
              className="sr-only"
            />
            <span className="font-medium">{dimension.displayName}</span>
            {dimension.valueCount !== undefined && (
              <span className={`text-slate-500 dark:text-slate-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                ({dimension.valueCount})
              </span>
            )}
          </label>
        );
      })}

      {/* Chart count indicator - show actual count when expanded, estimate otherwise */}
      {localSelection.size > 0 && (
        <span className={`text-slate-500 dark:text-slate-400 ${compact ? 'text-xs' : 'text-sm'}`}>
          {showingCount !== undefined && totalCount !== undefined
            ? `${showingCount} of ${totalCount}`
            : `~${estimatedCharts} chart${estimatedCharts !== 1 ? 's' : ''}`}
        </span>
      )}

      {/* Apply button (only shown when changes pending) */}
      {hasChanges && (
        <button
          type="button"
          onClick={handleApply}
          disabled={isLoading}
          className={`
            px-3 py-1 font-medium text-white bg-violet-600 hover:bg-violet-700
            rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            ${compact ? 'text-xs px-2 py-0.5' : 'text-sm'}
          `}
        >
          {isLoading ? 'Loading...' : 'Apply'}
        </button>
      )}

      {/* Clear button (only shown when expanded) */}
      {selectedColumns.length > 0 && !hasChanges && (
        <button
          type="button"
          onClick={() => onApply([])}
          disabled={isLoading}
          className={`
            px-3 py-1 font-medium text-slate-600 dark:text-slate-400 
            hover:text-slate-800 dark:hover:text-slate-200
            border border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500
            rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            ${compact ? 'text-xs px-2 py-0.5' : 'text-sm'}
          `}
        >
          Clear
        </button>
      )}
    </div>
  );
}

export default DimensionCheckboxes;

