/**
 * useChartSwapping Hook
 *
 * Manages chart swapping state for drill-down functionality.
 * Tracks which charts have been swapped from their original to a target chart.
 *
 * Extracted from dashboard-view.tsx for better separation of concerns.
 *
 * @module hooks/useChartSwapping
 */

import { useCallback, useState } from 'react';
import { clientDebugLog } from '@/lib/utils/debug-client';

/**
 * Map of swapped charts: originalChartId -> targetChartId
 */
type SwappedChartsMap = Map<string, string>;

/**
 * Return type for useChartSwapping hook
 */
export interface UseChartSwappingResult {
  /** Map of swapped charts: originalChartId -> targetChartId */
  swappedCharts: SwappedChartsMap;
  /** Handle chart swap from drill-down action */
  handleChartSwap: (sourceChartId: string, targetChartId: string) => void;
  /** Revert a swapped chart back to its original */
  handleRevertSwap: (sourceChartId: string) => void;
  /** Clear all chart swaps */
  clearAllSwaps: () => void;
}

/**
 * Hook to manage chart swapping for drill-down functionality
 *
 * Features:
 * - Tracks swapped charts in a Map for O(1) lookups
 * - Provides swap and revert handlers
 * - Debug logging for swap actions
 *
 * @returns Chart swapping state and handlers
 *
 * @example
 * ```tsx
 * const { swappedCharts, handleChartSwap, handleRevertSwap } = useChartSwapping();
 *
 * // In chart drill-down handler
 * const onDrillDown = (targetChartId: string) => {
 *   handleChartSwap(currentChartId, targetChartId);
 * };
 *
 * // Check if chart is swapped
 * const targetChartId = swappedCharts.get(chartId);
 * const isSwapped = !!targetChartId;
 * ```
 */
export function useChartSwapping(): UseChartSwappingResult {
  const [swappedCharts, setSwappedCharts] = useState<SwappedChartsMap>(
    () => new Map()
  );

  /**
   * Handle chart swap from drill-down action
   * Maps the source chart ID to the target chart ID
   */
  const handleChartSwap = useCallback(
    (sourceChartId: string, targetChartId: string) => {
      clientDebugLog.component('Dashboard chart swap', {
        sourceChartId,
        targetChartId,
      });
      setSwappedCharts((prev) => {
        const next = new Map(prev);
        next.set(sourceChartId, targetChartId);
        return next;
      });
    },
    []
  );

  /**
   * Revert a swapped chart back to its original
   * Removes the swap mapping for the given source chart
   */
  const handleRevertSwap = useCallback((sourceChartId: string) => {
    clientDebugLog.component('Dashboard chart revert', { sourceChartId });
    setSwappedCharts((prev) => {
      const next = new Map(prev);
      next.delete(sourceChartId);
      return next;
    });
  }, []);

  /**
   * Clear all chart swaps
   * Useful when navigating away or resetting dashboard state
   */
  const clearAllSwaps = useCallback(() => {
    clientDebugLog.component('Dashboard chart swaps cleared');
    setSwappedCharts(new Map());
  }, []);

  return {
    swappedCharts,
    handleChartSwap,
    handleRevertSwap,
    clearAllSwaps,
  };
}

export default useChartSwapping;
