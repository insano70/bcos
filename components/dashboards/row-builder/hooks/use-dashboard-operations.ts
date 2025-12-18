import { useCallback, useState } from 'react';
import type { DashboardFilterConfig } from '@/lib/types/analytics';
import type { RowBasedDashboardConfig } from '@/components/charts/dashboard-row-builder';
import { useToast } from '@/components/toast';
import { apiClient } from '@/lib/api/client';
import { convertRowsToApiFormat } from '../utils/layout-converter';
import { validateDashboard } from '../utils/validation';

interface EditingDashboard {
  dashboard_id?: string;
  dashboard_name?: string;
  dashboard_description?: string;
  is_published?: boolean;
  charts?: Array<{
    dashboard_chart_id: string;
    chart_definition_id: string;
    position_config?: {
      x?: number;
      y?: number;
      w?: number;
      h?: number;
    };
  }>;
  layout_config?: Record<string, unknown>;
}

interface UseDashboardOperationsProps {
  dashboardConfig: RowBasedDashboardConfig;
  filterConfig: DashboardFilterConfig;
  editingDashboard?: EditingDashboard | undefined;
  onSaveSuccess?: (() => void) | undefined;
}

export interface UseDashboardOperationsReturn {
  saveDashboard: () => Promise<void>;
  isSaving: boolean;
}

/**
 * Hook for handling dashboard save and update operations
 *
 * Manages the save/update workflow including:
 * - Validation
 * - API payload transformation
 * - Network requests
 * - Success/error handling
 * - Toast notifications
 *
 * @param props - Dashboard config, filter config, editing state, and callbacks
 */
export function useDashboardOperations({
  dashboardConfig,
  filterConfig,
  editingDashboard,
  onSaveSuccess,
}: UseDashboardOperationsProps): UseDashboardOperationsReturn {
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  const isEditMode = !!editingDashboard;

  const saveDashboard = useCallback(async () => {
    // Validate dashboard configuration
    const validationError = validateDashboard(dashboardConfig);
    if (validationError) {
      showToast({ message: validationError, type: 'error' });
      return;
    }

    setIsSaving(true);

    try {
      // Convert to API format
      const dashboardDefinition = convertRowsToApiFormat(
        dashboardConfig,
        filterConfig,
        editingDashboard
      );

      const url = isEditMode
        ? `/api/admin/analytics/dashboards/${editingDashboard?.dashboard_id}`
        : '/api/admin/analytics/dashboards';

      const method = isEditMode ? 'PATCH' : 'POST';

      await apiClient.request(url, {
        method,
        body: JSON.stringify(dashboardDefinition),
      });

      showToast({
        message: `Dashboard "${dashboardConfig.dashboardName}" ${isEditMode ? 'updated' : 'saved'} successfully!`,
        type: 'success',
      });

      // Only redirect after creating new dashboards, stay on editor when editing
      if (onSaveSuccess && !isEditMode) {
        onSaveSuccess();
      }
    } catch (error) {
      showToast({
        message: `Failed to ${isEditMode ? 'update' : 'save'} dashboard: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  }, [dashboardConfig, filterConfig, editingDashboard, isEditMode, onSaveSuccess, showToast]);

  return {
    saveDashboard,
    isSaving,
  };
}
