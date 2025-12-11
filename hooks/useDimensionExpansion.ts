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
 * - Phase 1: Value-level selection support (select specific values, not just dimensions)
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
  DimensionWithValues,
  DimensionValueSelection,
  DimensionValuesResponse,
} from '@/lib/types/dimensions';
import { CHARTS_PER_PAGE } from '@/lib/constants/dimension-expansion';
import { createClientLogger } from '@/lib/utils/client-logger';

const dimensionLogger = createClientLogger('DimensionExpansion');

/**
 * Generate a stable hash for filter objects
 * 
 * Uses a proper hash algorithm that considers ALL content, not truncated base64.
 * Keys are sorted for deterministic output regardless of object property order.
 * 
 * @param filters - Filter object to hash
 * @returns Stable hash string
 */
function hashFilters(filters: Record<string, unknown> | undefined): string {
  if (!filters) return 'no-filters';
  try {
    // Sort keys for deterministic ordering
    const sortedKeys = Object.keys(filters).sort();
    const normalized: Record<string, unknown> = {};
    
    for (const key of sortedKeys) {
      const value = filters[key];
      // Sort arrays for consistency (e.g., practiceUids)
      if (Array.isArray(value)) {
        normalized[key] = [...value].sort();
      } else {
        normalized[key] = value;
      }
    }
    
    const str = JSON.stringify(normalized);
    
    // Simple but effective hash (djb2 algorithm)
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    
    // Convert to base36 for shorter string, handle negative numbers
    return (hash >>> 0).toString(36);
  } catch {
    return 'hash-error';
  }
}

/**
 * Cache entry with timestamp for TTL support
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Cache TTL in milliseconds (5 minutes)
 * Short TTL ensures dimension counts refresh when filters change,
 * while still providing benefit for repeated opens of the same chart.
 */
const DIMENSION_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Global cache for dimension results to avoid redundant API calls
 * Key: `${chartDefinitionId}:${filterHash}`
 * 
 * Uses TTL to ensure stale data is not served when filters change.
 */
const dimensionCache = new Map<string, CacheEntry<ExpansionDimension[]>>();

/**
 * Global cache for dimension values
 * Key: `${chartDefinitionId}:${dimensionColumn}:${filterHash}`
 *
 * Uses TTL to ensure stale data is not served when filters change.
 */
const dimensionValuesCache = new Map<string, CacheEntry<DimensionValuesResponse>>();

/**
 * Clean up expired entries from a cache Map
 * Prevents memory leaks from accumulated stale entries
 */
function cleanupExpiredEntries<T>(cache: Map<string, CacheEntry<T>>): void {
  const now = Date.now();
  cache.forEach((entry, key) => {
    if (now - entry.timestamp > DIMENSION_CACHE_TTL_MS) {
      cache.delete(key);
    }
  });
}

/**
 * Last cleanup timestamp - used to throttle periodic cleanup
 */
let lastCleanupTime = 0;
const CLEANUP_INTERVAL_MS = 60 * 1000; // Run cleanup at most once per minute

/**
 * Throttled cleanup of all caches
 * Called on cache reads to prevent memory leaks
 */
function maybeCleanupCaches(): void {
  const now = Date.now();
  if (now - lastCleanupTime > CLEANUP_INTERVAL_MS) {
    lastCleanupTime = now;
    cleanupExpiredEntries(dimensionCache);
    cleanupExpiredEntries(dimensionValuesCache);
  }
}

/**
 * Get cached data if not expired
 *
 * @param cache - Cache Map to query
 * @param key - Cache key
 * @returns Cached data or null if expired/missing
 */
function getCachedWithTTL<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  // Periodically clean up expired entries to prevent memory leaks
  maybeCleanupCaches();

  const entry = cache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > DIMENSION_CACHE_TTL_MS) {
    // Expired - remove from cache
    cache.delete(key);
    return null;
  }

  return entry.data;
}

/**
 * Set cache data with timestamp
 * 
 * @param cache - Cache Map to update
 * @param key - Cache key
 * @param data - Data to cache
 */
function setCacheWithTTL<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Clear all dimension caches
 * 
 * Call this when critical filters change (e.g., organization, practice selection)
 * to ensure fresh data is fetched.
 * 
 * @example
 * // In dashboard when organization changes
 * useEffect(() => {
 *   clearDimensionCaches();
 * }, [organizationId]);
 */
