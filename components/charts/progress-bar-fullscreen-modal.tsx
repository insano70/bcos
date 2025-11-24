'use client';

/**
 * Progress Bar Fullscreen Modal
 *
 * Displays progress bar charts in fullscreen with dimension expansion support.
 * Follows same pattern as ChartFullscreenModal but adapted for progress bars.
 */

import { useState, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import AnalyticsProgressBarChart from './analytics-progress-bar-chart';
import { useDimensionExpansion } from '@/hooks/useDimensionExpansion';
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
  finalChartConfig,
  runtimeFilters,
}: ProgressBarFullscreenModalProps) {
  const [mounted, setMounted] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const dimension = useDimensionExpansion({
    chartDefinitionId,
    finalChartConfig,
    runtimeFilters,
    isOpen,
  });

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
            {dimension.availableDimensions.length > 0 && dimension.canExpand && (
              <button
                type="button"
                onClick={dimension.expandByDimension}
                disabled={dimension.loading || !dimension.canExpand}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors disabled:opacity-50 ${
                  dimension.expandedData
                    ? 'bg-violet-600 text-white hover:bg-violet-700'
                    : 'bg-violet-100 dark:bg-violet-900 hover:bg-violet-200 dark:hover:bg-violet-800 text-violet-700 dark:text-violet-200'
                }`}
                aria-label="Expand by dimension"
              >
                {dimension.loading
                  ? 'Loading...'
                  : dimension.expandedData
                    ? 'Dimensions'
                    : 'Expand by Dimension'}
              </button>
            )}
            {/* Collapse button when viewing dimension expansion */}
            {dimension.expandedData && (
              <button
                type="button"
                onClick={dimension.collapse}
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
          {dimension.showSelector && (
            <div className="h-full flex items-center justify-center p-8">
              <DimensionSelector
                availableDimensions={dimension.availableDimensions}
                onSelect={dimension.selectDimensions}
                onCancel={() => dimension.setShowSelector(false)}
                initialSelectedColumns={dimension.selectedDimensionColumns}
              />
            </div>
          )}

          {dimension.error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
              {dimension.error}
            </div>
          )}

          {/* Show dimension comparison view if expanded */}
          {dimension.expandedData?.dimensions && !dimension.showSelector && (
            <DimensionComparisonView
              dimensions={dimension.expandedData.dimensions}
              chartDefinition={{
                chart_definition_id: chartDefinitionId || '',
                chart_name: chartTitle,
                chart_type: 'progress-bar',
              }}
              dimensionCharts={dimension.expandedData.charts}
              position={{ x: 0, y: 0, w: 12, h: 6 }}
              availableDimensions={dimension.availableDimensions}
              selectedDimensionColumns={dimension.selectedDimensionColumns}
              onApplyDimensions={dimension.selectDimensions}
              isApplying={dimension.loading}
            />
          )}

          {/* Show normal progress bar if not in dimension mode */}
          {!dimension.showSelector && !dimension.expandedData && (
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

