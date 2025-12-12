'use client';

/**
 * Dashboard State Components
 *
 * Reusable components for dashboard loading, error, and empty states.
 * Extracted from dashboard-view.tsx for better separation of concerns.
 *
 * @module components/charts/dashboard-states
 */

import dynamic from 'next/dynamic';
import { DASHBOARD_MESSAGES } from '@/lib/constants/dashboard-messages';
import type { DashboardUniversalFilters } from '@/hooks/useDashboardData';
import DashboardFilterDropdown from './dashboard-filter-dropdown';
import DashboardFilterPills from './dashboard-filter-pills';

// Lazy load fullscreen loading modal
const FullscreenLoadingModal = dynamic(() => import('./fullscreen-loading-modal'), {
  ssr: false,
});

/**
 * Props for DashboardLoadingState component
 */
interface DashboardLoadingStateProps {
  /** Dashboard name to display */
  dashboardName: string;
  /** Whether filter bar should be shown */
  showFilterBar: boolean;
  /** Current filter state */
  universalFilters: DashboardUniversalFilters;
  /** Filter config defaults */
  defaultFilters?: DashboardUniversalFilters | undefined;
  /** Handle filter changes */
  onFilterChange: (filters: DashboardUniversalFilters) => void;
  /** Handle filter removal */
  onRemoveFilter: (filterKey: keyof DashboardUniversalFilters) => void;
  /** Whether to show fullscreen loading (mobile transition) */
  showFullscreenLoading?: boolean | undefined;
  /** Close handler for fullscreen loading */
  onFullscreenClose?: (() => void) | undefined;
  /** Cross-dashboard navigation props */
  crossDashboardNav?: {
    dashboardName?: string | undefined;
    canGoNextDashboard?: boolean | undefined;
    canGoPreviousDashboard?: boolean | undefined;
    onNextDashboard?: (() => void) | undefined;
    onPreviousDashboard?: (() => void) | undefined;
  } | undefined;
  /** Number of orgs user can access (hides org pill if 1) */
  accessibleOrganizationCount?: number | undefined;
}

/**
 * Dashboard loading state component
 *
 * Shows a loading spinner with optional filter bar and dashboard name.
 * Supports fullscreen loading modal for mobile transitions.
 */
export function DashboardLoadingState({
  dashboardName,
  showFilterBar,
  universalFilters,
  defaultFilters,
  onFilterChange,
  onRemoveFilter,
  showFullscreenLoading,
  onFullscreenClose,
  crossDashboardNav,
  accessibleOrganizationCount,
}: DashboardLoadingStateProps) {
  // If we should be in fullscreen mode (transitioning between dashboards), show fullscreen loading
  if (showFullscreenLoading && onFullscreenClose) {
    return (
      <FullscreenLoadingModal
        isOpen={true}
        onClose={onFullscreenClose}
        dashboardName={crossDashboardNav?.dashboardName}
        onNextDashboard={crossDashboardNav?.onNextDashboard}
        onPreviousDashboard={crossDashboardNav?.onPreviousDashboard}
        canGoNextDashboard={crossDashboardNav?.canGoNextDashboard}
        canGoPreviousDashboard={crossDashboardNav?.canGoPreviousDashboard}
      />
    );
  }

  // Regular loading state for non-fullscreen
  return (
    <div className="space-y-4">
      {/* Title Row - visible during loading */}
      <div className="flex items-center justify-between gap-4 px-4 pt-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {dashboardName || 'Loading Dashboard...'}
        </h1>

        {/* Filter controls visible but disabled during loading */}
        {showFilterBar && (
          <div className="flex items-center gap-3 opacity-50 pointer-events-none">
            <DashboardFilterPills
              filters={universalFilters}
              defaultFilters={defaultFilters}
              onRemoveFilter={onRemoveFilter}
              loading={true}
              accessibleOrganizationCount={accessibleOrganizationCount}
            />
            <DashboardFilterDropdown
              initialFilters={universalFilters}
              onFiltersChange={onFilterChange}
              loading={true}
              align="right"
            />
          </div>
        )}
      </div>

      {/* Simple centered spinner */}
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading...</span>
      </div>
    </div>
  );
}

/**
 * Props for DashboardErrorState component
 */
interface DashboardErrorStateProps {
  /** Error title */
  title: string;
  /** Error message */
  message: string;
  /** Retry handler (optional) */
  onRetry?: (() => void) | undefined;
}

/**
 * Dashboard error state component
 *
 * Shows an error message with optional retry button.
 */
export function DashboardErrorState({
  title,
  message,
  onRetry,
}: DashboardErrorStateProps) {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
      <div className="flex items-center">
        <svg
          className="w-6 h-6 text-red-600 dark:text-red-400 mr-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <div>
          <h3 className="text-red-800 dark:text-red-200 font-medium">{title}</h3>
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 btn-sm bg-red-600 hover:bg-red-700 text-white"
            >
              {DASHBOARD_MESSAGES.ACTIONS.RETRY}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Dashboard empty state component
 *
 * Shows a friendly message when dashboard has no charts.
 */
export function DashboardEmptyState() {
  return (
    <div className="text-center py-12">
      <div className="text-6xl mb-4">📊</div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
        {DASHBOARD_MESSAGES.EMPTY.TITLE}
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mt-2">
        {DASHBOARD_MESSAGES.EMPTY.DESCRIPTION}
      </p>
    </div>
  );
}
