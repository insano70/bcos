'use client';

/**
 * Dimension Selector
 *
 * Modal/dropdown UI for selecting which dimension to expand a chart by.
 * Appears when a chart has multiple expansion dimensions available.
 *
 * Features:
 * - Radio button selection
 * - Dimension display names
 * - Value count display
 * - Apply and Cancel buttons
 */

import { useState } from 'react';
import type { ExpansionDimension } from '@/lib/types/dimensions';

interface DimensionSelectorProps {
  availableDimensions: ExpansionDimension[];
  onSelect: (dimension: ExpansionDimension) => void;
  onCancel: () => void;
}

export default function DimensionSelector({
  availableDimensions,
  onSelect,
  onCancel,
}: DimensionSelectorProps) {
  const [selectedDimension, setSelectedDimension] = useState<ExpansionDimension | null>(
    availableDimensions[0] || null
  );

  const handleApply = () => {
    if (selectedDimension) {
      onSelect(selectedDimension);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Expand by Dimension
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Choose a dimension to view side-by-side chart comparisons
        </p>
      </div>

      {/* Dimension options */}
      <div className="space-y-2">
        {availableDimensions.map((dimension) => (
          <label
            key={dimension.columnName}
            className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 
                     rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50
                     transition-colors"
          >
            <input
              type="radio"
              name="dimension"
              value={dimension.columnName}
              checked={selectedDimension?.columnName === dimension.columnName}
              onChange={() => setSelectedDimension(dimension)}
              className="w-4 h-4 text-violet-600 border-gray-300 focus:ring-violet-500"
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
        ))}
      </div>

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
          disabled={!selectedDimension}
          className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 
                   rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Expand
        </button>
      </div>
    </div>
  );
}

