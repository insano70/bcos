'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import DataSourceModal from '@/components/data-source-modal';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import DataSourceConnectionTestModal from '@/components/data-source-connection-test-modal';
import DataTable, {
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-standard';
import DateSelect, { type DateRange } from '@/components/date-select';
import DeleteButton from '@/components/delete-button';
import DeleteDataSourceModal from '@/components/delete-data-source-modal';
import FilterButton, { type ActiveFilter, type FilterGroup } from '@/components/dropdown-filter';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import Toast from '@/components/toast';
import { Spinner } from '@/components/ui/spinner';
import { clientDebugLog } from '@/lib/utils/debug-client';
import { type DataSource, useDataSources } from '@/lib/hooks/use-data-sources';

// Extend DataSource type to include id field for DataTable
type DataSourceWithId = DataSource & { id: string };

export default function DataSourcesContent() {
  // Component rendered (client-side debug)
  clientDebugLog.component('DataSourcesContent: Component rendered');

  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: response, isLoading, error, refetch } = useDataSources({ limit: 50, offset: 0 });

  const rawDataSources = response?.dataSources || [];

  // Add id field for DataTable compatibility
  const dataSources: DataSourceWithId[] = rawDataSources.map((ds) => ({
    ...ds,
    id: ds.data_source_id.toString(),
  }));

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
  ];

  // Apply filters to data sources
  const filteredDataSources = useMemo(() => {
    if (!dataSources) {
      return [];
    }

    return dataSources.filter((dataSource) => {
      // Apply status filters
      if (activeFilters.length > 0) {
        const matchesFilters = activeFilters.every((filter) => {
          const dataSourceValue = dataSource[filter.field as keyof DataSourceWithId];
          return dataSourceValue === filter.comparator;
        });
        if (!matchesFilters) {
          return false;
        }
      }

      // Apply date range filter on created_at
      if (dateRange.startDate || dateRange.endDate) {
        const dataSourceCreatedAt = dataSource.created_at ? new Date(dataSource.created_at) : null;
        if (!dataSourceCreatedAt) {
          return false;
        }

        if (dateRange.startDate && dataSourceCreatedAt < dateRange.startDate) {
          return false;
        }

        if (dateRange.endDate && dataSourceCreatedAt > dateRange.endDate) {
          return false;
        }
      }

      return true;
    });
  }, [dataSources, activeFilters, dateRange]);

  const handleFilterChange = (filters: ActiveFilter[]) => {
    setActiveFilters(filters);
  };

  const handleDateChange = (newDateRange: DateRange) => {
    setDateRange(newDateRange);
  };

  // State for modals and selected items
  const [isAddDataSourceModalOpen, setIsAddDataSourceModalOpen] = useState(false);
  const [isEditDataSourceModalOpen, setIsEditDataSourceModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [selectedDataSource, setSelectedDataSource] = useState<DataSource | null>(null);

  // Toast notification state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Auth state logging (client-side debug)
  clientDebugLog.auth('DataSourcesContent: Auth state', {
    isAuthenticated,
    authLoading,
  });

  // API state logging (client-side debug)
  clientDebugLog.api('DataSourcesContent: API state', {
    hasDataSources: !!dataSources,
    dataSourceCount: dataSources.length,
    isLoading,
    hasError: !!error,
    errorMessage: error?.message,
  });

  // Redirect to login if not authenticated
  if (!authLoading && !isAuthenticated) {
    clientDebugLog.auth('DataSourcesContent: User not authenticated, should redirect');
    return null; // Let the auth provider handle the redirect
  }

  // Loading state
  if (authLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Spinner size="lg" />
          <span className="text-gray-600 dark:text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="text-center text-red-600 dark:text-red-400 py-24">
          Failed to load data sources: {error.message}
        </div>
      </div>
    );
  }

  const handleEditDataSource = (dataSource: DataSourceWithId) => {
    setSelectedDataSource(dataSource);
    setIsEditDataSourceModalOpen(true);
  };

  const handleDeleteDataSource = (dataSource: DataSourceWithId) => {
    setSelectedDataSource(dataSource);
    setIsDeleteModalOpen(true);
  };

  const handleTestDataSource = (dataSource: DataSourceWithId) => {
    setSelectedDataSource(dataSource);
    setIsTestModalOpen(true);
  };

  const showSuccessToast = (message: string) => {
    setToastMessage(message);
    setToastType('success');
    setShowToast(true);
  };

  const _showErrorToast = (message: string) => {
    setToastMessage(message);
    setToastType('error');
    setShowToast(true);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadge = (dataSource: DataSourceWithId) => {
    if (dataSource.is_active) {
      return (
        <div className="inline-flex font-medium bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 rounded-full text-center px-2.5 py-0.5">
          Active
        </div>
      );
    } else {
      return (
        <div className="inline-flex font-medium bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full text-center px-2.5 py-0.5">
          Inactive
        </div>
      );
    }
  };

  // Define table columns
  const columns: DataTableColumn<DataSourceWithId>[] = [
    { key: 'checkbox' },
    {
      key: 'data_source_name',
      header: 'Name',
      sortable: true,
      render: (dataSource) => (
        <div className="flex items-center">
          <div>
            <div className="font-medium text-gray-800 dark:text-gray-100">
              {dataSource.data_source_name}
            </div>
            {dataSource.data_source_description && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {dataSource.data_source_description}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'table_name',
      header: 'Table',
      sortable: true,
      render: (dataSource) => (
        <div>
          <div className="font-medium text-gray-800 dark:text-gray-100">
            {dataSource.table_name}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{dataSource.schema_name}</div>
        </div>
      ),
    },
    {
      key: 'database_type',
      header: 'Database Type',
      sortable: true,
      render: (dataSource) => (
        <div className="text-gray-800 dark:text-gray-100">
          {dataSource.database_type || 'postgresql'}
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      render: (dataSource) => getStatusBadge(dataSource),
    },
    {
      key: 'column_count',
      header: 'Columns',
      sortable: true,
      render: (dataSource) => (
        <div className="text-gray-800 dark:text-gray-100">{dataSource.column_count || 0}</div>
      ),
    },
    {
      key: 'updated_at',
      header: 'Updated',
      sortable: true,
      render: (dataSource) => (
        <div className="text-gray-800 dark:text-gray-100">{formatDate(dataSource.updated_at)}</div>
      ),
    },
    { key: 'actions' },
  ];

  // Define dropdown actions
  const getDropdownActions = (
    _dataSource: DataSourceWithId
  ): DataTableDropdownAction<DataSourceWithId>[] => [
    {
      label: 'Configure Columns',
      icon: (
        <svg
          className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
          viewBox="0 0 16 16"
        >
          <path d="M14 2H2c-.6 0-1 .4-1 1v10c0 .6.4 1 1 1h12c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1zM5 4h2v8H5V4zm4 0h2v8H9V4z" />
        </svg>
      ),
      onClick: (ds) => {
        window.location.href = `/configure/data-sources/${ds.data_source_id}/columns`;
      },
    },
    {
      label: 'Test Connection',
      icon: (
        <svg
          className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
          viewBox="0 0 16 16"
        >
          <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 12c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm1-3H7V4h2v5z" />
        </svg>
      ),
      onClick: handleTestDataSource,
    },
    {
      label: 'Edit',
      icon: (
        <svg
          className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
          viewBox="0 0 16 16"
        >
          <path d="m13.7 2.3-1-1c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4zM10.5 6.5L9 5l.5-.5L11 6l-.5.5zM2 14v-3l6-6 3 3-6 6H2z" />
        </svg>
      ),
      onClick: handleEditDataSource,
    },
    {
      label: 'Delete',
      icon: (
        <svg className="w-4 h-4 fill-current text-red-400 shrink-0" viewBox="0 0 16 16">
          <path d="M5 7h6a1 1 0 0 1 0 2H5a1 1 0 0 1 0-2zM4 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
        </svg>
      ),
      onClick: handleDeleteDataSource,
      variant: 'danger',
    },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Page header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        {/* Left: Title */}
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Data Sources
            {isLoading && (
              <span className="ml-3 inline-flex items-center">
                <Spinner
                  sizeClassName="w-5 h-5"
                  borderClassName="border-2"
                  trackClassName="border-current opacity-25"
                  indicatorClassName="border-current opacity-75"
                  className="text-gray-400"
                />
                <span className="ml-2 text-sm text-gray-500">Loading...</span>
              </span>
            )}
          </h1>
        </div>

        {/* Right: Actions */}
        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          {/* Delete button */}
          <DeleteButton />

          {/* Date filter */}
          <DateSelect onDateChange={handleDateChange} />

          {/* Filter button */}
          <FilterButton align="right" filters={filterGroups} onFilterChange={handleFilterChange} />

          {/* Add data source button - protected by RBAC */}
          <ProtectedComponent permission="data-sources:create:organization">
            <Button
              variant="primary"
              disabled={isLoading}
              onClick={() => setIsAddDataSourceModalOpen(true)}
              leftIcon={
                <svg
                  className="fill-current shrink-0 xs:hidden"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                >
                  <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
                </svg>
              }
            >
              <span className="max-xs:sr-only">Add Data Source</span>
            </Button>
          </ProtectedComponent>
        </div>
      </div>

      {/* Table */}
      <DataTable
        title="All Data Sources"
        data={filteredDataSources}
        columns={columns}
        dropdownActions={getDropdownActions}
        pagination={{ itemsPerPage: 10 }}
        selectionMode="multi"
        isLoading={isLoading}
        searchable={true}
        searchPlaceholder="Search data sources..."
        exportable={true}
        exportFileName="data-sources"
      />

      {/* Add Data Source Modal */}
      <DataSourceModal
        mode="create"
        isOpen={isAddDataSourceModalOpen}
        onClose={() => setIsAddDataSourceModalOpen(false)}
        onSuccess={() => {
          refetch(); // Refresh the data sources list after successful creation
          showSuccessToast('Data source created successfully!');
        }}
      />

      {/* Edit Data Source Modal */}
      <DataSourceModal
        mode="edit"
        isOpen={isEditDataSourceModalOpen}
        onClose={() => setIsEditDataSourceModalOpen(false)}
        onSuccess={() => {
          refetch(); // Refresh the data sources list after successful update
          showSuccessToast('Data source updated successfully!');
        }}
        dataSource={selectedDataSource}
      />

      {/* Connection Test Modal */}
      <DataSourceConnectionTestModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        dataSource={selectedDataSource}
      />

      {/* Delete Data Source Modal */}
      <DeleteDataSourceModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onSuccess={() => {
          refetch(); // Refresh the data sources list after successful deletion
          showSuccessToast('Data source deleted successfully!');
        }}
        dataSource={selectedDataSource}
      />

      {/* Toast Notification */}
      <Toast
        type={toastType}
        open={showToast}
        setOpen={setShowToast}
        className="fixed bottom-4 right-4 z-50"
      >
        {toastMessage}
      </Toast>
    </div>
  );
}
