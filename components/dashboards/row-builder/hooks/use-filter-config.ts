import { useEffect, useState } from 'react';
import type { DashboardFilterConfig } from '@/components/charts/dashboard-filter-bar';

interface EditingDashboard {
  dashboard_id?: string;
  layout_config?: Record<string, unknown>;
}

const DEFAULT_FILTER_CONFIG: DashboardFilterConfig = {
  enabled: true,
  showDateRange: true,
  showOrganization: true,
  showPractice: false,
  showProvider: false,
  defaultFilters: {
    dateRangePreset: 'last_30_days',
  },
};

export interface UseFilterConfigReturn {
  filterConfig: DashboardFilterConfig;
  setFilterConfig: (config: DashboardFilterConfig) => void;
}

/**
 * Hook for managing filter configuration state
 *
 * Manages the dashboard-wide filter configuration including which filters
 * are visible and their default values. Loads existing config when editing
 * a dashboard, otherwise uses sensible defaults.
 *
 * @param editingDashboard - Optional dashboard being edited (to load existing config)
 */
export function useFilterConfig(editingDashboard?: EditingDashboard): UseFilterConfigReturn {
  const [filterConfig, setFilterConfig] = useState<DashboardFilterConfig>(DEFAULT_FILTER_CONFIG);

  // Load filter config from editing dashboard on mount
  useEffect(() => {
    if (editingDashboard?.layout_config?.filterConfig) {
      const layoutFilterConfig = editingDashboard.layout_config
        .filterConfig as DashboardFilterConfig;
      setFilterConfig({
        enabled: layoutFilterConfig.enabled !== false,
        showDateRange: layoutFilterConfig.showDateRange !== false,
        showOrganization: layoutFilterConfig.showOrganization !== false,
        showPractice: layoutFilterConfig.showPractice === true,
        showProvider: layoutFilterConfig.showProvider === true,
        defaultFilters: layoutFilterConfig.defaultFilters || {
          dateRangePreset: 'last_30_days',
        },
      });
    }
  }, [editingDashboard]);

  return {
    filterConfig,
    setFilterConfig,
  };
}
