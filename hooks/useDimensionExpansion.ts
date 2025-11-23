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
  DimensionExpandedChartData,
  MultiDimensionExpandedChartData,
  ExpansionDimension,
} from '@/lib/types/dimensions';
import { MAX_PARALLEL_DIMENSION_CHARTS } from '@/lib/constants/dimension-expansion';

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
  availableDimensions: ExpansionDimension[];
  expandedData: DimensionExpandedChartData | MultiDimensionExpandedChartData | null;
  loading: boolean;
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
  const [expandedData, setExpandedData] = useState<
    DimensionExpandedChartData | MultiDimensionExpandedChartData | null
  >(null);
  const [loading, setLoading] = useState(false);

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
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectDimensions is stable
  const expandByDimension = useCallback(() => {
    if (availableDimensions.length === 1) {
      // Auto-expand if only one dimension
      const firstDimension = availableDimensions[0];
      if (firstDimension) {
        selectDimensions([firstDimension]);
      }
    } else {
      setShowSelector(true);
    }
  }, [availableDimensions]);

  /**
   * Select dimensions and fetch expanded data
   *
   * Supports both single-dimension and multi-dimension expansion.
   * API automatically detects based on array length.
   *
   * @param dimensions - Selected dimensions to expand by
   */
  const selectDimensions = useCallback(
    async (dimensions: ExpansionDimension[]) => {
      setShowSelector(false);
      setLoading(true);

      try {
        if (!finalChartConfig || !runtimeFilters) {
          throw new Error('finalChartConfig and runtimeFilters are required for dimension expansion');
        }

        // Single dimension - use original API format for backward compatibility
        if (dimensions.length === 1) {
          const dimension = dimensions[0];
          if (!dimension) {
            throw new Error('Invalid dimension selection');
          }

          const response = await apiClient.post<DimensionExpandedChartData>(
            `/api/admin/analytics/charts/${chartDefinitionId}/expand`,
            {
              finalChartConfig,
              runtimeFilters,
              dimensionColumn: dimension.columnName,
              limit: MAX_PARALLEL_DIMENSION_CHARTS,
            }
          );
          setExpandedData(response);
        } else {
          // Multiple dimensions - use new multi-dimension API format
          const response = await apiClient.post<MultiDimensionExpandedChartData>(
            `/api/admin/analytics/charts/${chartDefinitionId}/expand`,
            {
              finalChartConfig,
              runtimeFilters,
              dimensionColumns: dimensions.map((d) => d.columnName),
              limit: MAX_PARALLEL_DIMENSION_CHARTS,
            }
          );
          setExpandedData(response);
        }
      } catch (error) {
        console.error('Failed to expand by dimensions:', error);
      } finally {
        setLoading(false);
      }
    },
    [chartDefinitionId, finalChartConfig, runtimeFilters]
  );

  /**
   * Collapse back to single chart view
   */
  const collapse = useCallback(() => {
    setExpandedData(null);
    setShowSelector(false);
  }, []);

  return {
    showSelector,
    availableDimensions,
    expandedData,
    loading,
    expandByDimension,
    selectDimensions,
    collapse,
  };
}
