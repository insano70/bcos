'use client';

import React, { useState, useEffect } from 'react';
import { useParams, notFound } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import DashboardView from '@/components/charts/dashboard-view';
import type { Dashboard, DashboardChart } from '@/lib/types/analytics';

interface DashboardViewData {
  dashboard: Dashboard;
  charts: DashboardChart[];
}

export default function DashboardViewPage() {
  const params = useParams();
  const dashboardId = params.dashboardId as string;
  
  const [dashboardData, setDashboardData] = useState<DashboardViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ref to track if we've loaded this dashboard ID to prevent double execution
  const loadedDashboardIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (dashboardId && loadedDashboardIdRef.current !== dashboardId) {
      loadedDashboardIdRef.current = dashboardId;
      loadDashboard();
    }
  }, [dashboardId]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);

      // API route handles all logging server-side
      const result = await apiClient.get<{
        dashboard: { dashboards?: Dashboard } | Dashboard;
        charts: DashboardChart[];
      }>(`/api/admin/analytics/dashboards/${dashboardId}`);

      // Extract dashboard data
      const dashboard = 'dashboards' in result.dashboard
        ? result.dashboard.dashboards
        : result.dashboard;

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
        charts
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard';

      // Use React error state - server already logged the error
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };


  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        <div className="flex items-center justify-center h-96">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
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
              <h3 className="text-red-800 dark:text-red-200 font-medium">Error loading dashboard</h3>
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">
                {error || 'Dashboard not found'}
              </p>
              <button
                type="button"
                onClick={loadDashboard}
                className="mt-3 btn-sm bg-red-600 hover:bg-red-700 text-white"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { dashboard, charts } = dashboardData;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
      {/* Dashboard Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          {dashboard.dashboard_name}
        </h1>
        {dashboard.dashboard_description && (
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {dashboard.dashboard_description}
          </p>
        )}
      </div>

      {/* Dashboard Content - Use DashboardView component */}
      <DashboardView
        dashboard={dashboard}
        dashboardCharts={charts}
      />
    </div>
  );
}
