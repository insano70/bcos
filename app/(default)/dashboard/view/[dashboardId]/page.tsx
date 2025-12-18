'use client';

import { notFound, useParams, useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardView from '@/components/charts/dashboard-view';
import { ErrorDisplay } from '@/components/error-display';
import { apiClient } from '@/lib/api/client';
import { usePublishedDashboards } from '@/lib/hooks/use-published-dashboards';
import type { Dashboard, DashboardChart } from '@/lib/types/analytics';

interface DashboardViewData {
  dashboard: Dashboard;
  charts: DashboardChart[];
}

export default function DashboardViewPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dashboardId = params.dashboardId as string;

  // Note: Auth/RBAC loading is handled by layout's AuthTransitionOverlay
  // This page only manages dashboard data loading state

  const [dashboardData, setDashboardData] = useState<DashboardViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ref to track if we've loaded this dashboard ID to prevent double execution
  const loadedDashboardIdRef = React.useRef<string | null>(null);

  // Get all published dashboards for cross-dashboard navigation
  const { dashboards: allDashboards } = usePublishedDashboards();

  // Find current dashboard index
  const currentDashboardIndex = useMemo(() => {
    if (!allDashboards.length) return undefined;
    const index = allDashboards.findIndex(d => d.dashboard_id === dashboardId);
    return index >= 0 ? index : undefined;
  }, [allDashboards, dashboardId]);

  // Handle navigation to a different dashboard
  const handleNavigateToDashboard = useCallback((targetIndex: number, chartIndex?: number) => {
    const targetDashboard = allDashboards[targetIndex];
    if (!targetDashboard) return;

    // Preserve current search params (filters) when navigating
    const currentParams = new URLSearchParams(searchParams.toString());

    // Add chartIndex to URL if specified (for starting at specific chart)
    if (chartIndex !== undefined) {
      currentParams.set('startChart', chartIndex.toString());
    } else {
      currentParams.delete('startChart');
    }

    const queryString = currentParams.toString();
    const url = `/dashboard/view/${targetDashboard.dashboard_id}${queryString ? `?${queryString}` : ''}`;
    router.push(url);
  }, [allDashboards, searchParams, router]);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // API route handles all logging server-side
      const result = await apiClient.get<{
        dashboard: { dashboards?: Dashboard } | Dashboard;
        charts: DashboardChart[];
      }>(`/api/admin/analytics/dashboards/${dashboardId}`);

      // Extract dashboard data
      const dashboard =
        'dashboards' in result.dashboard ? result.dashboard.dashboards : result.dashboard;

      if (!dashboard) {
        throw new Error('Dashboard data not found');
      }

      // Type assertion after we've confirmed dashboard exists
      const dashboardData = dashboard as Dashboard;

      // Check if dashboard is published
      if (!dashboardData.is_published) {
        // Server logs the unauthorized access attempt
        notFound();
        return;
      }

      const charts = result.charts || [];

      setDashboardData({
        dashboard: dashboardData,
        charts,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard';

      // Use React error state - server already logged the error
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => {
    if (dashboardId && loadedDashboardIdRef.current !== dashboardId) {
      loadedDashboardIdRef.current = dashboardId;
      loadDashboard();
    }
  }, [dashboardId, loadDashboard]);

  // Show error state if dashboard fetch failed
  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        <ErrorDisplay
          variant="inline"
          error={error}
          title="Dashboard"
          onRetry={loadDashboard}
        />
      </div>
    );
  }

  // Render DashboardView with loading state - it handles ALL loading UI
  // This ensures a single, consistent spinner for the entire loading process
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 w-full max-w-9xl mx-auto">
      <DashboardView
        isLoadingDashboard={loading}
        dashboard={dashboardData?.dashboard}
        dashboardCharts={dashboardData?.charts}
        allDashboards={allDashboards}
        currentDashboardIndex={currentDashboardIndex}
        onNavigateToDashboard={handleNavigateToDashboard}
      />
    </div>
  );
}
