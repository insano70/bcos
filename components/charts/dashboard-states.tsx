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
import { AlertCircle, BarChart3, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { DASHBOARD_MESSAGES } from '@/lib/constants/dashboard-messages';
import { Spinner } from '@/components/ui/spinner';

// Lazy load fullscreen loading modal
const FullscreenLoadingModal = dynamic(() => import('./fullscreen-loading-modal'), {
  ssr: false,
});

/**
 * Props for DashboardLoadingState component
 */
interface DashboardLoadingStateProps {
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
}

/**
 * Dashboard loading state component
 *
 * Shows a loading spinner with optional filter bar and dashboard name.
 * Supports fullscreen loading modal for mobile transitions.
 */
export function DashboardLoadingState({
  showFullscreenLoading,
  onFullscreenClose,
  crossDashboardNav,
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

  // In-content loading state (non-fixed):
  // Do NOT use a full-viewport fixed overlay here, because it will cover the sidebar/header
  // and create "nav appears → fullscreen loader → nav appears" thrashing while dashboard
  // data loads. Auth/RBAC fullscreen loading is handled by the layout-level overlay.
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex items-center justify-center min-h-[60vh]">
      <div className="flex items-center">
        <Spinner size="md" />
        <span className="ml-3 text-lg text-gray-600 dark:text-gray-400">Loading...</span>
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
        <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 mr-3 flex-shrink-0" />
        <div>
          <h3 className="text-red-800 dark:text-red-200 font-semibold">{title}</h3>
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{message}</p>
          {onRetry && (
            <Button
              variant="violet"
              size="sm"
              onClick={onRetry}
              leftIcon={<RefreshCcw className="w-4 h-4" />}
              className="mt-3"
            >
              Try Again
            </Button>
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
    <EmptyState
      icon={BarChart3}
      iconSize="lg"
      title={DASHBOARD_MESSAGES.EMPTY.TITLE}
      description={DASHBOARD_MESSAGES.EMPTY.DESCRIPTION}
    />
  );
}
