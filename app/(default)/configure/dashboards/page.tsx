'use client';

import { useRouter } from 'next/navigation';
import React, { useCallback, useMemo, useState } from 'react';
import { SelectedItemsProvider } from '@/app/selected-items-context';
import DashboardPreviewModal from '@/components/dashboard-preview-modal';
import DataTable, {
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-standard';
import DateSelect, { type DateRange } from '@/components/date-select';
import DeleteButton from '@/components/delete-button';
import DeleteDashboardModal from '@/components/delete-dashboard-modal';
import FilterButton, { type ActiveFilter, type FilterGroup } from '@/components/dropdown-filter';
import Toast from '@/components/toast';
import { apiClient } from '@/lib/api/client';
import type { DashboardWithCharts } from '@/lib/services/rbac-dashboards-service';
import type { Dashboard, DashboardChart, DashboardListItem } from '@/lib/types/analytics';

export default function DashboardsPage() {
  const router = useRouter();
  const [savedDashboards, setSavedDashboards] = useState<DashboardListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [dashboardToDelete, setDashboardToDelete] = useState<DashboardListItem | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [dashboardToPreview, setDashboardToPreview] = useState<{
    dashboard: Dashboard;
    charts: DashboardChart[];
  } | null>(null);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
    period: 'All Time',
  });

  // Define filter configuration
  const filterGroups: FilterGroup[] = [
    {
      group: 'Publication Status',
      options: [
        { label: 'All', value: 'all', field: 'is_published' },
        { label: 'Published', value: 'published', field: 'is_published', comparator: true },
        {
          label: 'Under Development',
          value: 'development',
          field: 'is_published',
          comparator: false,
        },
      ],
    },
    {
      group: 'Special Status',
      options: [
        { label: 'All', value: 'all', field: 'special' },
        { label: 'Default Home', value: 'default', field: 'is_default', comparator: true },
        { label: 'Active', value: 'active', field: 'is_active', comparator: true },
        { label: 'Inactive', value: 'inactive', field: 'is_active', comparator: false },
      ],
    },
  ];

  // Apply filters to dashboards
  const filteredDashboards = useMemo(() => {
    if (!savedDashboards) {
      return [];
    }

    return savedDashboards.filter((dashboard) => {
      // Apply status filters
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
            const dashboardValue = dashboard[filter.field as keyof DashboardListItem];
            return dashboardValue === filter.comparator;
          });
        });

        if (!matchesFilters) {
          return false;
        }
      }

      // Apply date range filter on created_at
      if (dateRange.startDate || dateRange.endDate) {
        const dashboardCreatedAt = dashboard.created_at ? new Date(dashboard.created_at) : null;
        if (!dashboardCreatedAt) {
          return false;
        }

        if (dateRange.startDate && dashboardCreatedAt < dateRange.startDate) {
          return false;
        }

        if (dateRange.endDate && dashboardCreatedAt > dateRange.endDate) {
          return false;
        }
      }

      return true;
    });
  }, [savedDashboards, activeFilters, dateRange]);

  const handleFilterChange = (filters: ActiveFilter[]) => {
    setActiveFilters(filters);
  };

  const handleDateChange = (newDateRange: DateRange) => {
    setDateRange(newDateRange);
  };

  const getChartCountBadgeColor = (count: number) => {
    if (count === 0) return 'bg-gray-100 dark:bg-gray-900/20 text-gray-800 dark:text-gray-200';
    if (count <= 3) return 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200';
    if (count <= 6) return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200';
    return 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200';
  };

  const loadDashboards = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      console.log('🔍 Loading dashboard definitions from API...');

      const result = await apiClient.get<{
        dashboards: DashboardListItem[];
        metadata: {
          total_count: number;
          category_filter?: string;
          active_filter: boolean;
          generatedAt: string;
        };
      }>('/api/admin/analytics/dashboards?limit=1000');
      console.log('📊 Raw Dashboard API Response:', result);

      // apiClient automatically unwraps the data, so result is already the data portion
      const dashboards = result.dashboards || [];
      console.log('📋 Dashboards data structure:', {
        count: dashboards.length,
        sampleDashboard: dashboards[0],
      });

      // Transform flattened API data to DashboardListItem structure
      const transformedDashboards: DashboardListItem[] = dashboards
        .map((item, index: number): DashboardListItem | null => {
          const dashboard = item as unknown as DashboardWithCharts;
          // Handle flattened data structure from new API service
          console.log(`🔄 Transforming dashboard ${index}:`, item);

          // Validate required fields
          if (!dashboard.dashboard_id || !dashboard.dashboard_name) {
            console.warn(`⚠️ Skipping dashboard ${index}: missing required fields`);
            return null;
          }

          return {
            id: dashboard.dashboard_id,
            dashboard_id: dashboard.dashboard_id,
            dashboard_name: dashboard.dashboard_name,
            dashboard_description: dashboard.dashboard_description,
            dashboard_category_id: dashboard.dashboard_category_id,
            category_name: dashboard.category?.category_name,
            chart_count: dashboard.chart_count || 0,
            created_by: dashboard.created_by,
            creator_name: dashboard.creator?.first_name,
            creator_last_name: dashboard.creator?.last_name,
            created_at: dashboard.created_at,
            updated_at: dashboard.updated_at,
            is_active: dashboard.is_active,
            is_published: dashboard.is_published,
            is_default: dashboard.is_default,
          };
        })
        .filter((item): item is DashboardListItem => item !== null);

      console.log('✅ Transformed dashboards:', {
        count: transformedDashboards.length,
        sampleTransformed: transformedDashboards[0],
      });

      setSavedDashboards(transformedDashboards);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load dashboards';
      console.error('❌ Failed to load dashboards:', error);
      setError(errorMessage);
      setSavedDashboards([]); // Ensure we always have an array
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDeleteClick = (dashboard: DashboardListItem) => {
    setDashboardToDelete(dashboard);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async (dashboardId: string) => {
    try {
      await apiClient.delete(`/api/admin/analytics/dashboards/${dashboardId}`);

      // Show success toast
      setToastMessage(`Dashboard "${dashboardToDelete?.dashboard_name}" deleted successfully`);
      setToastType('success');
      setToastOpen(true);

      // Refresh the dashboards list
      await loadDashboards();
    } catch (error) {
      console.error('Failed to delete dashboard:', error);
      setToastMessage(
        `Failed to delete dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      setToastType('error');
      setToastOpen(true);
    }
  };

  const handleEditDashboard = (dashboard: DashboardListItem) => {
    router.push(`/configure/dashboards/${dashboard.dashboard_id}/edit`);
  };

  const handlePublishDashboard = async (dashboard: DashboardListItem) => {
    try {
      // Use apiClient which automatically handles CSRF tokens and auth
      await apiClient.request(`/api/admin/analytics/dashboards/${dashboard.dashboard_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_published: true,
        }),
      });

      // Show success toast
      setToastMessage(`Dashboard "${dashboard.dashboard_name}" published successfully`);
      setToastType('success');
      setToastOpen(true);

      // Refresh the dashboards list
      await loadDashboards();
    } catch (error) {
      console.error('Failed to publish dashboard:', error);
      setToastMessage(
        `Failed to publish dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      setToastType('error');
      setToastOpen(true);
    }
  };

  const handleUnpublishDashboard = async (dashboard: DashboardListItem) => {
    try {
      // Use apiClient which automatically handles CSRF tokens and auth
      await apiClient.request(`/api/admin/analytics/dashboards/${dashboard.dashboard_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_published: false,
        }),
      });

      // Show success toast
      setToastMessage(`Dashboard "${dashboard.dashboard_name}" unpublished successfully`);
      setToastType('success');
      setToastOpen(true);

      // Refresh the dashboards list
      await loadDashboards();
    } catch (error) {
      console.error('Failed to unpublish dashboard:', error);
      setToastMessage(
        `Failed to unpublish dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      setToastType('error');
      setToastOpen(true);
    }
  };

  const handleSetAsDefault = async (dashboard: DashboardListItem) => {
    try {
      // Use apiClient which automatically handles CSRF tokens and auth
      await apiClient.request(`/api/admin/analytics/dashboards/${dashboard.dashboard_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_default: true,
        }),
      });

      // Show success toast
      setToastMessage(`Dashboard "${dashboard.dashboard_name}" set as default home screen`);
      setToastType('success');
      setToastOpen(true);

      // Refresh the dashboards list
      await loadDashboards();
    } catch (error) {
      console.error('Failed to set dashboard as default:', error);
      setToastMessage(
        `Failed to set dashboard as default: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      setToastType('error');
      setToastOpen(true);
    }
  };

  const handlePreviewDashboard = async (dashboard: DashboardListItem) => {
    try {
      console.log('🔍 Loading dashboard for preview:', dashboard.dashboard_id);

      const result = await apiClient.get<{
        dashboard: { dashboards?: Dashboard } | Dashboard;
        charts: DashboardChart[];
      }>(`/api/admin/analytics/dashboards/${dashboard.dashboard_id}`);
      const dashboardResponse = result;

      // Extract dashboard and charts from API response
      const fullDashboard =
        'dashboards' in dashboardResponse.dashboard
          ? dashboardResponse.dashboard.dashboards
          : dashboardResponse.dashboard;
      const charts = dashboardResponse.charts || [];

      if (!fullDashboard) {
        throw new Error('Dashboard data not found in response');
      }

      setDashboardToPreview({
        dashboard: fullDashboard as Dashboard,
        charts,
      });
      setPreviewModalOpen(true);
    } catch (error) {
      console.error('❌ Failed to load dashboard for preview:', error);
      setToastMessage(
        `Failed to load dashboard preview: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      setToastType('error');
      setToastOpen(true);
    }
  };

  const handleCreateDashboard = () => {
    router.push('/configure/dashboard-builder');
  };

  // Define table columns
  const columns: DataTableColumn<DashboardListItem>[] = [
    { key: 'checkbox' },
    {
      key: 'dashboard_name',
      header: 'Dashboard Name',
      sortable: true,
      render: (dashboard) => (
        <div className="flex items-center">
          <div>
            <div className="font-medium text-gray-800 dark:text-gray-100">
              {dashboard.dashboard_name || 'Unnamed Dashboard'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              ID: {dashboard.dashboard_id?.slice(0, 8) || 'unknown'}...
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'dashboard_description',
      header: 'Description',
      sortable: true,
      render: (dashboard) => (
        <div className="text-gray-800 dark:text-gray-100 max-w-xs truncate">
          {dashboard.dashboard_description || (
            <span className="text-gray-400 dark:text-gray-500 italic">No description</span>
          )}
        </div>
      ),
    },
    {
      key: 'chart_count',
      header: 'Charts',
      sortable: true,
      align: 'center',
      render: (dashboard) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getChartCountBadgeColor(dashboard.chart_count)}`}
        >
          {dashboard.chart_count} {dashboard.chart_count === 1 ? 'chart' : 'charts'}
        </span>
      ),
    },
    {
      key: 'category_name',
      header: 'Category',
      sortable: true,
      render: (dashboard) => (
        <div className="text-gray-800 dark:text-gray-100">
          {dashboard.category_name || (
            <span className="text-gray-400 dark:text-gray-500 italic">Uncategorized</span>
          )}
        </div>
      ),
    },
    {
      key: 'is_published',
      header: 'Status',
      sortable: true,
      align: 'center',
      render: (dashboard) => (
        <div className="flex flex-col gap-1">
          {dashboard.is_published ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200">
              <svg className="w-1.5 h-1.5 mr-1.5" fill="currentColor" viewBox="0 0 8 8">
                <circle cx={4} cy={4} r={3} />
              </svg>
              Published
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200">
              <svg className="w-1.5 h-1.5 mr-1.5" fill="currentColor" viewBox="0 0 8 8">
                <circle cx={4} cy={4} r={3} />
              </svg>
              Under Development
            </span>
          )}
          {dashboard.is_default && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/20 text-violet-800 dark:text-violet-200">
              <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              Default Home
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'created_by',
      header: 'Created By',
      sortable: true,
      render: (dashboard) => (
        <div className="text-gray-800 dark:text-gray-100">
          {dashboard.creator_name && dashboard.creator_last_name
            ? `${dashboard.creator_name} ${dashboard.creator_last_name}`
            : dashboard.created_by || 'Unknown'}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (dashboard) => (
        <div>
          <div className="text-gray-800 dark:text-gray-100">
            {dashboard.created_at ? new Date(dashboard.created_at).toLocaleDateString() : 'Unknown'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {dashboard.created_at ? new Date(dashboard.created_at).toLocaleTimeString() : ''}
          </div>
        </div>
      ),
    },
    { key: 'actions' },
  ];

  // Define dropdown actions
  const getDropdownActions = (
    dashboard: DashboardListItem
  ): DataTableDropdownAction<DashboardListItem>[] => [
    {
      label: 'Edit Dashboard',
      onClick: handleEditDashboard,
    },
    {
      label: 'Copy ID',
      onClick: (d) => {
        navigator.clipboard.writeText(d.dashboard_id);
      },
    },
    {
      label: 'Preview Dashboard',
      onClick: handlePreviewDashboard,
    },
    // Conditionally include publish/unpublish actions
    ...(dashboard.is_published
      ? [
          {
            label: 'Unpublish Dashboard',
            onClick: handleUnpublishDashboard,
          } as DataTableDropdownAction<DashboardListItem>,
        ]
      : [
          {
            label: 'Publish Dashboard',
            onClick: handlePublishDashboard,
          } as DataTableDropdownAction<DashboardListItem>,
        ]),
    // Only show "Set as Default" option for published dashboards
    ...(dashboard.is_published && !dashboard.is_default
      ? [
          {
            label: 'Set as Default Home Screen',
            onClick: handleSetAsDefault,
          } as DataTableDropdownAction<DashboardListItem>,
        ]
      : []),
    {
      label: 'Delete Dashboard',
      onClick: handleDeleteClick,
      variant: 'danger' as const,
    },
  ];

  // Load dashboards on component mount
  React.useEffect(() => {
    loadDashboards();
  }, [loadDashboards]);

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
                Error loading dashboard definitions
              </h3>
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
              <button
                type="button"
                onClick={() => loadDashboards()}
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
              Dashboards
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

            {/* Create dashboard button */}
            <button
              type="button"
              onClick={handleCreateDashboard}
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
              <span className="max-xs:sr-only">Create Dashboard</span>
            </button>
          </div>
        </div>

        {/* Dashboards Table */}
        <DataTable
          title="All Dashboards"
          data={filteredDashboards}
          columns={columns}
          dropdownActions={getDropdownActions}
          pagination={{ itemsPerPage: 10 }}
          selectionMode="multi"
          isLoading={isLoading}
          searchable={true}
          searchPlaceholder="Search dashboards..."
          exportable={true}
          exportFileName="dashboards"
        />

        {/* Delete Confirmation Modal */}
        {dashboardToDelete && (
          <DeleteDashboardModal
            isOpen={deleteModalOpen}
            setIsOpen={setDeleteModalOpen}
            dashboardName={dashboardToDelete.dashboard_name}
            dashboardId={dashboardToDelete.dashboard_id}
            onConfirm={handleDeleteConfirm}
          />
        )}

        {/* Dashboard Preview Modal */}
        {dashboardToPreview && (
          <DashboardPreviewModal
            isOpen={previewModalOpen}
            setIsOpen={setPreviewModalOpen}
            dashboard={dashboardToPreview.dashboard}
            dashboardCharts={dashboardToPreview.charts}
            title={`Preview: ${dashboardToPreview.dashboard.dashboard_name}`}
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
