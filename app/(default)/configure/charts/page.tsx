'use client';

import { useRouter } from 'next/navigation';
import React, { useCallback, useState } from 'react';
import { SelectedItemsProvider } from '@/app/selected-items-context';
import DateSelect from '@/components/date-select';
import DeleteButton from '@/components/delete-button';
import DeleteChartModal from '@/components/delete-chart-modal';
import FilterButton from '@/components/dropdown-filter';
import PaginationClassic from '@/components/pagination-classic';
import Toast from '@/components/toast';
import { apiClient } from '@/lib/api/client';
import { usePagination } from '@/lib/hooks/use-pagination';
import type { ChartWithMetadata } from '@/lib/services/rbac-charts-service';
import type { ChartDefinition } from '@/lib/types/analytics';
import ChartsTable, { type ChartDefinitionListItem } from './charts-table';

export default function ChartBuilderPage() {
  const router = useRouter();
  const [savedCharts, setSavedCharts] = useState<ChartDefinitionListItem[]>([]);
  const [_isLoading, _setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [chartToDelete, setChartToDelete] = useState<ChartDefinitionListItem | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Pagination
  const pagination = usePagination(savedCharts, { itemsPerPage: 10 });

  const _handleSaveChart = async (chartDefinition: Partial<ChartDefinition>) => {
    try {
      console.log('💾 Saving chart definition:', chartDefinition);

      const result = await apiClient.post('/api/admin/analytics/charts', chartDefinition);
      console.log('✅ Chart saved successfully:', result);

      // Refresh the charts list
      await loadCharts();
    } catch (error) {
      console.error('❌ Failed to save chart:', error);
      // TODO: Show toast notification for save error
    }
  };

  const loadCharts = useCallback(async () => {
    setError(null);

    try {
      console.log('🔍 Loading chart definitions from API...');

      const result = await apiClient.get<{
        charts: ChartWithMetadata[];
      }>('/api/admin/analytics/charts');
      console.log('📊 Raw API Response:', result);

      const charts = result.charts || [];
      console.log('📋 Charts data structure:', {
        count: charts.length,
        sampleChart: charts[0],
      });

      // Transform flattened API data to ChartDefinitionListItem structure
      const transformedCharts: ChartDefinitionListItem[] = (charts as ChartWithMetadata[])
        .map((item: ChartWithMetadata, index: number): ChartDefinitionListItem | null => {
          console.log(`🔄 Transforming chart ${index}:`, item);

          return {
            chart_definition_id: item.chart_definition_id,
            chart_name: item.chart_name,
            chart_description: item.chart_description,
            chart_type: item.chart_type as ChartDefinitionListItem['chart_type'],
            chart_category_id: item.chart_category_id,
            category_name: item.category?.category_name,
            created_by: item.created_by,
            creator_name: item.creator?.first_name,
            creator_last_name: item.creator?.last_name,
            created_at: item.created_at,
            updated_at: item.updated_at,
            is_active: item.is_active,
          };
        })
        .filter((item): item is ChartDefinitionListItem => item !== null);

      console.log('✅ Transformed charts:', {
        count: transformedCharts.length,
        sampleTransformed: transformedCharts[0],
      });

      setSavedCharts(transformedCharts);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load charts';
      console.error('❌ Failed to load charts:', error);
      setError(errorMessage);
      setSavedCharts([]); // Ensure we always have an array
    }
  }, []);

  const handleDeleteClick = (chart: ChartDefinitionListItem) => {
    setChartToDelete(chart);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async (chartId: string) => {
    try {
      await apiClient.delete(`/api/admin/analytics/charts/${chartId}`);

      // Show success toast
      setToastMessage(`Chart "${chartToDelete?.chart_name}" deleted successfully`);
      setToastType('success');
      setToastOpen(true);

      // Refresh the charts list
      await loadCharts();
    } catch (error) {
      console.error('Failed to delete chart:', error);
      setToastMessage(
        `Failed to delete chart: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      setToastType('error');
      setToastOpen(true);
    }
  };

  const handleEditChart = (chart: ChartDefinitionListItem) => {
    router.push(`/configure/charts/${chart.chart_definition_id}/edit`);
  };

  const handleCreateChart = () => {
    router.push('/configure/charts/new');
  };

  // Load charts on component mount
  React.useEffect(() => {
    loadCharts();
  }, [loadCharts]);

  // Error state
  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
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
              <h3 className="text-red-800 dark:text-red-200 font-medium">
                Error loading chart definitions
              </h3>
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
              <button
                type="button"
                onClick={() => loadCharts()}
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

  return (
    <SelectedItemsProvider>
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        {/* Page Header */}
        <div className="sm:flex sm:justify-between sm:items-center mb-8">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
              Charts
            </h1>
          </div>

          {/* Right: Actions */}
          <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
            {/* Delete button */}
            <DeleteButton />

            {/* Date filter */}
            <DateSelect />

            {/* Filter button */}
            <FilterButton align="right" />

            {/* Create chart button */}
            <button
              type="button"
              onClick={handleCreateChart}
              className="btn bg-violet-500 hover:bg-violet-600 text-white"
            >
              <svg
                className="fill-current shrink-0 xs:hidden"
                width="16"
                height="16"
                viewBox="0 0 16 16"
              >
                <path d="m7 7V3c0-.6.4-1 1-1s1 .4 1 1v4h4c.6 0 1 .4 1 1s-.4 1-1 1H9v4c0 .6-.4 1-1 1s-1-.4-1-1V9H3c-.6 0-1-.4-1-1s.4-1 1-1h4Z" />
              </svg>
              <span className="max-xs:sr-only">Create Chart</span>
            </button>
          </div>
        </div>

        {/* Charts Table */}
        <ChartsTable
          charts={pagination.currentItems}
          onEdit={handleEditChart}
          onDelete={handleDeleteClick}
        />

        {/* Pagination */}
        {savedCharts.length > 0 && (
          <div className="mt-8">
            <PaginationClassic
              currentPage={pagination.currentPage}
              totalItems={pagination.totalItems}
              itemsPerPage={pagination.itemsPerPage}
              startItem={pagination.startItem}
              endItem={pagination.endItem}
              hasPrevious={pagination.hasPrevious}
              hasNext={pagination.hasNext}
              onPrevious={pagination.goToPrevious}
              onNext={pagination.goToNext}
            />
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {chartToDelete && (
          <DeleteChartModal
            isOpen={deleteModalOpen}
            setIsOpen={setDeleteModalOpen}
            chartName={chartToDelete.chart_name}
            chartId={chartToDelete.chart_definition_id}
            onConfirm={handleDeleteConfirm}
          />
        )}

        {/* Toast Notifications */}
        <Toast
          type={toastType}
          open={toastOpen}
          setOpen={setToastOpen}
          className="fixed bottom-4 right-4 z-50"
        >
          {toastMessage}
        </Toast>
      </div>
    </SelectedItemsProvider>
  );
}
