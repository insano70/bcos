/**
 * Dashboard Error Messages
 *
 * Centralized error and status messages for dashboard rendering.
 * Provides consistent messaging across the application.
 */

export const DASHBOARD_MESSAGES = {
  /**
   * Error messages
   */
  ERRORS: {
    CHART_DEFINITIONS_LOAD_FAILED: 'Failed to load chart definitions for dashboard',
    BATCH_RENDER_FAILED: 'Dashboard rendering failed. Please try again.',
    CHART_NOT_FOUND: 'Chart Not Found',
    CHART_DATA_UNAVAILABLE: 'Chart Data Unavailable',
  },

  /**
   * Loading states
   */
  LOADING: {
    DASHBOARD: 'Loading dashboard...',
    CHART_DATA: 'Loading chart data...',
  },

  /**
   * Empty states
   */
  EMPTY: {
    TITLE: 'Empty Dashboard',
    DESCRIPTION: "This dashboard doesn't have any charts yet.",
  },

  /**
   * Action labels
   */
  ACTIONS: {
    RETRY: 'Retry',
  },
} as const;
