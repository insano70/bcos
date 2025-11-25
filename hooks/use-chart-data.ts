/**
 * useChartData Hook
 *
 * Phase 4.1: Unified data fetching hook for all chart types
 *
 * Replaces divergent fetch patterns in analytics-chart.tsx with a single,
 * consistent API call to the universal endpoint.
 *
 * Features:
 * - Single API call to /api/admin/analytics/chart-data/universal
 * - Handles loading/error states
 * - Returns formatted data for all chart types
 * - Supports both chart definition ID and inline config
 * - Automatic refetch capability
 */

import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import type { ChartData, ChartFilter, DualAxisConfig } from '@/lib/types/analytics';
import { createClientLogger } from '@/lib/utils/client-logger';

const chartDataLogger = createClientLogger('ChartData');

/**
 * Formatted cell structure for table charts (Phase 3.2)
 */
interface FormattedCell {
  formatted: string;
  raw: unknown;
  icon?: {
    name: string;
    color?: string;
    type?: string;
  };
}

/**
 * Column definition for table charts
 */
interface ColumnDefinition {
  columnName: string;
  displayName: string;
  dataType: string;
  formatType?: string | null;
  displayIcon?: boolean | null;
  iconType?: string | null;
  iconColorMode?: string | null;
  iconColor?: string | null;
  iconMapping?: Record<string, unknown> | null;
}

/**
 * Universal chart data request
 */
interface UniversalChartDataRequest {
  // Option 1: Reference existing chart definition
  chartDefinitionId?: string;

  // Option 2: Inline chart configuration
  chartConfig?: {
    chartType: string;
    dataSourceId: number;
    groupBy?: string;
    colorPalette?: string;
    stackingMode?: string;
    aggregation?: string;
    target?: number;
    dualAxisConfig?: unknown;
    [key: string]: unknown;
  };

  // Runtime filters (override chart definition)
  runtimeFilters?: {
    startDate?: string;
    endDate?: string;
    dateRangePreset?: string;
    practice?: string;
    practiceUid?: string;
    providerName?: string;
    measure?: string;
    frequency?: string;
    advancedFilters?: ChartFilter[];
    calculatedField?: string;
  };

  // Cache control (Phase 6)
  nocache?: boolean;
}

/**
 * Universal chart data response from server
 */
interface UniversalChartDataResponse {
  chartData: ChartData;
  rawData: Record<string, unknown>[];
  columns?: ColumnDefinition[];
  formattedData?: Array<Record<string, FormattedCell>>;
  metadata: {
    chartType: string;
    dataSourceId: number;
    transformedAt: string;
    queryTimeMs: number;
    cacheHit: boolean;
    recordCount: number;
    transformDuration: number;
  };
}

/**
 * Hook return value
 */
interface UseChartDataReturn {
  data: UniversalChartDataResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * useChartData Hook
 *
 * Fetches chart data from the universal endpoint with unified error handling
 * and loading states.
 *
 * @param request - Chart data request (definition ID or inline config)
 * @returns Chart data, loading state, error, and refetch function
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, refetch } = useChartData({
 *   chartDefinitionId: '123e4567-e89b-12d3-a456-426614174000'
 * });
 * ```
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, refetch } = useChartData({
 *   chartConfig: {
 *     chartType: 'bar',
 *     dataSourceId: 42,
 *     groupBy: 'practice_name'
 *   },
 *   runtimeFilters: {
 *     startDate: '2024-01-01',
 *     endDate: '2024-12-31'
 *   }
 * });
 * ```
 */
export function useChartData(request: UniversalChartDataRequest): UseChartDataReturn {
  const [data, setData] = useState<UniversalChartDataResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch chart data from universal endpoint
   */
  const fetchData = useCallback(async () => {
    // Debug logging for dual-axis only
    const dualAxisConfig = request.chartConfig?.dualAxisConfig as DualAxisConfig | undefined;
    if (request.chartConfig?.chartType === 'dual-axis' && dualAxisConfig) {
      const primary = dualAxisConfig.primary?.measure || 'unknown';
      const secondary = dualAxisConfig.secondary?.measure || 'unknown';
      chartDataLogger.log(`Dual-axis fetch: ${primary} + ${secondary}`, { primary, secondary });
    }

    // Validate request
    if (!request.chartDefinitionId && !request.chartConfig) {
      setError('Either chartDefinitionId or chartConfig must be provided');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Add nocache query param if nocache is true in request body
      const url = request.nocache
        ? '/api/admin/analytics/chart-data/universal?nocache=true'
        : '/api/admin/analytics/chart-data/universal';

      const response = await apiClient.post<UniversalChartDataResponse>(
        url,
        request
      );

      setData(response);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch chart data';

      setError(errorMessage);
      setData(null);

      // Log error
      chartDataLogger.error('Chart data fetch failed', err instanceof Error ? err : new Error(String(err)), {
        chartType: request.chartConfig?.chartType,
        dataSourceId: request.chartConfig?.dataSourceId,
        hasDefinitionId: Boolean(request.chartDefinitionId),
      });
    } finally {
      setIsLoading(false);
    }
    // Use serialized request for dependency to compare values, not references
  }, [request]);

  /**
   * Refetch data
   * @param bypassCache - If true, bypasses cache and fetches fresh data
   */
  const refetch = useCallback(
    async (bypassCache = false) => {
      if (bypassCache && request.chartConfig) {
        // Create new request with nocache flag
        const freshRequest = {
          ...request,
          nocache: true,
        };

        // Directly call API with nocache flag
        try {
          const response = await apiClient.post<UniversalChartDataResponse>(
            '/api/admin/analytics/chart-data/universal?nocache=true',
            freshRequest
          );
          setData(response);
          setError(null);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch chart data';
          setError(errorMessage);
        }
      } else {
        await fetchData();
      }
    },
    [fetchData, request]
  );

  /**
   * Fetch data on mount or when request changes
   * Use ref to prevent duplicate fetches from React 19's double-render pattern
   */
  const lastFetchTimeRef = React.useRef<number>(0);

  useEffect(() => {
    const now = Date.now();
    // Skip if we fetched less than 50ms ago (same render cycle)
    if (now - lastFetchTimeRef.current < 50) {
      return;
    }

    lastFetchTimeRef.current = now;
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch,
  };
}
