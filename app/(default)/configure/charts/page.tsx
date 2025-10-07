'use client';

import { useRouter } from 'next/navigation';
import React, { useCallback, useMemo, useState } from 'react';
import { SelectedItemsProvider } from '@/app/selected-items-context';
import DataTable, {
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-standard';
import DateSelect, { type DateRange } from '@/components/date-select';
import DeleteButton from '@/components/delete-button';
import DeleteChartModal from '@/components/delete-chart-modal';
import FilterButton, { type ActiveFilter, type FilterGroup } from '@/components/dropdown-filter';
import Toast from '@/components/toast';
import { apiClient } from '@/lib/api/client';
import type { ChartWithMetadata } from '@/lib/services/rbac-charts-service';
import type { ChartDefinition, ChartDefinitionListItem } from '@/lib/types/analytics';

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
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
    period: 'All Time',
  });

  // Define filter configuration
  const filterGroups: FilterGroup[] = [
    {
      group: 'Status',
      options: [
        { label: 'All', value: 'all', field: 'is_active' },
        { label: 'Active', value: 'active', field: 'is_active', comparator: true },
        { label: 'Inactive', value: 'inactive', field: 'is_active', comparator: false },
      ],
    },
    {
      group: 'Chart Type',
      options: [
        { label: 'All', value: 'all', field: 'chart_type' },
        { label: 'Line', value: 'line', field: 'chart_type', comparator: 'line' },
        { label: 'Bar', value: 'bar', field: 'chart_type', comparator: 'bar' },
        { label: 'Pie', value: 'pie', field: 'chart_type', comparator: 'pie' },
        { label: 'Doughnut', value: 'doughnut', field: 'chart_type', comparator: 'doughnut' },
        { label: 'Area', value: 'area', field: 'chart_type', comparator: 'area' },
      ],
    },
  ];

  // Apply filters to charts
  const filteredCharts = useMemo(() => {
    if (!savedCharts) {
      return [];
    }

    return savedCharts.filter((chart) => {
      // Apply status/type filters
      if (activeFilters.length > 0) {
        const filtersByField = activeFilters.reduce(
          (acc, filter) => {
            if (!acc[filter.field]) {
              acc[filter.field] = [];
            }
            const fieldFilters = acc[filter.field];
            if (fieldFilters) {
              fieldFilters.push(filter);
            }
            return acc;
          },
          {} as Record<string, ActiveFilter[]>
        );

        const matchesFilters = Object.entries(filtersByField).every(([_field, filters]) => {
          return filters.some((filter) => {
            const chartValue = chart[filter.field as keyof ChartDefinitionListItem];
            return chartValue === filter.comparator;
          });
        });

        if (!matchesFilters) {
          return false;
        }
      }

      // Apply date range filter on created_at
      if (dateRange.startDate || dateRange.endDate) {
        const chartCreatedAt = chart.created_at ? new Date(chart.created_at) : null;
        if (!chartCreatedAt) {
          return false;
        }

        if (dateRange.startDate && chartCreatedAt < dateRange.startDate) {
          return false;
        }

        if (dateRange.endDate && chartCreatedAt > dateRange.endDate) {
          return false;
        }
      }

      return true;
    });
  }, [savedCharts, activeFilters, dateRange]);

  const handleFilterChange = (filters: ActiveFilter[]) => {
    setActiveFilters(filters);
  };

  const handleDateChange = (newDateRange: DateRange) => {
    setDateRange(newDateRange);
  };

  // Helper function for chart type badge colors
  const getChartTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'line':
        return 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200';
      case 'bar':
        return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200';
      case 'pie':
        return 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200';
      case 'doughnut':
        return 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200';
      case 'area':
        return 'bg-teal-100 dark:bg-teal-900/20 text-teal-800 dark:text-teal-200';
      default:
        return 'bg-gray-100 dark:bg-gray-900/20 text-gray-800 dark:text-gray-200';
    }
  };

  const _handleSaveChart = async (chartDefinition: Partial<ChartDefinition>) => {
    try {
      console.log('💾 Saving chart definition:', chartDefinition);

      const result = await apiClient.post('/api/admin/analytics/charts', chartDefinition);
      console.log('✅ Chart saved successfully:', result);

      // Show success toast
      setToastMessage('Chart saved successfully');
      setToastType('success');
      setToastOpen(true);

      // Refresh the charts list
      await loadCharts();
    } catch (error) {
      console.error('❌ Failed to save chart:', error);
      setToastMessage(
        `Failed to save chart: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      setToastType('error');
      setToastOpen(true);
    }
  };

  const loadCharts = useCallback(async () => {
    setError(null);

    try {
      console.log('🔍 Loading chart definitions from API...');

      const result = await apiClient.get<{
        charts: ChartWithMetadata[];
      }>('/api/admin/analytics/charts?limit=1000');
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
            id: item.chart_definition_id,
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

  const handleDeleteClick = (_chart: ChartDefinitionListItem) => {
    setChartToDelete(_chart);
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

  const handleEditChart = (_chart: ChartDefinitionListItem) => {
    router.push(`/configure/charts/${_chart.chart_definition_id}/edit`);
  };

  const handleCreateChart = () => {
    router.push('/configure/charts/new');
  };

  // Define table columns
  const columns: DataTableColumn<ChartDefinitionListItem>[] = [
    { key: 'checkbox' },
    {
      key: 'chart_name',
      header: 'Chart Name',
      sortable: true,
      render: (chart) => (
        <div className="flex items-center">
          <div>
            <div className="font-medium text-gray-800 dark:text-gray-100">{chart.chart_name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              ID: {chart.chart_definition_id.slice(0, 8)}...
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'chart_type',
      header: 'Chart Type',
      sortable: true,
      render: (chart) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getChartTypeBadgeColor(chart.chart_type)}`}
        >
          {chart.chart_type}
        </span>
      ),
    },
    {
      key: 'chart_description',
      header: 'Description',
      sortable: true,
      render: (chart) => (
        <div className="text-gray-800 dark:text-gray-100 max-w-xs truncate">
          {chart.chart_description || (
            <span className="text-gray-400 dark:text-gray-500 italic">No description</span>
          )}
        </div>
      ),
    },
    {
      key: 'category_name',
      header: 'Category',
      sortable: true,
      render: (chart) => (
        <div className="text-gray-800 dark:text-gray-100">
          {chart.category_name || (
            <span className="text-gray-400 dark:text-gray-500 italic">Uncategorized</span>
          )}
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      align: 'center',
      render: (chart) => (
        <div
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            chart.is_active
              ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
              : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200'
          }`}
        >
          {chart.is_active ? 'Active' : 'Inactive'}
        </div>
      ),
    },
    {
      key: 'created_by',
      header: 'Created By',
      sortable: true,
      render: (chart) => (
        <div className="text-gray-800 dark:text-gray-100">
          {chart.creator_name && chart.creator_last_name
            ? `${chart.creator_name} ${chart.creator_last_name}`
            : chart.created_by || 'Unknown'}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Created Date',
      sortable: true,
      render: (chart) => (
        <div>
          <div className="text-gray-800 dark:text-gray-100">
            {new Date(chart.created_at).toLocaleDateString()}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {new Date(chart.created_at).toLocaleTimeString()}
          </div>
        </div>
      ),
    },
    { key: 'actions' },
  ];

  // Define dropdown actions
  const getDropdownActions = (
    _chart: ChartDefinitionListItem
  ): DataTableDropdownAction<ChartDefinitionListItem>[] => [
    {
      label: 'Edit Chart',
      onClick: handleEditChart,
    },
    {
      label: 'Copy ID',
      onClick: (c) => {
        navigator.clipboard.writeText(c.chart_definition_id);
      },
    },
    {
      label: 'Preview Chart',
      onClick: () => {
        // TODO: Implement chart preview
      },
    },
    {
      label: 'Delete Chart',
      onClick: handleDeleteClick,
      variant: 'danger',
    },
  ];

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
            <DateSelect onDateChange={handleDateChange} />

            {/* Filter button */}
            <FilterButton
              align="right"
              filters={filterGroups}
              onFilterChange={handleFilterChange}
            />

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
        <DataTable
          title="All Charts"
          data={filteredCharts}
          columns={columns}
          dropdownActions={getDropdownActions}
          pagination={{ itemsPerPage: 10 }}
          selectionMode="multi"
          isLoading={false}
          searchable={true}
          searchPlaceholder="Search charts..."
          exportable={true}
          exportFileName="charts"
        />

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
