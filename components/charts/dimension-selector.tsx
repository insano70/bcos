'use client';

/**
 * Dimension Selector
 *
 * Modal/dropdown UI for selecting which dimensions to expand a chart by.
 * Appears when a chart has multiple expansion dimensions available.
 *
 * Features:
 * - Checkbox multi-select (1-3 dimensions)
 * - Dimension display names
 * - Value count display
 * - Combination count estimate
 * - Warning for high combination counts
 * - Apply and Cancel buttons
 */

import { useState, useMemo } from 'react';
import type { ExpansionDimension } from '@/lib/types/dimensions';
import {
  MAX_DIMENSIONS_PER_EXPANSION,
  COMBINATION_WARNING_THRESHOLD,
  COMBINATION_HIGH_WARNING_THRESHOLD,
  MAX_PARALLEL_DIMENSION_CHARTS,
  CHARTS_PER_PAGE,
} from '@/lib/constants/dimension-expansion';

interface DimensionSelectorProps {
  availableDimensions: ExpansionDimension[];
  onSelect: (dimensions: ExpansionDimension[]) => void;
  onCancel: () => void;
}

export default function DimensionSelector({
  availableDimensions,
  onSelect,
  onCancel,
}: DimensionSelectorProps) {
  const [selectedDimensionColumns, setSelectedDimensionColumns] = useState<Set<string>>(new Set());

  // Calculate selected dimensions
  const selectedDimensions = useMemo(() => {
    return availableDimensions.filter((dim) => selectedDimensionColumns.has(dim.columnName));
  }, [availableDimensions, selectedDimensionColumns]);

  // Calculate estimated combination count
  const estimatedCombinations = useMemo(() => {
    if (selectedDimensions.length === 0) return 0;
    return selectedDimensions.reduce(
      (product, dim) => product * (dim.valueCount || 1),
      1
    );
  }, [selectedDimensions]);

  // Toggle dimension selection
  const toggleDimension = (columnName: string) => {
    setSelectedDimensionColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnName)) {
        next.delete(columnName);
      } else {
        // Enforce maximum dimensions
        if (next.size >= MAX_DIMENSIONS_PER_EXPANSION) {
          return prev;
        }
        next.add(columnName);
      }
      return next;
    });
  };

  const handleApply = () => {
    if (selectedDimensions.length > 0) {
      onSelect(selectedDimensions);
    }
  };

  // Show truncation warning (>100 charts, results will be limited to 100)
  const showTruncationWarning = estimatedCombinations > MAX_PARALLEL_DIMENSION_CHARTS;

  // Show high warning (50-100 charts, non-blocking)
  const showHighWarning =
    estimatedCombinations >= COMBINATION_HIGH_WARNING_THRESHOLD &&
    estimatedCombinations <= MAX_PARALLEL_DIMENSION_CHARTS;

  // Show low warning (15-49 charts, non-blocking)
  const showLowWarning =
    estimatedCombinations >= COMBINATION_WARNING_THRESHOLD &&
    estimatedCombinations < COMBINATION_HIGH_WARNING_THRESHOLD;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Expand by Dimensions
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Select 1-{MAX_DIMENSIONS_PER_EXPANSION} dimensions to view side-by-side chart comparisons
        </p>
      </div>

      {/* Dimension options */}
      <div className="space-y-2">
        {availableDimensions.map((dimension) => {
          const isSelected = selectedDimensionColumns.has(dimension.columnName);
          const isDisabled =
            !isSelected && selectedDimensionColumns.size >= MAX_DIMENSIONS_PER_EXPANSION;

          return (
            <label
              key={dimension.columnName}
              className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${
                isDisabled
                  ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-700'
                  : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 border-gray-200 dark:border-gray-700'
              } ${
                isSelected
                  ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700'
                  : ''
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleDimension(dimension.columnName)}
                disabled={isDisabled}
                className="w-4 h-4 text-violet-600 border-gray-300 focus:ring-violet-500 rounded"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {dimension.displayName}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {dimension.columnName}
                  {dimension.valueCount !== undefined && ` • ${dimension.valueCount} values`}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {/* Selection summary */}
      {selectedDimensions.length > 0 && (
        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300">
              {selectedDimensions.length} dimension{selectedDimensions.length > 1 ? 's' : ''} selected
            </span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              ~{estimatedCombinations} chart{estimatedCombinations > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Truncation warning for exceeding limit (>100 charts) */}
      {showTruncationWarning && (
        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
          <div className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Results will be limited
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                This combination would create {estimatedCombinations} charts. Only the first {MAX_PARALLEL_DIMENSION_CHARTS} charts will be shown, displaying {CHARTS_PER_PAGE} at a time with pagination.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* High warning for very large combination count (50-99) */}
      {showHighWarning && (
        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
          <div className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Very high number of charts
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                This will create {estimatedCombinations} charts. Charts will be displayed {CHARTS_PER_PAGE} at a time with pagination. Consider selecting fewer dimensions for better performance.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Low warning for moderate combination count (15-49) */}
      {showLowWarning && (
        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
          <div className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Moderate number of charts
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                This will create approximately {estimatedCombinations} charts. Charts will be displayed {CHARTS_PER_PAGE} at a time.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300
                   hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={selectedDimensions.length === 0}
          className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700
                   rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {selectedDimensions.length > 0
            ? `Expand by ${selectedDimensions.length} Dimension${selectedDimensions.length > 1 ? 's' : ''}`
            : 'Expand'}
        </button>
      </div>
    </div>
  );
}

