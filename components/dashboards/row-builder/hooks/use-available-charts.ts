import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import type { ChartDefinition } from '@/lib/types/analytics';

export interface UseAvailableChartsReturn {
  availableCharts: ChartDefinition[];
  isLoading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

/**
 * Hook for loading available charts from the API
 *
 * Fetches all active chart definitions that can be added to dashboards.
 * Automatically loads on mount.
 */
export function useAvailableCharts(): UseAvailableChartsReturn {
  const [availableCharts, setAvailableCharts] = useState<ChartDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadCharts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await apiClient.get<{
        charts: ChartDefinition[];
      }>('/api/admin/analytics/charts?is_active=true');

      // Handle both direct chart arrays and nested chart_definitions structure
      const charts = (result.charts || [])
        .map((item: ChartDefinition | { chart_definitions: ChartDefinition }) => {
          return 'chart_definitions' in item ? item.chart_definitions : item;
        })
        .filter((chart: ChartDefinition) => chart.is_active !== false);

      setAvailableCharts(charts);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load charts');
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load charts on mount
  useEffect(() => {
    loadCharts();
  }, [loadCharts]);

  return {
    availableCharts,
    isLoading,
    error,
    reload: loadCharts,
  };
}
