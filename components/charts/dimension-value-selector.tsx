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
 * Combination count preview with color-coded feedback
 */
function CombinationPreview({
  count,
  selections,
  compact = false,
}: {
  count: number;
  selections: { dimension: string; count: number }[];
  compact?: boolean;
}) {
  if (count === 0) {
    return null;
  }

  // Determine status
  const isGood = count <= CHART_BUDGET.GOOD;
  const isWarning = count > CHART_BUDGET.GOOD && count <= CHART_BUDGET.WARNING;
  const isError = count > CHART_BUDGET.WARNING;
  const isBlocked = count > CHART_BUDGET.HARD_LIMIT;

  // Build formula string (e.g., "2 × 3 × 2 = 12")
  const formula = selections.length > 0
    ? `${selections.map(s => s.count).join(' × ')} = ${count}`
    : String(count);

  return (
    <div className={`
      rounded-lg px-3 py-2 text-sm
      ${isGood ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : ''}
      ${isWarning ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : ''}
      ${isError ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' : ''}
      ${compact ? 'px-2 py-1.5 text-xs' : ''}
    `}>
      <div className="flex items-center gap-2">
        {/* Status icon */}
        {isGood && (
          <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {isWarning && (
          <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )}
        {isError && (
          <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        
        <span className={`font-medium ${
          isGood ? 'text-green-700 dark:text-green-300' : ''
        }${isWarning ? 'text-amber-700 dark:text-amber-300' : ''
        }${isError ? 'text-red-700 dark:text-red-300' : ''}`}>
          {count} chart{count !== 1 ? 's' : ''}
        </span>
        
        {selections.length > 1 && (
          <span className="text-slate-500 dark:text-slate-400">
            ({formula})
          </span>
        )}
      </div>
      
      {/* Warning messages */}
      {isWarning && !isBlocked && (
        <p className="mt-1 text-amber-600 dark:text-amber-400 text-xs">
          Consider reducing selections for better performance
        </p>
      )}
      {isBlocked && (
        <p className="mt-1 text-red-600 dark:text-red-400 text-xs">
          Exceeds limit of {CHART_BUDGET.HARD_LIMIT}. Please reduce selections.
        </p>
      )}
    </div>
  );
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
    <div className={`space-y-3 ${compact ? 'space-y-2' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className={`text-slate-600 dark:text-slate-400 font-medium ${compact ? 'text-xs' : 'text-sm'}`}>
          Filter by values:
        </span>
      </div>

      {/* Dimension dropdowns - horizontal layout */}
      <div className={`flex flex-wrap items-start gap-3 ${compact ? 'gap-2' : ''}`}>
        {dimensionsWithValues.map((dwv) => (
          <div key={dwv.dimension.columnName} className={compact ? 'min-w-[160px] max-w-[200px]' : 'min-w-[180px] max-w-[240px]'}>
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
              placeholder={`Select ${dwv.dimension.displayName.toLowerCase()}...`}
              disabled={isLoading}
              compact={compact}
              isLoading={dwv.isLoading ?? false}
              {...(dwv.error ? { error: dwv.error } : {})}
            />
          </div>
        ))}
      </div>

      {/* Combination preview */}
      <CombinationPreview
        count={combinationInfo.count}
        selections={combinationInfo.selections}
        compact={compact}
      />

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {/* Apply button */}
        {hasChanges && (
          <button
            type="button"
            onClick={handleApply}
            disabled={isLoading || isBlocked || combinationInfo.count === 0}
            className={`
              px-4 py-1.5 font-medium text-white bg-violet-600 hover:bg-violet-700
              rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              ${compact ? 'text-xs px-3 py-1' : 'text-sm'}
            `}
          >
            {isLoading ? 'Loading...' : 'Apply'}
          </button>
        )}

        {/* Reset button (always visible, disabled when nothing to reset) */}
        <button
          type="button"
          onClick={handleReset}
          disabled={isLoading || appliedSelections.length === 0}
          className={`
            px-4 py-1.5 font-medium text-slate-600 dark:text-slate-400
            hover:text-slate-800 dark:hover:text-slate-200
            border border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500
            rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            ${compact ? 'text-xs px-3 py-1' : 'text-sm'}
          `}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default DimensionValueSelector;
