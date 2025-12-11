/**
 * useChartDefinitions Hook
 *
 * Fetches and manages chart definitions for dashboard rendering.
 * Provides O(1) chart lookup via Map and handles loading/error states.
 *
 * Extracted from dashboard-view.tsx for better separation of concerns.
 *
 * @module hooks/useChartDefinitions
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { DASHBOARD_MESSAGES } from '@/lib/constants/dashboard-messages';
import type { ChartDefinition } from '@/lib/types/analytics';
import { clientErrorLog } from '@/lib/utils/debug-client';

/**
 * Return type for useChartDefinitions hook
 */
export interface UseChartDefinitionsResult {
  /** List of available chart definitions */
  availableCharts: ChartDefinition[];
  /** Whether chart definitions are currently loading */
  isLoading: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Map for O(1) chart lookups by chart_definition_id */
  chartsById: Map<string, ChartDefinition>;
  /** Refetch chart definitions (useful after creating new charts) */
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage chart definitions
 *
 * Features:
 * - Fetches active chart definitions from API
 * - Provides O(1) lookup via chartsById Map
 * - Handles loading and error states
 * - Prevents duplicate fetches via ref guard
 *
 * @returns Chart definitions state and utilities
 */
export function useChartDefinitions(): UseChartDefinitionsResult {
  const [availableCharts, setAvailableCharts] = useState<ChartDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ref to prevent double execution in StrictMode
  const hasLoadedRef = useRef(false);

  // Create a Map for O(1) chart lookups by ID
  // This eliminates repeated .find() calls in dashboard rendering
  const chartsById = useMemo(() => {
    const map = new Map<string, ChartDefinition>();
    for (const chart of availableCharts) {
      map.set(chart.chart_definition_id, chart);
    }
    return map;
  }, [availableCharts]);

  const loadChartDefinitions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await apiClient.get<{
        charts: ChartDefinition[] | Array<{ chart_definitions: ChartDefinition }>;
      }>('/api/admin/analytics/charts?is_active=true');

      const charts = (result.charts || [])
        .map((item: ChartDefinition | { chart_definitions: ChartDefinition }) => {
          return 'chart_definitions' in item ? item.chart_definitions : item;
        })
        .filter((chart: ChartDefinition) => chart.is_active !== false);

      setAvailableCharts(charts);
    } catch (err) {
      clientErrorLog('Failed to load chart definitions:', err);
      setError(DASHBOARD_MESSAGES.ERRORS.CHART_DEFINITIONS_LOAD_FAILED);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load with double-execution guard
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadChartDefinitions();
    }
  }, [loadChartDefinitions]);

  // Refetch function for manual refresh (resets the guard)
  const refetch = useCallback(async () => {
    hasLoadedRef.current = true; // Keep guard set
    await loadChartDefinitions();
  }, [loadChartDefinitions]);

  return {
    availableCharts,
    isLoading,
    error,
    chartsById,
    refetch,
  };
}

export default useChartDefinitions;
