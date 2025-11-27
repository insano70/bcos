'use client';

/**
 * Dimension Value Selector
 *
 * Advanced dimension expansion UI that allows users to select specific
 * values within each dimension, preventing combinatorial explosion.
 *
 * Features:
 * - Multi-select dropdown per dimension with search-as-you-type
 * - Value-level selection with record counts
 * - Select All / Reset shortcuts per dimension
 * - Real-time combination count preview
 * - Color-coded budget indicators (green/amber/red)
 * - Apply button for batch changes
 *
 * Phase 1 of dimension expansion improvements.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import type {
  DimensionWithValues,
  ValueSelectionState,
  DimensionValueSelection,
} from '@/lib/types/dimensions';
import { ValueMultiSelect } from './dimension-multi-select';

/**
 * Chart budget thresholds for UI feedback
 */
const CHART_BUDGET = {
  /** Optimal range (green) */
  GOOD: 12,
  /** Warning range (amber) */
  WARNING: 30,
  /** Hard limit (red - blocks submission) */
  HARD_LIMIT: 50,
} as const;

interface DimensionValueSelectorProps {
  /** Available dimensions with their values */
  dimensionsWithValues: DimensionWithValues[];
  /** Callback when selection is applied */
  onApply: (selections: DimensionValueSelection[]) => void;
  /** Currently applied selections (for sync) */
  appliedSelections?: DimensionValueSelection[];
  /** Whether expansion is loading */
  isLoading?: boolean;
  /** Whether dimensions/values are loading */
  isDimensionsLoading?: boolean;
  /** Compact mode for tighter spacing */
  compact?: boolean;
}

/**
 * Dimension Value Selector Component
 */
