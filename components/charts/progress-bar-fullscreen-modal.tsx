'use client';

/**
 * Progress Bar Fullscreen Modal
 *
 * Displays progress bar charts in fullscreen with dimension expansion support.
 * Follows same pattern as ChartFullscreenModal but adapted for progress bars.
 */

import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import AnalyticsProgressBarChart from './analytics-progress-bar-chart';
import { apiClient } from '@/lib/api/client';
import type { AvailableDimensionsResponse, DimensionExpandedChartData, ExpansionDimension } from '@/lib/types/dimensions';
import DimensionSelector from './dimension-selector';
import DimensionComparisonView from './dimension-comparison-view';

interface ProgressBarFullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartTitle: string;
  data: Array<{ label: string; value: number; percentage: number }>;
  colorPalette?: string;
  measureType?: string;
  chartDefinitionId?: string;
  currentFilters?: Record<string, unknown>;
  // For dimension expansion: configs from batch API (already correct!)
  finalChartConfig?: Record<string, unknown>;
  runtimeFilters?: Record<string, unknown>;
}

export default function ProgressBarFullscreenModal({
  isOpen,
  onClose,
  chartTitle,
  data,
  colorPalette = 'default',
  measureType = 'number',
  chartDefinitionId,
  currentFilters = {},
  finalChartConfig,
  runtimeFilters,
}: ProgressBarFullscreenModalProps) {
  const [mounted, setMounted] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Dimension expansion state
  const [showDimensionSelector, setShowDimensionSelector] = useState(false);
  const [availableDimensions, setAvailableDimensions] = useState<ExpansionDimension[]>([]);
  const [expandedData, setExpandedData] = useState<DimensionExpandedChartData | null>(null);
  const [dimensionLoading, setDimensionLoading] = useState(false);

  // Handle client-side mounting for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // Fetch available dimensions when modal opens
  useEffect(() => {
    if (isOpen && chartDefinitionId && !expandedData) {
      fetchAvailableDimensions();
    }
  }, [isOpen, chartDefinitionId]);

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

  const handleExpandByDimension = useCallback(() => {
    if (availableDimensions.length === 1) {
      // Auto-expand if only one dimension
      handleDimensionSelect(availableDimensions[0]!);
    } else {
      setShowDimensionSelector(true);
    }
  }, [availableDimensions]);

  const handleDimensionSelect = useCallback(async (dimension: ExpansionDimension) => {
    setShowDimensionSelector(false);
    setDimensionLoading(true);

    try {
      // SIMPLE: Just reuse the configs that rendered the base chart!
      if (finalChartConfig && runtimeFilters) {
        // No reconstruction - just pass what was used to render the base chart
        const response = await apiClient.post<DimensionExpandedChartData>(
          `/api/admin/analytics/charts/${chartDefinitionId}/expand`,
          {
            finalChartConfig,      // Already has seriesConfigs, dualAxisConfig, groupBy, colorPalette, EVERYTHING!
            runtimeFilters,        // Already has resolved dates, practices, all filters!
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
      setDimensionLoading(false);
    }
  }, [chartDefinitionId, finalChartConfig, runtimeFilters, currentFilters]);

  const handleCollapseDimension = useCallback(() => {
    setExpandedData(null);
    setShowDimensionSelector(false);
  }, []);

  // Handle clicks outside modal
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen || !mounted) {
    return null;
  }

  const modalContent = (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 sm:p-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="relative bg-white dark:bg-gray-900 rounded-lg w-full h-full sm:h-[90vh] sm:max-w-6xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {chartTitle}
          </h2>
          <div className="flex items-center gap-2">
            {/* Expand by Dimension button */}
            {availableDimensions.length > 0 && !expandedData && !showDimensionSelector && (
              <button
                type="button"
                onClick={handleExpandByDimension}
                disabled={dimensionLoading}
                className="px-3 py-1.5 text-sm bg-violet-100 dark:bg-violet-900 hover:bg-violet-200 dark:hover:bg-violet-800 text-violet-700 dark:text-violet-200 rounded-md transition-colors disabled:opacity-50"
                aria-label="Expand by dimension"
              >
                {dimensionLoading ? 'Loading...' : 'Expand by Dimension'}
              </button>
            )}
            {/* Collapse button when viewing dimension expansion */}
            {expandedData && (
              <button
                type="button"
                onClick={handleCollapseDimension}
                className="px-3 py-1.5 text-sm bg-violet-100 dark:bg-violet-900 hover:bg-violet-200 dark:hover:bg-violet-800 text-violet-700 dark:text-violet-200 rounded-md transition-colors"
                aria-label="Collapse to single chart"
              >
                Collapse
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Close fullscreen view"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {/* Show dimension selector if requested */}
          {showDimensionSelector && (
            <div className="h-full flex items-center justify-center p-8">
              <DimensionSelector
                availableDimensions={availableDimensions}
                onSelect={handleDimensionSelect}
                onCancel={() => setShowDimensionSelector(false)}
              />
            </div>
          )}

          {/* Show dimension comparison view if expanded */}
          {expandedData && !showDimensionSelector && (
            <DimensionComparisonView
              dimension={expandedData.dimension}
              chartDefinition={{
                chart_definition_id: chartDefinitionId || '',
                chart_name: chartTitle,
                chart_type: 'progress-bar',
              }}
              dimensionCharts={expandedData.charts}
              position={{ x: 0, y: 0, w: 12, h: 6 }}
            />
          )}

          {/* Show normal progress bar if not in dimension mode */}
          {!showDimensionSelector && !expandedData && (
            <div className="w-full h-full overflow-y-auto p-6">
              <AnalyticsProgressBarChart
                data={data}
                colorPalette={colorPalette}
                measureType={measureType}
                height={window.innerHeight * 0.75}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

