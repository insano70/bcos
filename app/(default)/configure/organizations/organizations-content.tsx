'use client';

import { useCallback, useMemo, useState } from 'react';
import OrganizationModal from '@/components/organization-modal';
import DataTable, {
  type DataTableBulkAction,
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-standard';
import DateSelect, { type DateRange } from '@/components/date-select';
import FilterButton, { type ActiveFilter, type FilterGroup } from '@/components/dropdown-filter';
import OrganizationUsersModal from '@/components/organization-users-modal';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import { apiClient } from '@/lib/api/client';
import { type Organization, useOrganizations } from '@/lib/hooks/use-organizations';

export default function OrganizationsContent() {
  // Request counts for admin list view (displays member_count column)
  const { data: organizations, isLoading, error, refetch } = useOrganizations({ includeCounts: true });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isManageUsersModalOpen, setIsManageUsersModalOpen] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  // Handlers for filters
  const handleDateChange = useCallback((newDateRange: DateRange) => {
    setDateRange(newDateRange);
  }, []);

  const handleFilterChange = useCallback((activeFilters: ActiveFilter[]) => {
    const statusActiveFilter = activeFilters.find((f) => f.field === 'status');
    if (statusActiveFilter) {
      setStatusFilter(statusActiveFilter.value as 'all' | 'active' | 'inactive');
    } else {
      setStatusFilter('all');
    }
  }, []);

  // Define filter groups for the dropdown
  const filterGroups: FilterGroup[] = useMemo(
    () => [
      {
        group: 'Status',
        options: [
          { label: 'All', value: 'all', field: 'status', comparator: true },
          { label: 'Active', value: 'active', field: 'status', comparator: true },
          { label: 'Inactive', value: 'inactive', field: 'status', comparator: false },
        ],
      },
    ],
    []
  );

  // Apply filters to data (optimized with single pass)
  const filteredData = useMemo(() => {
    if (!organizations) return [];

    // Single pass filter - more efficient than multiple passes
    return organizations.filter((item) => {
      // Status filter
      if (statusFilter === 'active' && item.is_active !== true) return false;
      if (statusFilter === 'inactive' && item.is_active !== false) return false;

      // Date filter
      if (dateRange?.startDate && new Date(item.created_at) < dateRange.startDate) return false;

      return true;
    });
  }, [organizations, statusFilter, dateRange]);

  const formatDate = useCallback((date: string | Date | null) => {
    if (!date) return '-';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  // Row action handlers (memoized for performance)
  const handleEditOrganization = useCallback((organization: Organization) => {
    setSelectedOrganization(organization);
    setIsEditModalOpen(true);
  }, []);

  const handleManageUsers = useCallback((organization: Organization) => {
    setSelectedOrganization(organization);
    setIsManageUsersModalOpen(true);
  }, []);

  const handleToggleActive = useCallback(
    async (organization: Organization) => {
      await apiClient.put(`/api/organizations/${organization.id}`, {
        data: {
          is_active: !organization.is_active,
        },
      });
      refetch();
    },
    [refetch]
  );

  const handleDeleteOrganization = useCallback(
    async (organization: Organization) => {
      await apiClient.delete(`/api/organizations/${organization.id}`);
      refetch();
    },
    [refetch]
  );

  // Bulk action handlers
  // Utility: Batch promises to prevent overwhelming the server (CRITICAL OPTIMIZATION)
  const batchPromises = useCallback(
    async <T, R>(items: T[], fn: (item: T) => Promise<R>, batchSize = 5): Promise<R[]> => {
      const results: R[] = [];
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
      }
      return results;
    },
    []
  );

  // Bulk action handlers (optimized with batching + useCallback)
  const handleBulkActivate = useCallback(
    async (items: Organization[]) => {
      await batchPromises(
        items,
        (item) =>
          apiClient.put(`/api/organizations/${item.id}`, {
            data: { is_active: true },
          }),
        5 // Process 5 requests at a time to avoid server overwhelm
      );
      refetch();
    },
    [batchPromises, refetch]
  );

  const handleBulkInactivate = useCallback(
    async (items: Organization[]) => {
      await batchPromises(
        items,
        (item) =>
          apiClient.put(`/api/organizations/${item.id}`, {
            data: { is_active: false },
          }),
        5
      );
      refetch();
    },
    [batchPromises, refetch]
  );

  const handleBulkDelete = useCallback(
    async (items: Organization[]) => {
      await batchPromises(items, (item) => apiClient.delete(`/api/organizations/${item.id}`), 5);
      refetch();
    },
    [batchPromises, refetch]
  );

  // Table columns definition (memoized - static configuration)
  const columns: DataTableColumn<Organization>[] = useMemo(
    () => [
      { key: 'checkbox' },
      {
        key: 'name',
        header: 'Name',
        sortable: true,
        render: (organization) => (
          <div className="font-medium text-gray-800 dark:text-gray-100">{organization.name}</div>
        ),
      },
      {
        key: 'slug',
        header: 'Slug',
        sortable: true,
        render: (organization) => (
          <div className="text-gray-600 dark:text-gray-400">{organization.slug}</div>
        ),
      },
      {
        key: 'member_count',
        header: 'Members',
        sortable: true,
        align: 'center',
        render: (organization) => (
          <div className="text-center text-gray-600 dark:text-gray-400">
            {organization.member_count ?? 0}
          </div>
        ),
      },
      {
        key: 'is_active',
        header: 'Status',
        sortable: true,
        align: 'center',
        render: (organization) => (
          <div className="text-center">
            {organization.is_active ? (
              <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                Active
              </span>
            ) : (
              <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded-full">
                Inactive
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'created_at',
        header: 'Created',
        sortable: true,
        render: (organization) => (
          <div className="text-left text-gray-500 dark:text-gray-400">
            {formatDate(organization.created_at)}
          </div>
        ),
      },
      { key: 'actions' },
    ],
    [formatDate]
  ); // formatDate dependency

  // Dropdown actions (memoized to prevent recreation on every render)
  const getDropdownActions = useCallback(
    (_organization: Organization): DataTableDropdownAction<Organization>[] => [
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
        onClick: handleEditOrganization,
      },
      {
        label: 'Manage Users',
        icon: (
          <svg
            className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
            viewBox="0 0 16 16"
          >
            <path d="M11 0c1.3 0 2.6.5 3.5 1.5 1 .9 1.5 2.2 1.5 3.5 0 1.3-.5 2.6-1.4 3.5l-1.2 1.2c-.2.2-.5.3-.7.3-.2 0-.5-.1-.7-.3-.2-.2-.3-.4-.3-.7 0-.2.1-.5.3-.7l1.2-1.2c.6-.5.9-1.3.9-2.1s-.3-1.6-.9-2.2C12 1.7 11.3 1.3 10.5 1.3s-1.6.3-2.1.9c-.6.6-.9 1.3-.9 2.1 0 .2-.1.5-.3.7-.2.2-.4.3-.7.3-.2 0-.5-.1-.7-.3-.2-.2-.3-.4-.3-.7 0-1.3.5-2.6 1.5-3.5C8 .5 9.3 0 11 0zM5.5 1c1.3 0 2.6.5 3.5 1.5l.7.7c.2.2.3.5.3.7 0 .2-.1.5-.3.7-.2.2-.4.3-.7.3-.2 0-.5-.1-.7-.3l-.7-.7c-.6-.6-1.3-.9-2.1-.9s-1.6.3-2.1.9c-.6.5-.9 1.3-.9 2.1s.3 1.6.9 2.2c.5.5 1.3.9 2.1.9.2 0 .5.1.7.3.2.2.3.4.3.7 0 .2-.1.5-.3.7-.2.2-.4.3-.7.3-1.3 0-2.6-.5-3.5-1.4C.5 8.1 0 6.8 0 5.5 0 4.2.5 2.9 1.5 2 2.4.5 3.7 0 5.5 0z" />
          </svg>
        ),
        onClick: handleManageUsers,
      },
      {
        label: (o) => (o.is_active ? 'Inactivate' : 'Activate'),
        icon: (
          <svg
            className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
            viewBox="0 0 16 16"
          >
            <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 12c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm1-3H7V4h2v5z" />
          </svg>
        ),
        onClick: handleToggleActive,
        confirm: (o) =>
          o.is_active
            ? `Are you sure you want to inactivate ${o.name}?`
            : `Are you sure you want to activate ${o.name}?`,
      },
      {
        label: 'Delete',
        icon: (
          <svg className="w-4 h-4 fill-current text-red-400 shrink-0" viewBox="0 0 16 16">
            <path d="M5 7h6v6H5V7zm6-3.5V2h-1V.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2H5v1.5H4V4h8v-.5H11zM7 2V1h2v1H7zM6 5v6h1V5H6zm3 0v6h1V5H9z" />
          </svg>
        ),
        onClick: handleDeleteOrganization,
        variant: 'danger',
        confirm: (o) => `Are you sure you want to delete ${o.name}? This action cannot be undone.`,
      },
    ],
    [handleEditOrganization, handleManageUsers, handleToggleActive, handleDeleteOrganization]
  );

  // Bulk actions for mass operations (memoized)
  const bulkActions: DataTableBulkAction<Organization>[] = useMemo(
    () => [
      {
        label: 'Activate Selected',
        onClick: handleBulkActivate,
        confirm: 'Activate all selected items?',
      },
      {
        label: 'Inactivate Selected',
        onClick: handleBulkInactivate,
        confirm: 'Inactivate all selected items?',
      },
      {
        label: 'Delete Selected',
        variant: 'danger',
        onClick: handleBulkDelete,
        confirm: 'Delete all selected items? This action cannot be undone.',
      },
    ],
    [handleBulkActivate, handleBulkInactivate, handleBulkDelete]
  );

  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <p className="text-red-600 dark:text-red-400">
            Error loading organizations: {error.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Organizations
          </h1>
        </div>

        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          {/* Date Range Filter */}
          <DateSelect onDateChange={handleDateChange} />

          {/* Status Filter */}
          <FilterButton filters={filterGroups} onFilterChange={handleFilterChange} align="right" />

          {/* Add Button */}
          <ProtectedComponent
            permissions={['organizations:create:organization', 'organizations:create:all']}
            requireAll={false}
          >
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setIsAddModalOpen(true)}
              className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
            >
              <svg
                className="fill-current shrink-0 xs:hidden"
                width="16"
                height="16"
                viewBox="0 0 16 16"
              >
                <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
              </svg>
              <span className="max-xs:sr-only">Add Organization</span>
            </button>
          </ProtectedComponent>
        </div>
      </div>

      <DataTable
        title="All Organizations"
        data={filteredData}
        columns={columns}
        dropdownActions={getDropdownActions}
        bulkActions={bulkActions}
        pagination={{ itemsPerPage: 10 }}
        selectionMode="multi"
        isLoading={isLoading}
        searchable={true}
        searchPlaceholder="Search organizations..."
        exportable={true}
        exportFileName="organizations"
        densityToggle={true}
        resizable={true}
        stickyHeader={true}
      />

      <OrganizationModal
        mode="create"
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={refetch}
      />

      <OrganizationModal
        mode="edit"
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={refetch}
        organization={selectedOrganization}
      />

      <OrganizationUsersModal
        isOpen={isManageUsersModalOpen}
        onClose={() => setIsManageUsersModalOpen(false)}
        onSuccess={refetch}
        organization={selectedOrganization}
      />
    </div>
  );
}
