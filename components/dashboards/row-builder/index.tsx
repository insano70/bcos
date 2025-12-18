'use client';

import { useState } from 'react';
import DashboardPreviewModal from '@/components/dashboard-preview-modal';
import { ErrorDisplay } from '@/components/error-display';
import Toast from '@/components/toast';
import { Spinner } from '@/components/ui/spinner';
import type { ChartDefinition } from '@/lib/types/analytics';
import DashboardActions from './components/dashboard-actions';
// Components
import DashboardHeader from './components/dashboard-header';
import FilterConfigPanel from './components/filter-config-panel';
import RowControls from './components/row-controls';
import { useAvailableCharts } from './hooks/use-available-charts';
import { useDashboardOperations } from './hooks/use-dashboard-operations';
// Hooks
import { useDashboardState } from './hooks/use-dashboard-state';
import { useFilterConfig } from './hooks/use-filter-config';

/**
 * Row-Based Dashboard Builder
 *
 * Refactored from components/charts/row-based-dashboard-builder.tsx
 *
 * This is the main orchestration component that composes hooks and child components
 * to provide a modular, testable dashboard builder interface.
 *
 * Architecture:
 * - Hooks: State management and business logic
 * - Components: Presentational UI components
 * - Utils: Pure functions for conversion and validation
 */

interface DashboardChartAssoc {
  dashboard_chart_id: string;
  chart_definition_id: string;
  position_config?: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  };
}

interface EditingDashboard {
  dashboard_id?: string;
  dashboard_name?: string;
  dashboard_description?: string;
  is_published?: boolean;
  charts?: DashboardChartAssoc[];
  layout_config?: Record<string, unknown>;
}

export interface RowBasedDashboardBuilderProps {
  editingDashboard?: EditingDashboard;
  onCancel?: () => void;
  onSaveSuccess?: () => void;
}

/**
 * Main dashboard builder component (orchestrator)
 *
 * Composes all hooks and child components to create the complete
 * dashboard builder interface.
 */
export default function RowBasedDashboardBuilder({
  editingDashboard,
  onCancel,
  onSaveSuccess,
}: RowBasedDashboardBuilderProps) {
  // Preview modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // Load available charts
  const { availableCharts, isLoading, error, reload } = useAvailableCharts();

  // Dashboard state management
  const {
    dashboardConfig,
    isEditMode,
    updateConfig,
    addRow,
    updateRow,
    deleteRow,
    moveRowUp,
    moveRowDown,
  } = useDashboardState(editingDashboard, availableCharts);

  // Filter configuration state
  const { filterConfig, setFilterConfig } = useFilterConfig(editingDashboard);

  // Save/update operations
  const { saveDashboard, isSaving, toast, setToast } = useDashboardOperations({
    dashboardConfig,
    filterConfig,
    editingDashboard,
    onSaveSuccess,
  });

  // Show loading state while charts are loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Spinner size="md" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading charts...</span>
      </div>
    );
  }

  // Show error state if charts failed to load
  if (error) {
    return (
      <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
        <ErrorDisplay
          variant="inline"
          error={error.message}
          title="Charts"
          onRetry={() => reload()}
        />
      </div>
    );
  }

  // Calculate if dashboard is valid for save/preview
  const isDisabled = !dashboardConfig.dashboardName.trim() || dashboardConfig.rows.length === 0;

  return (
    <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      {/* Header with metadata inputs */}
      <DashboardHeader
        config={dashboardConfig}
        onUpdateConfig={updateConfig}
        isEditMode={isEditMode}
        onCancel={onCancel}
      />

      <div className="p-6">
        {/* Filter Configuration Panel */}
        <FilterConfigPanel config={filterConfig} onChange={setFilterConfig} />

        {/* Row Controls - list of rows with DashboardRowBuilder */}
        <RowControls
          rows={dashboardConfig.rows}
          availableCharts={availableCharts}
          onAddRow={addRow}
          onUpdateRow={updateRow}
          onDeleteRow={deleteRow}
          onMoveRowUp={moveRowUp}
          onMoveRowDown={moveRowDown}
        />

        {/* Action Buttons - preview and save */}
        <DashboardActions
          isSaving={isSaving}
          isEditMode={isEditMode}
          isDisabled={isDisabled}
          onSave={saveDashboard}
          onPreview={() => setPreviewModalOpen(true)}
        />
      </div>

      {/* Dashboard Preview Modal */}
      <DashboardPreviewModal
        isOpen={previewModalOpen}
        setIsOpen={setPreviewModalOpen}
        filterConfig={filterConfig}
        dashboardConfig={{
          dashboardName: dashboardConfig.dashboardName,
          dashboardDescription: dashboardConfig.dashboardDescription,
          charts: dashboardConfig.rows.flatMap((row, rowIndex) =>
            row.charts
              .filter(
                (chart): chart is typeof chart & { chartDefinitionId: string; chartDefinition: ChartDefinition } =>
                  !!chart.chartDefinitionId && !!chart.chartDefinition
              )
              .map((chart, chartIndex) => ({
                id: chart.id,
                chartDefinitionId: chart.chartDefinitionId,
                position: {
                  x: chartIndex * 2,
                  y: rowIndex,
                  w: Math.round((chart.widthPercentage / 100) * 12),
                  h: Math.round(row.heightPx / 150),
                },
                ...(chart.chartDefinition ? { chartDefinition: chart.chartDefinition } : {}),
              }))
          ),
          layout: {
            columns: 12,
            rowHeight: 150,
            margin: 10,
          },
        }}
        title={`Preview: ${dashboardConfig.dashboardName || 'Unnamed Dashboard'}`}
      />

      {/* Toast Notifications */}
      <Toast
        type={toast.type}
        open={toast.show}
        setOpen={(open) => setToast({ ...toast, show: open })}
      >
        {toast.message}
      </Toast>
    </div>
  );
}