export function clearDimensionCaches(): void {
  dimensionCache.clear();
  dimensionValuesCache.clear();
}

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
  
  // Phase 1: Value-level selection support
  /** Dimensions with their available values for value-level selection */
  dimensionsWithValues: DimensionWithValues[];
  /** Whether dimension values are being loaded */
  valuesLoading: boolean;
  /** Fetch values for a specific dimension */
  fetchDimensionValues: (columnName: string) => Promise<void>;
  /** Fetch values for all available dimensions */
  fetchAllDimensionValues: () => Promise<void>;
  /** Expand by specific value selections (Phase 1 value-level selection) */
  expandByValueSelections: (selections: DimensionValueSelection[]) => Promise<void>;
  /** Currently applied value selections */
  appliedValueSelections: DimensionValueSelection[];
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
  
  // Phase 1: Value-level selection state
  const [dimensionsWithValues, setDimensionsWithValues] = useState<DimensionWithValues[]>([]);
  const [valuesLoading, setValuesLoading] = useState(false);
  const [appliedValueSelections, setAppliedValueSelections] = useState<DimensionValueSelection[]>([]);
  
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

    // Check cache first (unless bypassing) - with TTL expiration
    if (!bypassCache) {
      const cached = getCachedWithTTL(dimensionCache, cacheKey);
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
      
      // Cache the result with TTL
      setCacheWithTTL(dimensionCache, cacheKey, dimensions);
      lastFetchKey.current = cacheKey;
      
      setAvailableDimensions(dimensions);
    } catch {
      // Silently fail - dimensions are optional feature
      // If fetching fails, show no dimensions but don't break the modal
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

  // ==========================================================================
  // Phase 1: Value-level selection methods
  // ==========================================================================

  /**
   * Fetch values for a specific dimension
   */
  const fetchDimensionValues = useCallback(async (columnName: string) => {
    if (!chartDefinitionId || !cacheKey) return;

    const dimension = availableDimensions.find(d => d.columnName === columnName);
    if (!dimension) return;

    // Check cache with TTL expiration
    const valuesCacheKey = `${cacheKey}:${columnName}`;
    const cached = getCachedWithTTL(dimensionValuesCache, valuesCacheKey);
    if (cached) {
      // Update dimensionsWithValues with cached data
      setDimensionsWithValues(prev => {
        const existing = prev.find(d => d.dimension.columnName === columnName);
        if (existing) {
          return prev.map(d => 
            d.dimension.columnName === columnName 
              ? { ...d, values: cached.values, isLoading: false }
              : d
          );
        }
        return [...prev, { dimension, values: cached.values, isLoading: false }];
      });
      return;
    }

    // Mark as loading
    setDimensionsWithValues(prev => {
      const existing = prev.find(d => d.dimension.columnName === columnName);
      if (existing) {
        return prev.map(d => {
          if (d.dimension.columnName === columnName) {
            // Create new object without error property (exactOptionalPropertyTypes compliance)
            const updated: DimensionWithValues = {
              dimension: d.dimension,
              values: d.values,
              isLoading: true,
            };
            return updated;
          }
          return d;
        });
      }
      return [...prev, { dimension, values: [], isLoading: true }];
    });

    try {
      const response = await apiClient.post<DimensionValuesResponse>(
        `/api/admin/analytics/charts/${chartDefinitionId}/dimensions/${columnName}/values`,
        { runtimeFilters: runtimeFilters || {} }
      );

      // Cache the result with TTL
      setCacheWithTTL(dimensionValuesCache, valuesCacheKey, response);

      // Update state
      setDimensionsWithValues(prev => 
        prev.map(d => 
          d.dimension.columnName === columnName 
            ? { ...d, values: response.values, isLoading: false }
            : d
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch dimension values';
      setDimensionsWithValues(prev => 
        prev.map(d => 
          d.dimension.columnName === columnName 
            ? { ...d, isLoading: false, error: message }
            : d
        )
      );
      dimensionLogger.error('Failed to fetch dimension values', err, { columnName });
    }
  }, [chartDefinitionId, cacheKey, runtimeFilters, availableDimensions]);

  /**
   * Fetch values for all available dimensions
   */
  const fetchAllDimensionValues = useCallback(async () => {
    if (availableDimensions.length === 0) return;

    setValuesLoading(true);

    // Initialize all dimensions as loading
    setDimensionsWithValues(
      availableDimensions.map(dimension => ({
        dimension,
        values: [],
        isLoading: true,
      }))
    );

    // Fetch all in parallel
    await Promise.all(
      availableDimensions.map(dim => fetchDimensionValues(dim.columnName))
    );

    setValuesLoading(false);
  }, [availableDimensions, fetchDimensionValues]);

  /**
   * Auto-fetch dimension values when dimensions are loaded
   */
  useEffect(() => {
    if (isOpen && availableDimensions.length > 0 && dimensionsWithValues.length === 0) {
      fetchAllDimensionValues();
    }
  }, [isOpen, availableDimensions, dimensionsWithValues.length, fetchAllDimensionValues]);

  /**
   * Expand by specific value selections (Phase 1)
   * 
   * Instead of expanding by all values of selected dimensions,
   * this method expands only by the specific values the user selected.
   */
  const expandByValueSelections = useCallback(
    async (selections: DimensionValueSelection[]) => {
      if (selections.length === 0) {
        // Clear selection and collapse
        setExpandedData(null);
        setSelectedDimensionColumns([]);
        setAppliedValueSelections([]);
        return;
      }

      setLoading(true);
      clearError();

      // Track selected columns
      const columns = selections.map(s => s.columnName);
      setSelectedDimensionColumns(columns);
      setAppliedValueSelections(selections);

      try {
        if (!chartDefinitionId || !finalChartConfig || !runtimeFilters) {
          throw new Error('Dimension expansion requires chart metadata and filters.');
        }

        // Use the new value-level expansion endpoint
        const response = await apiClient.post<MultiDimensionExpandedChartData>(
          `/api/admin/analytics/charts/${chartDefinitionId}/expand`,
          {
            finalChartConfig,
            runtimeFilters,
            // Pass value selections instead of just dimension columns
            selections,
            limit: CHARTS_PER_PAGE,
            offset: 0,
          }
        );

        setExpandedData(response);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to expand chart by selected values.';
        setError(message);
        dimensionLogger.error('Value-level expansion failed', err, {
          chartDefinitionId,
          selectionCount: selections.length,
        });
      } finally {
        setLoading(false);
      }
    },
    [chartDefinitionId, finalChartConfig, runtimeFilters, clearError]
  );

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
    // Phase 1: Value-level selection
    dimensionsWithValues,
    valuesLoading,
    fetchDimensionValues,
    fetchAllDimensionValues,
    expandByValueSelections,
    appliedValueSelections,
  };
}
