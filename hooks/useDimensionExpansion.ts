/**
 * useDimensionExpansion Hook
 *
 * Manages dimension expansion feature for charts:
 * - Fetch available dimensions for a chart (with caching)
 * - Handle dimension selection and expansion API calls
 * - Manage loading states and expanded data
 * - Handle collapse back to single chart
 *
 * Features:
 * - Auto-fetches dimensions when modal opens
 * - Caches dimension results by chartDefinitionId + filter hash
 * - Supports inline checkbox selection (no modal required)
 * - Toggle dimensions on/off for expansion
 *
 * Single Responsibility: Dimension expansion state and API calls
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { apiClient } from '@/lib/api/client';
import type {
  AvailableDimensionsResponse,
  MultiDimensionExpandedChartData,
  ExpansionDimension,
  DimensionExpansionChartConfig,
  DimensionExpansionFilters,
} from '@/lib/types/dimensions';
import { CHARTS_PER_PAGE } from '@/lib/constants/dimension-expansion';
import { createClientLogger } from '@/lib/utils/client-logger';

const dimensionLogger = createClientLogger('DimensionExpansion');

/**
 * Simple hash function for cache key generation
 */
function hashFilters(filters: Record<string, unknown> | undefined): string {
  if (!filters) return 'no-filters';
  try {
    return btoa(JSON.stringify(filters)).slice(0, 16);
  } catch {
    return 'hash-error';
  }
}

/**
 * Global cache for dimension results to avoid redundant API calls
 * Key: `${chartDefinitionId}:${filterHash}`
 */
const dimensionCache = new Map<string, ExpansionDimension[]>();

/**
 * Parameters for useDimensionExpansion hook
 */
interface UseDimensionExpansionParams {
  chartDefinitionId?: string | undefined;
  finalChartConfig?: DimensionExpansionChartConfig | undefined;
  runtimeFilters?: DimensionExpansionFilters | undefined;
  isOpen: boolean;
}

/**
 * Return value from useDimensionExpansion hook
 */
export interface DimensionExpansionState {
  /** @deprecated Modal functionality removed - use inline checkboxes instead */
  showSelector: boolean;
  /** @deprecated Modal functionality removed - use inline checkboxes instead */
  setShowSelector: (show: boolean) => void;
  /** Available dimensions with value counts (only includes dimensions with 2+ values) */
  availableDimensions: ExpansionDimension[];
  /** Expanded chart data (null when showing single chart) */
  expandedData: MultiDimensionExpandedChartData | null;
  /** Loading state for dimension fetch or expansion */
  loading: boolean;
  /** Whether dimensions are being fetched */
  dimensionsLoading: boolean;
  /** Whether more charts are being loaded (Load More) */
  loadingMore: boolean;
  /** Whether there are more charts available to load */
  hasMore: boolean;
  /** Error message (null if no error) */
  error: string | null;
  /** Clear error state */
  clearError: () => void;
  /** Currently selected dimension column names */
  selectedDimensionColumns: string[];
  /** Whether expansion is possible (has chart config and filters) */
  canExpand: boolean;
  /** @deprecated Use selectDimensions directly with checkbox selection */
  expandByDimension: () => void;
  /** Select dimensions and fetch expanded data */
  selectDimensions: (dimensions: ExpansionDimension[]) => Promise<void>;
  /** Select dimensions by column names (for checkbox toggle) */
  selectDimensionsByColumns: (columnNames: string[]) => Promise<void>;
  /** Toggle a single dimension on/off */
  toggleDimension: (columnName: string) => Promise<void>;
  /** Collapse back to single chart view */
  collapse: () => void;
  /** Refresh available dimensions (bypass cache) */
  refreshDimensions: () => Promise<void>;
  /** Load more charts (server-side pagination) */
  loadMore: () => Promise<void>;
}

/**
 * Manages dimension expansion state and API interactions
 *
 * @param params - Hook parameters
 * @returns Dimension expansion state and actions
 */
