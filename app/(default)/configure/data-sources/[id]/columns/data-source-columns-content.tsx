'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorDisplay } from '@/components/error-display';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import { getDataTypeBadgeColor, getActiveStatusColor } from '@/lib/utils/badge-colors';
import DataTable, {
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-standard';
import DataSourceColumnModal from '@/components/data-source-column-modal';
import DeleteButton from '@/components/delete-button';
import DeleteDataSourceColumnModal from '@/components/delete-data-source-column-modal';
import FilterButton, { type ActiveFilter, type FilterGroup } from '@/components/dropdown-filter';
import IntrospectDataSourceModal from '@/components/introspect-data-source-modal';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import Toast from '@/components/toast';
import { Spinner } from '@/components/ui/spinner';
import {
  type DataSourceColumn,
  useDataSource,
  useDataSourceColumns,
} from '@/lib/hooks/use-data-sources';

interface DataSourceColumnsContentProps {
  dataSourceId: number;
}

export default function DataSourceColumnsContent({ dataSourceId }: DataSourceColumnsContentProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: dataSourceResponse } = useDataSource(dataSourceId);
  const {
    data: response,
    isLoading,
    error,
    refetch,
  } = useDataSourceColumns(dataSourceId, { limit: 1000, offset: 0 });

  const dataSource = dataSourceResponse?.dataSource;
  const rawColumns = response?.columns || [];

  // Transform columns to add id field for DataTable compatibility
  const columns: DataSourceColumn[] = rawColumns.map((col) => ({
    ...col,
    id: String(col.column_id),
  }));

  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

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
      group: 'Column Type',
      options: [
        { label: 'All', value: 'all', field: 'column_type' },
        { label: 'Measures', value: 'measures', field: 'is_measure', comparator: true },
        { label: 'Dimensions', value: 'dimensions', field: 'is_dimension', comparator: true },
        { label: 'Date Fields', value: 'dates', field: 'is_date_field', comparator: true },
      ],
    },
    {
      group: 'Flags',
      options: [
        { label: 'All', value: 'all', field: 'flags' },
        { label: 'Filterable', value: 'filterable', field: 'is_filterable', comparator: true },
        { label: 'Groupable', value: 'groupable', field: 'is_groupable', comparator: true },
        { label: 'Sensitive', value: 'sensitive', field: 'is_sensitive', comparator: true },
      ],
    },
  ];

  // Apply filters to columns
  const filteredColumns = useMemo(() => {
    if (!columns || activeFilters.length === 0) {
      return columns || [];
    }

    return columns.filter((column) => {
      // Group filters by field
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

      // Check each field - OR within field, AND between fields
      return Object.entries(filtersByField).every(([_field, filters]) => {
        return filters.some((filter) => {
          const columnValue = column[filter.field as keyof DataSourceColumn];
          return columnValue === filter.comparator;
        });
      });
    });
  }, [columns, activeFilters]);

  const handleFilterChange = (filters: ActiveFilter[]) => {
    setActiveFilters(filters);
  };

  // State for modals and selected items
  const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState(false);
  const [isEditColumnModalOpen, setIsEditColumnModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isIntrospectModalOpen, setIsIntrospectModalOpen] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<DataSourceColumn | null>(null);

  // Toast notification state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Redirect to login if not authenticated
  if (!authLoading && !isAuthenticated) {
    return null;
  }

  // Loading state
  if (authLoading || !dataSource) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Spinner size="lg" />
          <span className="text-gray-600 dark:text-gray-400">
            {authLoading ? 'Authenticating...' : 'Loading data source...'}
          </span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <ErrorDisplay
          variant="card"
          error={error}
          title="Columns"
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const handleEditColumn = (_column: DataSourceColumn) => {
    setSelectedColumn(_column);
    setIsEditColumnModalOpen(true);
  };

  const handleDeleteColumn = (_column: DataSourceColumn) => {
    setSelectedColumn(_column);
    setIsDeleteModalOpen(true);
  };

  const showSuccessToast = (message: string) => {
    setToastMessage(message);
    setToastType('success');
    setShowToast(true);
  };

  const getColumnTypeBadge = (_column: DataSourceColumn) => {
    const types: Array<{ label: string; color: 'violet' | 'blue' | 'green' | 'purple' }> = [];
    if (_column.is_measure) types.push({ label: 'Measure', color: 'blue' });
    if (_column.is_dimension) types.push({ label: 'Dimension', color: 'green' });
    if (_column.is_date_field) types.push({ label: 'Date', color: 'purple' });
    if (_column.is_expansion_dimension) types.push({ label: 'Expansion Dimension', color: 'violet' });

    if (types.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1">
        {types.map((type) => (
          <Badge key={type.label} color={type.color} size="sm">
            {type.label}
          </Badge>
        ))}
      </div>
    );
  };

  // Define table columns
  const tableColumns: DataTableColumn<DataSourceColumn>[] = [
    {
      key: 'column_name',
      header: 'Column Name',
      sortable: true,
      render: (column) => (
        <div>
          <div className="font-mono text-gray-900 dark:text-gray-100">{column.column_name}</div>
          {column.column_description && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs truncate">
              {column.column_description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'display_name',
      header: 'Display Name',
      sortable: true,
      render: (column) => (
        <div className="text-gray-900 dark:text-gray-100">{column.display_name}</div>
      ),
    },
    {
      key: 'data_type',
      header: 'Data Type',
      sortable: true,
      render: (column) => (
        <Badge color={getDataTypeBadgeColor(column.data_type)}>
          {column.data_type}
        </Badge>
      ),
    },
    {
      key: 'is_measure',
      header: 'Column Type',
      sortable: false,
      render: (column) => getColumnTypeBadge(column),
    },
    {
      key: 'is_filterable',
      header: 'Flags',
      sortable: false,
      render: (column) => (
        <div className="flex flex-wrap gap-1">
          {column.is_filterable && (
            <Badge color="indigo" size="sm" shape="rounded">Filterable</Badge>
          )}
          {column.is_groupable && (
            <Badge color="teal" size="sm" shape="rounded">Groupable</Badge>
          )}
          {column.is_measure_type && (
            <Badge color="amber" size="sm" shape="rounded">Measure Type</Badge>
          )}
          {column.is_time_period && (
            <Badge color="indigo" size="sm" shape="rounded">Time Period</Badge>
          )}
          {column.is_sensitive && (
            <Badge color="red" size="sm" shape="rounded">Sensitive</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      align: 'center',
      render: (column) => (
        <Badge color={getActiveStatusColor(column.is_active)}>
          {column.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    { key: 'actions' },
  ];

  // Define dropdown actions
  const getDropdownActions = (
    _column: DataSourceColumn
  ): DataTableDropdownAction<DataSourceColumn>[] => [
    {
      label: 'Edit Column',
      icon: (
        <svg
          className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
          viewBox="0 0 16 16"
        >
          <path d="m13.7 2.3-1-1c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4zM10.5 6.5L9 5l.5-.5L11 6l-.5.5zM2 14v-3l6-6 3 3-6 6H2z" />
        </svg>
      ),
      onClick: handleEditColumn,
    },
    {
      label: 'Delete Column',
      icon: (
        <svg className="w-4 h-4 fill-current text-red-400 shrink-0" viewBox="0 0 16 16">
          <path d="M5 7h6v6H5V7zm6-3.5V2h-1V.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2H5v1.5H4V4h8v-.5H11zM7 2V1h2v1H7zM6 5v6h1V5H6zm3 0v6h1V5H9z" />
        </svg>
      ),
      onClick: handleDeleteColumn,
      variant: 'danger',
    },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Page header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        {/* Left: Title and breadcrumb */}
        <div className="mb-4 sm:mb-0">
          <nav className="flex mb-4" aria-label="Breadcrumb">
            <ol className="inline-flex items-center space-x-1 md:space-x-3">
              <li className="inline-flex items-center">
                <Link
                  href="/configure/data-sources"
                  className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-blue-600 dark:text-gray-400 dark:hover:text-white"
                >
                  <svg className="w-3 h-3 mr-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="m19.707 9.293-2-2-7-7a1 1 0 0 0-1.414 0l-7 7-2 2A1 1 0 0 0 1 10h2v6a3 3 0 0 0 3 3h4v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4h4a3 3 0 0 0 3-3v-6h2a1 1 0 0 0 .707-1.707Z" />
                  </svg>
                  Data Sources
                </Link>
              </li>
              <li>
                <div className="flex items-center">
                  <svg
                    className="w-3 h-3 text-gray-400 mx-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="m9 5 7 7-7 7"
                    />
                  </svg>
                  <span className="ml-1 text-sm font-medium text-gray-500 md:text-gray-700 dark:text-gray-400 dark:md:text-gray-400">
                    {dataSource.data_source_name}
                  </span>
                </div>
              </li>
              <li aria-current="page">
                <div className="flex items-center">
                  <svg
                    className="w-3 h-3 text-gray-400 mx-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="m9 5 7 7-7 7"
                    />
                  </svg>
                  <span className="ml-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Columns
                  </span>
                </div>
              </li>
            </ol>
          </nav>

          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Column Configuration
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

          {/* Data source info */}
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Data Source:</span> {dataSource.data_source_name}
            <span className="mx-2">•</span>
            <span className="font-medium">Table:</span> {dataSource.schema_name}.
            {dataSource.table_name}
            <span className="mx-2">•</span>
            <span className="font-medium">Type:</span> {dataSource.database_type || 'postgresql'}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          {/* Delete button */}
          <DeleteButton />

          {/* Filter button */}
          <FilterButton align="right" filters={filterGroups} onFilterChange={handleFilterChange} />

          {/* Introspect button - only show when no columns exist */}
          {columns.length === 0 && (
            <ProtectedComponent permission="data-sources:create:organization">
              <Button
                variant="blue"
                disabled={isLoading}
                onClick={() => setIsIntrospectModalOpen(true)}
                leftIcon={
                  <svg
                    className="fill-current shrink-0 xs:hidden"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                  >
                    <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 12c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm1-3H7V4h2v5z" />
                  </svg>
                }
              >
                <span className="max-xs:sr-only">Introspect</span>
              </Button>
            </ProtectedComponent>
          )}

          {/* Add column button - protected by RBAC */}
          <ProtectedComponent permission="data-sources:create:organization">
            <Button
              variant="primary"
              disabled={isLoading}
              onClick={() => setIsAddColumnModalOpen(true)}
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
              <span className="max-xs:sr-only">Add Column</span>
            </Button>
          </ProtectedComponent>
        </div>
      </div>

      {/* Table */}
      <DataTable
        title="Data Source Columns"
        data={filteredColumns}
        columns={tableColumns}
        dropdownActions={getDropdownActions}
        pagination={{ itemsPerPage: 10 }}
        selectionMode="none"
        isLoading={isLoading}
        searchable={true}
        searchPlaceholder="Search columns..."
        exportable={true}
        exportFileName="data-source-columns"
      />

      {/* Add Column Modal */}
      <DataSourceColumnModal
        mode="create"
        isOpen={isAddColumnModalOpen}
        onClose={() => setIsAddColumnModalOpen(false)}
        onSuccess={() => {
          refetch();
          showSuccessToast('Column added successfully!');
        }}
        dataSourceId={dataSourceId}
      />

      {/* Edit Column Modal */}
      <DataSourceColumnModal
        mode="edit"
        isOpen={isEditColumnModalOpen}
        onClose={() => setIsEditColumnModalOpen(false)}
        onSuccess={() => {
          refetch();
          showSuccessToast('Column updated successfully!');
        }}
        column={selectedColumn}
        dataSourceId={dataSourceId}
      />

      {/* Delete Column Modal */}
      <DeleteDataSourceColumnModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onSuccess={() => {
          refetch();
          showSuccessToast('Column deleted successfully!');
        }}
        column={selectedColumn}
        dataSourceId={dataSourceId}
      />

      {/* Introspect Data Source Modal */}
      <IntrospectDataSourceModal
        isOpen={isIntrospectModalOpen}
        onClose={() => setIsIntrospectModalOpen(false)}
        onSuccess={() => {
          refetch();
          showSuccessToast('Columns introspected successfully!');
        }}
        dataSource={dataSource}
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
