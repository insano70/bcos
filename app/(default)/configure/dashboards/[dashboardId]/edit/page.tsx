'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdvancedDashboardBuilder from '@/components/charts/dashboard-builder-advanced';
import type { Dashboard, DashboardChart } from '@/lib/types/analytics';

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

  useEffect(() => {
    if (dashboardId) {
      loadDashboardData();
    }
  }, [dashboardId]);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/admin/analytics/dashboards/${dashboardId}`);
      if (!response.ok) {
        throw new Error(`Failed to load dashboard: ${response.status}`);
      }

      const result = await response.json();
      const dashboardResponse = result.data;

      // Extract dashboard and charts from joined API response
      const dashboard = dashboardResponse.dashboard.dashboards || dashboardResponse.dashboard;
      const charts = dashboardResponse.charts || [];

      const fullDashboardData: DashboardWithCharts = {
        ...dashboard,
        charts
      };

      setDashboardData(fullDashboardData);
    } catch (error) {
      console.error('❌ Failed to load dashboard for editing:', error);
      setError(error instanceof Error ? error.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  };

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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (error) {
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
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
              <div className="mt-3 space-x-3">
                <button
                  type="button"
                  onClick={loadDashboardData}
                  className="btn-sm bg-red-600 hover:bg-red-700 text-white"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="btn-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Back to Dashboards
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Dashboard not found</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            The dashboard you're looking for doesn't exist or has been deleted.
          </p>
          <button
            type="button"
            onClick={handleCancel}
            className="mt-4 btn-sm bg-violet-600 hover:bg-violet-700 text-white"
          >
            Back to Dashboards
          </button>
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
      <AdvancedDashboardBuilder
        editingDashboard={dashboardData}
        onCancel={handleCancel}
        onSaveSuccess={handleSaveSuccess}
      />
    </div>
  );
}
