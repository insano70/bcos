/**
 * useDimensionExpansion Hook
 *
 * Manages dimension expansion feature for charts:
 * - Fetch available dimensions for a chart
 * - Handle dimension selection and expansion API calls
 * - Manage loading states and expanded data
 * - Handle collapse back to single chart
 *
 * Single Responsibility: Dimension expansion state and API calls
 */

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import type {
  AvailableDimensionsResponse,
  MultiDimensionExpandedChartData,
  ExpansionDimension,
} from '@/lib/types/dimensions';
import { MAX_PARALLEL_DIMENSION_CHARTS } from '@/lib/constants/dimension-expansion';
import { createClientLogger } from '@/lib/utils/client-logger';

const dimensionLogger = createClientLogger('DimensionExpansion');

/**
 * Parameters for useDimensionExpansion hook
 */
interface UseDimensionExpansionParams {
  chartDefinitionId?: string | undefined;
  finalChartConfig?: Record<string, unknown> | undefined;
  runtimeFilters?: Record<string, unknown> | undefined;
  isOpen: boolean;
}

/**
 * Return value from useDimensionExpansion hook
 */
export interface DimensionExpansionState {
  showSelector: boolean;
  setShowSelector: (show: boolean) => void;
  availableDimensions: ExpansionDimension[];
  expandedData: MultiDimensionExpandedChartData | null;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  selectedDimensionColumns: string[];
  canExpand: boolean;
  expandByDimension: () => void;
  selectDimensions: (dimensions: ExpansionDimension[]) => Promise<void>;
  collapse: () => void;
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

  const [showSelector, setShowSelector] = useState(false);
  const [availableDimensions, setAvailableDimensions] = useState<ExpansionDimension[]>([]);
  const [expandedData, setExpandedData] = useState<MultiDimensionExpandedChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDimensionColumns, setSelectedDimensionColumns] = useState<string[]>([]);
  const clearError = useCallback(() => setError(null), []);

  const canExpand =
    Boolean(chartDefinitionId) &&
    Boolean(finalChartConfig && Object.keys(finalChartConfig).length > 0) &&
    Boolean(runtimeFilters && Object.keys(runtimeFilters).length > 0);

  // Fetch available dimensions when modal opens
  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchAvailableDimensions is stable
  useEffect(() => {
    if (isOpen && chartDefinitionId && !expandedData) {
      fetchAvailableDimensions();
    }
  }, [isOpen, chartDefinitionId, expandedData]);

  /**
   * Fetch available dimensions for the chart
   */
  const fetchAvailableDimensions = useCallback(async () => {
    if (!chartDefinitionId) return;

    try {
      const response = await apiClient.post<AvailableDimensionsResponse>(
        `/api/admin/analytics/charts/${chartDefinitionId}/dimensions`,
        {
          runtimeFilters: runtimeFilters || {},
        }
      );
      setAvailableDimensions(response.dimensions || []);
    } catch (_error) {
      // Silently fail - dimensions are optional feature
      setAvailableDimensions([]);
    }
  }, [chartDefinitionId, runtimeFilters]);

  /**
   * Initiate dimension expansion
   * Auto-expands if only one dimension, otherwise shows selector
   */
  /**
   * Select dimensions and fetch expanded data
   *
   * Always uses multi-dimension expansion API for consistency.
   *
   * @param dimensions - Selected dimensions to expand by
   */
  const selectDimensions = useCallback(
    async (dimensions: ExpansionDimension[]) => {
      if (dimensions.length === 0) {
        setShowSelector(false);
        return;
      }

      setShowSelector(false);
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
            limit: MAX_PARALLEL_DIMENSION_CHARTS,
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

  const expandByDimension = useCallback(() => {
    if (!canExpand) {
      setError('Dimension expansion requires a rendered chart context.');
      return;
    }

    if (availableDimensions.length === 1 && !expandedData) {
      const firstDimension = availableDimensions[0];
      if (firstDimension) {
        void selectDimensions([firstDimension]);
      }
    } else {
      setShowSelector(true);
    }
  }, [availableDimensions, expandedData, canExpand, selectDimensions]);

  /**
   * Collapse back to single chart view
   */
  const collapse = useCallback(() => {
    setExpandedData(null);
    setShowSelector(false);
    setSelectedDimensionColumns([]);
    clearError();
  }, [clearError]);

  return {
    showSelector,
    setShowSelector,
    availableDimensions,
    expandedData,
    loading,
    error,
    clearError,
    selectedDimensionColumns,
    canExpand,
    expandByDimension,
    selectDimensions,
    collapse,
  };
}
