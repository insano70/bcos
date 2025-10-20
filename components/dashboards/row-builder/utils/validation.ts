import type {
  DashboardChartSlot,
  RowBasedDashboardConfig,
} from '@/components/charts/dashboard-row-builder';

/**
 * Validate dashboard configuration before saving
 *
 * Checks for required fields and common configuration errors that would
 * prevent the dashboard from being saved or rendered correctly.
 *
 * @param config - The dashboard configuration to validate
 * @returns Error message if invalid, null if valid
 */
export function validateDashboard(config: RowBasedDashboardConfig): string | null {
  // Check required: dashboard name
  if (!config.dashboardName.trim()) {
    return 'Dashboard name is required';
  }

  // Check required: at least one row
  if (config.rows.length === 0) {
    return 'Dashboard must have at least one row';
  }

  // Check for empty rows (rows with no charts)
  const emptyRows = config.rows.filter((row) => row.charts.length === 0);
  if (emptyRows.length > 0) {
    return `${emptyRows.length} row(s) have no charts. Please add charts or remove empty rows.`;
  }

  // Check for unselected chart slots
  for (const row of config.rows) {
    const unselectedCharts = row.charts.filter((chart) => !chart.chartDefinitionId);
    if (unselectedCharts.length > 0) {
      return 'All chart slots must have a chart selected';
    }
  }

  // All validations passed
  return null;
}

/**
 * Calculate total width percentage for a row
 */
export function calculateTotalWidth(charts: DashboardChartSlot[]): number {
  return charts.reduce((sum, chart) => sum + chart.widthPercentage, 0);
}

/**
 * Check if row width is valid (should equal 100%)
 */
export function isValidRowWidth(totalWidth: number): boolean {
  return totalWidth === 100;
}