export function useDimensionExpansion(
  params: UseDimensionExpansionParams
): DimensionExpansionState {
  const { chartDefinitionId, finalChartConfig, runtimeFilters, isOpen } = params;

  // State - removed showSelector as modal is no longer used
  const [availableDimensions, setAvailableDimensions] = useState<ExpansionDimension[]>([]);
  const [expandedData, setExpandedData] = useState<MultiDimensionExpandedChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dimensionsLoading, setDimensionsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDimensionColumns, setSelectedDimensionColumns] = useState<string[]>([]);
  
  // Ref to track if dimensions have been fetched for current params
  const lastFetchKey = useRef<string | null>(null);
  
  const clearError = useCallback(() => setError(null), []);

  // Generate cache key for current params
  const cacheKey = useMemo(() => {
    if (!chartDefinitionId) return null;
    const filterHash = hashFilters(runtimeFilters);
    return `${chartDefinitionId}:${filterHash}`;
  }, [chartDefinitionId, runtimeFilters]);

  const canExpand =
    Boolean(chartDefinitionId) &&
    Boolean(finalChartConfig && Object.keys(finalChartConfig).length > 0) &&
    Boolean(runtimeFilters && Object.keys(runtimeFilters).length > 0);

  /**
   * Fetch available dimensions for the chart (with caching)
   */
  const fetchAvailableDimensions = useCallback(async (bypassCache = false) => {
    if (!chartDefinitionId || !cacheKey) return;

    // Check cache first (unless bypassing)
    if (!bypassCache && dimensionCache.has(cacheKey)) {
      const cached = dimensionCache.get(cacheKey);
      if (cached) {
        setAvailableDimensions(cached);
        lastFetchKey.current = cacheKey;
        return;
      }
    }

    // Already fetching for this key
    if (lastFetchKey.current === cacheKey && !bypassCache) {
      return;
    }

    setDimensionsLoading(true);
    
    try {
      const response = await apiClient.post<AvailableDimensionsResponse>(
        `/api/admin/analytics/charts/${chartDefinitionId}/dimensions`,
        {
          runtimeFilters: runtimeFilters || {},
        }
      );
      
      const dimensions = response.dimensions || [];
      
      // Cache the result
      dimensionCache.set(cacheKey, dimensions);
      lastFetchKey.current = cacheKey;
      
      setAvailableDimensions(dimensions);
    } catch (_error) {
      // Silently fail - dimensions are optional feature
      setAvailableDimensions([]);
      lastFetchKey.current = cacheKey;
    } finally {
      setDimensionsLoading(false);
    }
  }, [chartDefinitionId, cacheKey, runtimeFilters]);

  // Auto-fetch dimensions when modal opens
  useEffect(() => {
    if (isOpen && chartDefinitionId && !expandedData) {
      // Only fetch if we don't have cached data for this key
      if (lastFetchKey.current !== cacheKey) {
        fetchAvailableDimensions();
      }
    }
  }, [isOpen, chartDefinitionId, expandedData, cacheKey, fetchAvailableDimensions]);

  /**
   * Select dimensions and fetch expanded data
   */
  const selectDimensions = useCallback(
    async (dimensions: ExpansionDimension[]) => {
      if (dimensions.length === 0) {
        // Clear selection and collapse
        setExpandedData(null);
        setSelectedDimensionColumns([]);
        return;
      }

      setLoading(true);
      clearError();

      const uniqueColumns = Array.from(new Set(dimensions.map((d) => d.columnName))).filter(
        Boolean
      );
      setSelectedDimensionColumns(uniqueColumns);

      try {
        if (!chartDefinitionId || !finalChartConfig || !runtimeFilters) {
          throw new Error('Dimension expansion requires chart metadata and filters.');
        }

        const response = await apiClient.post<MultiDimensionExpandedChartData>(
          `/api/admin/analytics/charts/${chartDefinitionId}/expand`,
          {
            finalChartConfig,
            runtimeFilters,
            dimensionColumns: uniqueColumns,
            limit: CHARTS_PER_PAGE,
            offset: 0,
          }
        );

        setExpandedData(response);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to expand chart by selected dimensions.';
        setError(message);
        dimensionLogger.error('Dimension expansion failed', err, {
          chartDefinitionId,
          dimensionCount: dimensions.length,
        });
      } finally {
        setLoading(false);
      }
    },
    [chartDefinitionId, finalChartConfig, runtimeFilters, clearError]
  );

  /**
   * Select dimensions by column names (for checkbox toggle)
   */
  const selectDimensionsByColumns = useCallback(
    async (columnNames: string[]) => {
      const dimensions = availableDimensions.filter((d) => columnNames.includes(d.columnName));
      await selectDimensions(dimensions);
    },
    [availableDimensions, selectDimensions]
  );

  /**
   * Toggle a single dimension on/off
   */
  const toggleDimension = useCallback(
    async (columnName: string) => {
      const isSelected = selectedDimensionColumns.includes(columnName);
      let newColumns: string[];
      
      if (isSelected) {
        // Remove from selection
        newColumns = selectedDimensionColumns.filter((c) => c !== columnName);
      } else {
        // Add to selection
        newColumns = [...selectedDimensionColumns, columnName];
      }
      
      await selectDimensionsByColumns(newColumns);
    },
    [selectedDimensionColumns, selectDimensionsByColumns]
  );

  /**
   * @deprecated Use selectDimensions directly
   */
  const expandByDimension = useCallback(() => {
    if (!canExpand) {
      setError('Dimension expansion requires a rendered chart context.');
      return;
    }

    // Auto-select first dimension if only one available
    if (availableDimensions.length === 1 && !expandedData) {
      const firstDimension = availableDimensions[0];
      if (firstDimension) {
        void selectDimensions([firstDimension]);
      }
    }
    // If multiple dimensions, caller should use selectDimensions directly
  }, [availableDimensions, expandedData, canExpand, selectDimensions]);

  /**
   * Collapse back to single chart view
   */
  const collapse = useCallback(() => {
    setExpandedData(null);
    setSelectedDimensionColumns([]);
    clearError();
  }, [clearError]);

  /**
   * Refresh available dimensions (bypass cache)
   */
  const refreshDimensions = useCallback(async () => {
    await fetchAvailableDimensions(true);
  }, [fetchAvailableDimensions]);

  /**
   * Compute hasMore from expanded data metadata
   */
  const hasMore = expandedData?.metadata?.hasMore ?? false;

  /**
   * Load more charts from server (pagination)
   * Fetches next batch and appends to existing charts
   */
  const loadMore = useCallback(async () => {
    if (!expandedData || !hasMore || loadingMore) return;
    if (!chartDefinitionId || !finalChartConfig || !runtimeFilters) return;

    setLoadingMore(true);
    clearError();

    try {
      // Calculate next offset
      const currentOffset = expandedData.metadata.offset ?? 0;
      const currentLimit = expandedData.metadata.limit ?? CHARTS_PER_PAGE;
      const nextOffset = currentOffset + currentLimit;

      const response = await apiClient.post<MultiDimensionExpandedChartData>(
        `/api/admin/analytics/charts/${chartDefinitionId}/expand`,
        {
          finalChartConfig,
          runtimeFilters,
          dimensionColumns: selectedDimensionColumns,
          limit: currentLimit,
          offset: nextOffset,
        }
      );

      // Merge new charts with existing, removing duplicates
      const existingChartKeys = new Set(
        expandedData.charts.map((c) => JSON.stringify(c.dimensionValue.values))
      );
      const newCharts = response.charts.filter(
        (c) => !existingChartKeys.has(JSON.stringify(c.dimensionValue.values))
      );

      setExpandedData({
        ...expandedData,
        charts: [...expandedData.charts, ...newCharts],
        metadata: {
          ...expandedData.metadata,
          ...response.metadata,
          totalCharts: expandedData.charts.length + newCharts.length,
        },
      });

      dimensionLogger.log('Loaded more dimension charts', {
        newCharts: newCharts.length,
        totalCharts: expandedData.charts.length + newCharts.length,
        hasMore: response.metadata.hasMore,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load more charts.';
      setError(message);
      dimensionLogger.error('Load more failed', err, {
        chartDefinitionId,
        offset: expandedData.metadata.offset,
      });
    } finally {
      setLoadingMore(false);
    }
  }, [
    expandedData,
    hasMore,
    loadingMore,
    chartDefinitionId,
    finalChartConfig,
    runtimeFilters,
    selectedDimensionColumns,
    clearError,
  ]);

  return {
    // Deprecated modal props (kept for backward compatibility)
    showSelector: false,
    setShowSelector: () => {}, // No-op - modal removed
    // Active state
    availableDimensions,
    expandedData,
    loading,
    dimensionsLoading,
    loadingMore,
    hasMore,
    error,
    clearError,
    selectedDimensionColumns,
    canExpand,
    expandByDimension,
    selectDimensions,
    selectDimensionsByColumns,
    toggleDimension,
    collapse,
    refreshDimensions,
    loadMore,
  };
}
