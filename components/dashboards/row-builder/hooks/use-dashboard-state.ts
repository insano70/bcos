import { useCallback, useEffect, useState } from 'react';
import type {
  DashboardRow,
  RowBasedDashboardConfig,
} from '@/components/charts/dashboard-row-builder';
import type { ChartDefinition } from '@/lib/types/analytics';
import { convertGridToRows } from '../utils/layout-converter';

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

export interface UseDashboardStateReturn {
  dashboardConfig: RowBasedDashboardConfig;
  isEditMode: boolean;
  updateConfig: (updates: Partial<RowBasedDashboardConfig>) => void;
  addRow: () => void;
  updateRow: (rowId: string, updates: Partial<DashboardRow>) => void;
  deleteRow: (rowId: string) => void;
  moveRowUp: (rowId: string) => void;
  moveRowDown: (rowId: string) => void;
}

/**
 * Hook for managing dashboard configuration state and row operations
 *
 * Provides state management for the dashboard configuration including
 * dashboard metadata (name, description) and row-based layout.
 *
 * When editing a dashboard, automatically converts from grid-based layout
 * to row-based layout on mount.
 *
 * @param editingDashboard - Optional dashboard being edited
 * @param availableCharts - All available chart definitions (needed for conversion)
 */
export function useDashboardState(
  editingDashboard?: EditingDashboard,
  availableCharts?: ChartDefinition[]
): UseDashboardStateReturn {
  const [dashboardConfig, setDashboardConfig] = useState<RowBasedDashboardConfig>({
    dashboardName: '',
    dashboardDescription: '',
    rows: [],
  });

  const [isEditMode, setIsEditMode] = useState(!!editingDashboard);

  // Load editing dashboard and convert to row-based layout
  useEffect(() => {
    if (editingDashboard && availableCharts && availableCharts.length > 0) {
      const converted = convertGridToRows(editingDashboard, availableCharts);
      setDashboardConfig(converted);
      setIsEditMode(true);
    }
  }, [editingDashboard, availableCharts]);

  const updateConfig = useCallback((updates: Partial<RowBasedDashboardConfig>) => {
    setDashboardConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const addRow = useCallback(() => {
    const newRow: DashboardRow = {
      id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      heightPx: 300,
      charts: [],
    };
    setDashboardConfig((prev) => ({
      ...prev,
      rows: [...prev.rows, newRow],
    }));
  }, []);

  const updateRow = useCallback((rowId: string, updates: Partial<DashboardRow>) => {
    setDashboardConfig((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === rowId ? { ...row, ...updates } : row)),
    }));
  }, []);

  const deleteRow = useCallback((rowId: string) => {
    setDashboardConfig((prev) => ({
      ...prev,
      rows: prev.rows.filter((row) => row.id !== rowId),
    }));
  }, []);

  const moveRowUp = useCallback((rowId: string) => {
    setDashboardConfig((prev) => {
      const rowIndex = prev.rows.findIndex((row) => row.id === rowId);
      if (rowIndex <= 0) return prev;

      const newRows = [...prev.rows];
      const current = newRows[rowIndex];
      const above = newRows[rowIndex - 1];
      if (current && above) {
        newRows[rowIndex - 1] = current;
        newRows[rowIndex] = above;
      }
      return { ...prev, rows: newRows };
    });
  }, []);

  const moveRowDown = useCallback((rowId: string) => {
    setDashboardConfig((prev) => {
      const rowIndex = prev.rows.findIndex((row) => row.id === rowId);
      if (rowIndex < 0 || rowIndex >= prev.rows.length - 1) return prev;

      const newRows = [...prev.rows];
      const current = newRows[rowIndex];
      const below = newRows[rowIndex + 1];
      if (current && below) {
        newRows[rowIndex] = below;
        newRows[rowIndex + 1] = current;
      }
      return { ...prev, rows: newRows };
    });
  }, []);

  return {
    dashboardConfig,
    isEditMode,
    updateConfig,
    addRow,
    updateRow,
    deleteRow,
    moveRowUp,
    moveRowDown,
  };
}
