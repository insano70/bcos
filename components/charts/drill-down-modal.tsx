'use client';

/**
 * DrillDownModal Component
 *
 * Modal that displays a target chart when user executes a navigate drill-down.
 * Shows breadcrumb navigation and filter badge from source chart.
 *
 * Features:
 * - Breadcrumb showing source → target navigation
 * - Filter badge when drilling down with filter applied
 * - Full chart rendering with BatchChartRenderer
 * - Escape key and click-outside to close
 *
 * Single Responsibility: Modal shell for drill-down navigation
 *
 * @module components/charts/drill-down-modal
 */

import { useCallback, useEffect, useId, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, Filter } from 'lucide-react';
import type { DrillDownModalProps } from '@/lib/types/drill-down';
import { apiClient } from '@/lib/api/client';
import { orchestrationResultToBatchChartData } from '@/lib/services/dashboard-rendering/mappers';
import type { BatchChartData } from '@/lib/services/dashboard-rendering/mappers';
import BatchChartRenderer from './batch-chart-renderer';

/**
 * Response type for chart definition fetch
 */
interface ChartDefinitionResponse {
  chart: {
    chart_definition_id: string;
    chart_name: string;
    chart_type: string;
    chart_config?: Record<string, unknown>;
    data_source?: {
      id?: number;
    };
  };
}

/**
 * Response type for universal chart data
 * Using types from chart-data-orchestrator for compatibility
 */
import type { OrchestrationResult } from '@/lib/services/chart-data-orchestrator';

type UniversalChartDataResponse = OrchestrationResult;

/**
 * DrillDownModal Component
 */
export function DrillDownModal({
  isOpen,
  onClose,
  sourceChartName,
  targetChartId,
  appliedFilters,
}: DrillDownModalProps) {
  const modalTitleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [targetChartName, setTargetChartName] = useState<string>('Loading...');
  const [targetChartType, setTargetChartType] = useState<string>('');
  const [targetChartConfig, setTargetChartConfig] = useState<Record<string, unknown>>({});
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<BatchChartData | null>(null);

  // Mount handling for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Fetch target chart definition and data
  useEffect(() => {
    if (!isOpen || !targetChartId) return;

    const fetchChartAndData = async () => {
      setChartLoading(true);
      setChartError(null);
      setChartData(null);

      try {
        // Step 1: Fetch chart definition
        const defResponse = await apiClient.get<ChartDefinitionResponse>(
          `/api/admin/analytics/charts/${targetChartId}`
        );
        const chartDef = defResponse.chart;
        setTargetChartName(chartDef.chart_name);
        setTargetChartType(chartDef.chart_type);
        setTargetChartConfig(chartDef.chart_config ?? {});

        // Step 2: Fetch chart data with applied filters (supports multi-series)
        // Extract measure/frequency from target chart config (required for measure-based data sources)
        const measure = chartDef.chart_config?.measure;
        const frequency = chartDef.chart_config?.frequency;
        
        const runtimeFilters: Record<string, unknown> = {};
        if (appliedFilters && appliedFilters.length > 0) {
          // Apply the drill-down filters as advanced filters
          runtimeFilters.advancedFilters = appliedFilters.map((f) => ({
            field: f.field,
            operator: 'eq',
            value: f.value,
          }));
        }
        // Include measure and frequency if present (required for measure-based data sources)
        if (typeof measure === 'string') {
          runtimeFilters.measure = measure;
        }
        if (typeof frequency === 'string') {
          runtimeFilters.frequency = frequency;
        }

        const dataResponse = await apiClient.post<UniversalChartDataResponse>(
          '/api/admin/analytics/chart-data/universal',
          {
            chartDefinitionId: targetChartId,
            runtimeFilters: Object.keys(runtimeFilters).length > 0 ? runtimeFilters : undefined,
          }
        );

        // Convert to BatchChartData format
        // Build config object with only defined properties (exactOptionalPropertyTypes compliance)
        const groupBy = chartDef.chart_config?.groupBy;
        
        const chartConfigData: {
          measure?: string;
          frequency?: string;
          groupBy?: string;
          finalChartConfig?: Record<string, unknown>;
          runtimeFilters?: Record<string, unknown>;
        } = {};
        
        if (typeof measure === 'string') chartConfigData.measure = measure;
        if (typeof frequency === 'string') chartConfigData.frequency = frequency;
        if (typeof groupBy === 'string') chartConfigData.groupBy = groupBy;
        if (chartDef.chart_config) chartConfigData.finalChartConfig = chartDef.chart_config;
        if (Object.keys(runtimeFilters).length > 0) chartConfigData.runtimeFilters = runtimeFilters;
        
        const batchData = orchestrationResultToBatchChartData(
          {
            chartData: dataResponse.chartData,
            rawData: dataResponse.rawData,
            // Only include columns/formattedData if present (exactOptionalPropertyTypes compliance)
            ...(dataResponse.columns && { columns: dataResponse.columns }),
            ...(dataResponse.formattedData && { formattedData: dataResponse.formattedData }),
            metadata: dataResponse.metadata,
          },
          chartConfigData
        );

        setChartData(batchData);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load chart';
        setChartError(message);
        setTargetChartName('Unknown Chart');
      } finally {
        setChartLoading(false);
      }
    };

    void fetchChartAndData();
  }, [isOpen, targetChartId, appliedFilters]);

  // Handle escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Focus close button on open
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [isOpen]);

  // Handle overlay click
  const handleOverlayClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Don't render if not open or not mounted
  if (!isOpen || !mounted) {
    return null;
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalTitleId}
    >
      <div
        className="relative w-[95vw] max-w-6xl h-[90vh] bg-white dark:bg-gray-900 rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-sm min-w-0">
              <span
                className="text-gray-500 dark:text-gray-400 truncate max-w-[200px]"
                title={sourceChartName}
              >
                {sourceChartName}
              </span>
              <ChevronRight
                className="w-4 h-4 text-gray-400 flex-shrink-0"
                aria-hidden="true"
              />
              <span
                id={modalTitleId}
                className="font-medium text-gray-900 dark:text-white truncate max-w-[300px]"
                title={targetChartName}
              >
                {targetChartName}
              </span>
            </nav>

            {/* Filter badges (supports multiple filters for multi-series) */}
            {appliedFilters && appliedFilters.length > 0 && (
              <div className="flex items-center gap-1 ml-2 flex-shrink-0 flex-wrap">
                <Filter className="w-3 h-3 text-violet-600 dark:text-violet-400" aria-hidden="true" />
                {appliedFilters.map((filter, index) => (
                  <span
                    key={`${filter.field}-${index}`}
                    className="px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/30 rounded-full truncate max-w-[120px]"
                  >
                    {filter.field} = {String(filter.value)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 p-4 overflow-auto">
          {chartLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Loading chart...
                </p>
              </div>
            </div>
          )}

          {chartError && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-600 dark:text-red-400 mb-2">{chartError}</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {!chartLoading && !chartError && chartData && (
            <div className="h-full flex flex-col min-h-[400px]">
              <BatchChartRenderer
                chartData={chartData}
                chartDefinition={{
                  chart_definition_id: targetChartId,
                  chart_name: targetChartName,
                  chart_type: targetChartType,
                  chart_config: targetChartConfig,
                  // Disable drill-down in modal to prevent nested drill-downs
                  drill_down_enabled: false,
                }}
                position={{ x: 0, y: 0, w: 12, h: 8 }}
                hideHeader={true}
                responsive={true}
                minHeight={350}
                maxHeight={600}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default DrillDownModal;

