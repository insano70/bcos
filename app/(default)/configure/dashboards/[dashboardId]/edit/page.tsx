'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorDisplay } from '@/components/error-display';
import RowBasedDashboardBuilder from '@/components/dashboards/row-builder';
import { Spinner } from '@/components/ui/spinner';
import { apiClient } from '@/lib/api/client';
import type { Dashboard, DashboardChart } from '@/lib/types/analytics';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface DashboardWithCharts extends Dashboard {
  charts: DashboardChart[];
}

export default function EditDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardWithCharts | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dashboardId = params.dashboardId as string;

  const loadDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await apiClient.get<{
        dashboard: { dashboards?: Dashboard } | Dashboard;
        charts: DashboardChart[];
      }>(`/api/admin/analytics/dashboards/${dashboardId}`);
      const dashboardResponse = result;

      // Extract dashboard and charts from joined API response
      // Handle both nested (joined query) and flat dashboard structures
      const dashboard =
        'dashboards' in dashboardResponse.dashboard
          ? dashboardResponse.dashboard.dashboards
          : dashboardResponse.dashboard;

      if (!dashboard) {
        throw new Error('Dashboard data not found in response');
      }

      // Type assertion after we've confirmed dashboard exists
      const dashboardData = dashboard as Dashboard;
      const charts = dashboardResponse.charts || [];

      const fullDashboardData: DashboardWithCharts = {
        ...dashboardData,
        charts,
      };

      setDashboardData(fullDashboardData);
    } catch (error) {
      clientErrorLog('Failed to load dashboard for editing:', error);
      setError(error instanceof Error ? error.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => {
    if (dashboardId) {
      loadDashboardData();
    }
  }, [dashboardId, loadDashboardData]);

  const handleCancel = () => {
    router.push('/configure/dashboards');
  };

  const handleSaveSuccess = () => {
    router.push('/configure/dashboards');
  };

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        <div className="flex items-center justify-center min-h-64">
          <Spinner size="md" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        <ErrorDisplay
          variant="inline"
          error={error}
          title="Dashboard"
          onRetry={loadDashboardData}
          backLink="/configure/dashboards"
          backLinkLabel="Back to Dashboards"
        />
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        <div className="text-center py-12">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Dashboard not found
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            The dashboard you're looking for doesn't exist or has been deleted.
          </p>
          <Button variant="violet" size="sm" onClick={handleCancel} className="mt-4">
            Back to Dashboards
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
      {/* Breadcrumb Navigation */}
      <div className="mb-6">
        <nav className="flex" aria-label="Breadcrumb">
          <ol className="flex items-center space-x-4">
            <li>
              <button
                type="button"
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Dashboards
              </button>
            </li>
            <li>
              <div className="flex items-center">
                <svg
                  className="flex-shrink-0 h-5 w-5 text-gray-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="ml-4 text-gray-600 dark:text-gray-400 font-medium">
                  Edit {dashboardData.dashboard_name}
                </span>
              </div>
            </li>
          </ol>
        </nav>
      </div>

      {/* Dashboard Builder */}
      <RowBasedDashboardBuilder
        editingDashboard={dashboardData}
        onCancel={handleCancel}
        onSaveSuccess={handleSaveSuccess}
      />
    </div>
  );
}
