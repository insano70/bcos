'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import ChartBuilder from '@/components/charts/chart-builder';
import { Spinner } from '@/components/ui/spinner';
import { apiClient } from '@/lib/api/client';
import type { ChartDefinition } from '@/lib/types/analytics';
import { clientErrorLog } from '@/lib/utils/debug-client';

export default function EditChartPage() {
  const params = useParams();
  const router = useRouter();
  const [chartData, setChartData] = useState<ChartDefinition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const chartId = params.chartId as string;

  const loadChartData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await apiClient.get<{
        chart: { chart_definitions?: ChartDefinition } | ChartDefinition;
      }>(`/api/admin/analytics/charts/${chartId}`);
      const chartResponse = result.chart;

      // Extract chart definition from joined API response
      const fullChartData =
        'chart_definitions' in chartResponse ? chartResponse.chart_definitions : chartResponse;
      setChartData(fullChartData as ChartDefinition);
    } catch (error) {
      clientErrorLog('Failed to load chart for editing:', error);
      setError(error instanceof Error ? error.message : 'Failed to load chart');
    } finally {
      setIsLoading(false);
    }
  }, [chartId]);

  useEffect(() => {
    if (chartId) {
      loadChartData();
    }
  }, [chartId, loadChartData]);

  const handleCancel = () => {
    router.push('/configure/charts');
  };

  const handleSaveSuccess = () => {
    router.push('/configure/charts');
  };

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        <div className="flex items-center justify-center min-h-64">
          <Spinner size="md" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading chart...</span>
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
              <h3 className="text-red-800 dark:text-red-200 font-medium">Error loading chart</h3>
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
              <div className="mt-3 space-x-3">
                <Button variant="danger" size="sm" onClick={loadChartData}>
                  Try Again
                </Button>
                <Button variant="secondary" size="sm" onClick={handleCancel}>
                  Back to Charts
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!chartData) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Chart not found</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            The chart you're looking for doesn't exist or has been deleted.
          </p>
          <Button variant="violet" size="sm" onClick={handleCancel} className="mt-4">
            Back to Charts
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
                Charts
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
                  Edit {chartData.chart_name}
                </span>
              </div>
            </li>
          </ol>
        </nav>
      </div>

      {/* Chart Builder */}
      <ChartBuilder
        editingChart={chartData}
        onCancel={handleCancel}
        onSaveSuccess={handleSaveSuccess}
      />
    </div>
  );
}