export function DimensionValueSelector({
  dimensionsWithValues,
  onApply,
  appliedSelections = [],
  isLoading = false,
  isDimensionsLoading = false,
  compact = false,
}: DimensionValueSelectorProps) {
  // Track value selections per dimension
  const [selections, setSelections] = useState<ValueSelectionState>(() => {
    const initial: ValueSelectionState = {};
    for (const sel of appliedSelections) {
      initial[sel.columnName] = new Set(sel.selectedValues);
    }
    return initial;
  });

  // Sync with applied selections when they change externally
  useEffect(() => {
    const newSelections: ValueSelectionState = {};
    for (const sel of appliedSelections) {
      newSelections[sel.columnName] = new Set(sel.selectedValues);
    }
    setSelections(newSelections);
  }, [appliedSelections]);

  // Update selection for a dimension
  const updateDimensionSelection = useCallback((columnName: string, selected: Set<string | number>) => {
    setSelections((prev) => ({
      ...prev,
      [columnName]: selected,
    }));
  }, []);

  // Calculate combination count
  const combinationInfo = useMemo(() => {
    const activeSelections: { dimension: string; count: number }[] = [];
    
    for (const dim of dimensionsWithValues) {
      const selected = selections[dim.dimension.columnName];
      if (selected && selected.size > 0) {
        activeSelections.push({
          dimension: dim.dimension.displayName,
          count: selected.size,
        });
      }
    }

    const count = activeSelections.length > 0
      ? activeSelections.reduce((product, s) => product * s.count, 1)
      : 0;

    return { count, selections: activeSelections };
  }, [selections, dimensionsWithValues]);

  // Check if current selections differ from applied
  const hasChanges = useMemo(() => {
    // Build current selection map
    const currentMap: Record<string, Set<string | number>> = {};
    for (const [col, vals] of Object.entries(selections)) {
      if (vals.size > 0) {
        currentMap[col] = vals;
      }
    }

    // Build applied selection map
    const appliedMap: Record<string, Set<string | number>> = {};
    for (const sel of appliedSelections) {
      if (sel.selectedValues.length > 0) {
        appliedMap[sel.columnName] = new Set(sel.selectedValues);
      }
    }

    // Compare keys
    const currentKeys = Object.keys(currentMap);
    const appliedKeys = Object.keys(appliedMap);
    if (currentKeys.length !== appliedKeys.length) return true;

    // Compare values
    for (const key of currentKeys) {
      const currentSet = currentMap[key];
      const appliedSet = appliedMap[key];
      if (!currentSet || !appliedSet) return true;
      if (currentSet.size !== appliedSet.size) return true;
      // Use Array.from to iterate Set (TypeScript downlevelIteration compatibility)
      const currentVals = Array.from(currentSet);
      for (const val of currentVals) {
        if (!appliedSet.has(val)) return true;
      }
    }

    return false;
  }, [selections, appliedSelections]);

  // Handle apply
  const handleApply = useCallback(() => {
    const result: DimensionValueSelection[] = [];
    
    for (const dim of dimensionsWithValues) {
      const selected = selections[dim.dimension.columnName];
      if (selected && selected.size > 0) {
        const selection: DimensionValueSelection = {
          columnName: dim.dimension.columnName,
          selectedValues: Array.from(selected),
        };
        if (dim.dimension.displayName) {
          selection.displayName = dim.dimension.displayName;
        }
        result.push(selection);
      }
    }
    
    onApply(result);
  }, [selections, dimensionsWithValues, onApply]);

  // Handle reset all
  const handleReset = useCallback(() => {
    setSelections({});
    onApply([]);
  }, [onApply]);

  // Loading state
  if (isDimensionsLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-2">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>Loading dimensions...</span>
      </div>
    );
  }

  // Empty state
  if (dimensionsWithValues.length === 0) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400 py-2">
        No dimensions available for expansion
      </div>
    );
  }

  const isBlocked = combinationInfo.count > CHART_BUDGET.HARD_LIMIT;

  return (
    <div className={`flex flex-wrap items-end gap-3 ${compact ? 'gap-2' : ''}`}>
      {/* Dimension dropdowns */}
      {dimensionsWithValues.map((dwv) => (
        <div key={dwv.dimension.columnName} className={compact ? 'min-w-[140px] max-w-[180px]' : 'min-w-[160px] max-w-[220px]'}>
          {/* Dimension label */}
          <div className={`mb-1 font-medium text-slate-700 dark:text-slate-200 ${compact ? 'text-xs' : 'text-sm'}`}>
            {dwv.dimension.displayName}
          </div>
          {/* Value dropdown */}
          <ValueMultiSelect
            dimensionName={dwv.dimension.displayName}
            options={dwv.values}
            selected={selections[dwv.dimension.columnName] ?? new Set()}
            onChange={(selected) => updateDimensionSelection(dwv.dimension.columnName, selected)}
            placeholder={`Select...`}
            disabled={isLoading}
            compact={compact}
            isLoading={dwv.isLoading ?? false}
            {...(dwv.error ? { error: dwv.error } : {})}
          />
        </div>
      ))}

      {/* Action buttons - same row as dropdowns */}
      <div className={`flex items-center gap-2 ${compact ? 'pb-0.5' : 'pb-1'}`}>
        {/* Apply button */}
        {hasChanges && (
          <button
            type="button"
            onClick={handleApply}
            disabled={isLoading || isBlocked || combinationInfo.count === 0}
            className={`
              px-3 py-1.5 font-medium text-white bg-violet-600 hover:bg-violet-700
              rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              ${compact ? 'text-xs px-2 py-1' : 'text-sm'}
            `}
          >
            {isLoading ? 'Loading...' : 'Apply'}
          </button>
        )}

        {/* Reset button */}
        <button
          type="button"
          onClick={handleReset}
          disabled={isLoading || appliedSelections.length === 0}
          className={`
            px-3 py-1.5 font-medium text-slate-600 dark:text-slate-400
            hover:text-slate-800 dark:hover:text-slate-200
            border border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500
            rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            ${compact ? 'text-xs px-2 py-1' : 'text-sm'}
          `}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default DimensionValueSelector;
