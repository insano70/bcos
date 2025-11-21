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
  ExpansionDimension,
} from '@/lib/types/dimensions';

/**
 * Current filters for dimension expansion
 */
interface CurrentFilters {
  startDate?: string | null;
  endDate?: string | null;
  organizationId?: string | null;
  practiceUids?: number[];
  providerName?: string | null;
}

/**
 * Parameters for useDimensionExpansion hook
 */
interface UseDimensionExpansionParams {
  chartDefinitionId?: string | undefined;
  finalChartConfig?: Record<string, unknown> | undefined;
  runtimeFilters?: Record<string, unknown> | undefined;
  currentFilters?: CurrentFilters | undefined;
  isOpen: boolean;
}

/**
 * Return value from useDimensionExpansion hook
 */
export interface DimensionExpansionState {
  showSelector: boolean;
  availableDimensions: ExpansionDimension[];
  expandedData: DimensionExpandedChartData | null;
  loading: boolean;
  expandByDimension: () => void;
  selectDimension: (dimension: ExpansionDimension) => Promise<void>;
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
  const { chartDefinitionId, finalChartConfig, runtimeFilters, currentFilters, isOpen } = params;

  const [showSelector, setShowSelector] = useState(false);
  const [availableDimensions, setAvailableDimensions] = useState<ExpansionDimension[]>([]);
  const [expandedData, setExpandedData] = useState<DimensionExpandedChartData | null>(null);
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
      const response = await apiClient.get<AvailableDimensionsResponse>(
        `/api/admin/analytics/charts/${chartDefinitionId}/dimensions`
      );
      setAvailableDimensions(response.dimensions || []);
    } catch (_error) {
      // Silently fail - dimensions are optional feature
      setAvailableDimensions([]);
    }
  }, [chartDefinitionId]);

  /**
   * Initiate dimension expansion
   * Auto-expands if only one dimension, otherwise shows selector
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectDimension is stable
  const expandByDimension = useCallback(() => {
    if (availableDimensions.length === 1) {
      // Auto-expand if only one dimension
      const firstDimension = availableDimensions[0];
      if (firstDimension) {
        selectDimension(firstDimension);
      }
    } else {
      setShowSelector(true);
    }
  }, [availableDimensions]);

  /**
   * Select a specific dimension and fetch expanded data
   *
   * @param dimension - Selected dimension to expand by
   */
  const selectDimension = useCallback(
    async (dimension: ExpansionDimension) => {
      setShowSelector(false);
      setLoading(true);

      try {
        // SIMPLE: Just reuse the configs that rendered the base chart!
        if (finalChartConfig && runtimeFilters) {
          // No reconstruction - just pass what was used to render the base chart
          const response = await apiClient.post<DimensionExpandedChartData>(
            `/api/admin/analytics/charts/${chartDefinitionId}/expand`,
            {
              finalChartConfig, // Already has seriesConfigs, dualAxisConfig, groupBy, colorPalette, EVERYTHING!
              runtimeFilters, // Already has resolved dates, practices, all filters!
              dimensionColumn: dimension.columnName,
              limit: 20,
            }
          );
          setExpandedData(response);
        } else {
          // FALLBACK: Legacy path (fetch metadata)
          const response = await apiClient.post<DimensionExpandedChartData>(
            `/api/admin/analytics/charts/${chartDefinitionId}/expand`,
            {
              dimensionColumn: dimension.columnName,
              baseFilters: currentFilters,
              limit: 20,
            }
          );
          setExpandedData(response);
        }
      } catch (error) {
        console.error('Failed to expand by dimension:', error);
      } finally {
        setLoading(false);
      }
    },
    [chartDefinitionId, finalChartConfig, runtimeFilters, currentFilters]
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
    selectDimension,
    collapse,
  };
}
