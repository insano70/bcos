'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import AddWorkItemModal from '@/components/add-work-item-modal';
import { Button } from '@/components/ui/button';
import DataTable, {
  type DataTableBulkAction,
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-standard';
import DateSelect, { type DateRange } from '@/components/date-select';
import FilterButton, { type ActiveFilter, type FilterGroup } from '@/components/dropdown-filter';
import EditWorkItemModal from '@/components/edit-work-item-modal';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import { Spinner } from '@/components/ui/spinner';
import { apiClient } from '@/lib/api/client';
import { useWorkItems, type WorkItem } from '@/lib/hooks/use-work-items';

export default function WorkItemsContent() {
  const router = useRouter();
  const [hierarchyFilter, setHierarchyFilter] = useState<'root_only' | 'all'>('root_only');
  const { data: workItems, isLoading, error, refetch } = useWorkItems({
    show_hierarchy: hierarchyFilter,
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedWorkItem, setSelectedWorkItem] = useState<WorkItem | null>(null);

  // Filter state - using new DropdownFilter pattern
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
        { label: 'All', value: 'all', field: 'status_category' },
        { label: 'Backlog', value: 'backlog', field: 'status_category', comparator: 'backlog' },
        {
          label: 'In Progress',
          value: 'in_progress',
          field: 'status_category',
          comparator: 'in_progress',
        },
        {
          label: 'Completed',
          value: 'completed',
          field: 'status_category',
          comparator: 'completed',
        },
      ],
    },
    {
      group: 'Priority',
      options: [
        { label: 'All', value: 'all', field: 'priority' },
        { label: 'Critical', value: 'critical', field: 'priority', comparator: 'critical' },
        { label: 'High', value: 'high', field: 'priority', comparator: 'high' },
        { label: 'Medium', value: 'medium', field: 'priority', comparator: 'medium' },
        { label: 'Low', value: 'low', field: 'priority', comparator: 'low' },
      ],
    },
    {
      group: 'Hierarchy',
      options: [
        { label: 'Root Items Only', value: 'root_only', field: 'show_hierarchy', comparator: 'root_only' },
        { label: 'All Items', value: 'all', field: 'show_hierarchy', comparator: 'all' },
      ],
    },
  ];

  // Apply filters (optimized single-pass)
  const filteredData = useMemo(() => {
    if (!workItems) return [];

    return workItems.filter((workItem) => {
      // Apply status/priority filters
      if (activeFilters.length > 0) {
        const matchesFilters = activeFilters.every((filter) => {
          const workItemValue = workItem[filter.field as keyof WorkItem];
          return workItemValue === filter.comparator;
        });
        if (!matchesFilters) return false;
      }

      // Apply date range filter on created_at
      if (dateRange.startDate || dateRange.endDate) {
        const workItemCreatedAt = workItem.created_at ? new Date(workItem.created_at) : null;
        if (!workItemCreatedAt) return false;

        if (dateRange.startDate && workItemCreatedAt < dateRange.startDate) return false;
        if (dateRange.endDate && workItemCreatedAt > dateRange.endDate) return false;
      }

      return true;
    });
  }, [workItems, activeFilters, dateRange]);

  const handleFilterChange = useCallback((filters: ActiveFilter[]) => {
    // Handle hierarchy filter separately (applies at query level)
    const hierarchyFilterItem = filters.find((f) => f.field === 'show_hierarchy');
    if (hierarchyFilterItem) {
      setHierarchyFilter(hierarchyFilterItem.comparator as 'root_only' | 'all');
    }

    // Store other filters for client-side filtering
    const otherFilters = filters.filter((f) => f.field !== 'show_hierarchy');
    setActiveFilters(otherFilters);
  }, []);

  const handleDateChange = useCallback((newDateRange: DateRange) => {
    setDateRange(newDateRange);
  }, []);

  // Format helpers
  const formatDate = useCallback((date: string | Date | null) => {
    if (!date) return '-';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const getPriorityColor = useCallback((priority: string) => {
    switch (priority) {
      case 'critical':
        return 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      case 'high':
        return 'text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400';
      case 'medium':
        return 'text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'low':
        return 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
      default:
        return 'text-gray-700 bg-gray-100 dark:bg-gray-900/30 dark:text-gray-400';
    }
  }, []);

  const getStatusColor = useCallback((category: string) => {
    switch (category) {
      case 'completed':
        return 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
      case 'in_progress':
        return 'text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400';
      case 'cancelled':
        return 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      default: // 'backlog' and any unknown categories
        return 'text-gray-700 bg-gray-100 dark:bg-gray-900/30 dark:text-gray-400';
    }
  }, []);

  // Action handlers (memoized)
  const handleEditWorkItem = useCallback((workItem: WorkItem) => {
    setSelectedWorkItem(workItem);
    setIsEditModalOpen(true);
  }, []);

  const handleDeleteWorkItem = useCallback(
    async (workItem: WorkItem) => {
      await apiClient.delete(`/api/work-items/${workItem.id}`);
      refetch();
    },
    [refetch]
  );

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
  const handleBulkDelete = useCallback(
    async (items: WorkItem[]) => {
      await batchPromises(
        items,
        (item) => apiClient.delete(`/api/work-items/${item.id}`),
        5 // Process 5 requests at a time to avoid server overwhelm
      );
      refetch();
    },
    [batchPromises, refetch]
  );

  // Table columns definition (memoized - static configuration)
  const columns: DataTableColumn<WorkItem>[] = useMemo(
    () => [
      { key: 'checkbox' },
      {
        key: 'subject',
        header: 'Subject',
        sortable: true,
        render: (item) => (
          <button
            type="button"
            onClick={() => router.push(`/work/${item.id}`)}
            className="font-medium text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left"
          >
            {item.subject}
          </button>
        ),
      },
      {
        key: 'work_item_type_name',
        header: 'Type',
        sortable: true,
        render: (item) => (
          <div className="text-gray-600 dark:text-gray-400">{item.work_item_type_name}</div>
        ),
      },
      {
        key: 'status_name',
        header: 'Status',
        sortable: true,
        align: 'center',
        render: (item) => (
          <div className="text-center">
            <span
              className={`inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(item.status_category)}`}
            >
              {item.status_name}
            </span>
          </div>
        ),
      },
      {
        key: 'priority',
        header: 'Priority',
        sortable: true,
        align: 'center',
        render: (item) => (
          <div className="text-center">
            <span
              className={`inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(item.priority)}`}
            >
              {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
            </span>
          </div>
        ),
      },
      {
        key: 'assigned_to_name',
        header: 'Assigned To',
        sortable: true,
        render: (item) => (
          <div className="text-gray-600 dark:text-gray-400">
            {item.assigned_to_name || 'Unassigned'}
          </div>
        ),
      },
      {
        key: 'due_date',
        header: 'Due Date',
        sortable: true,
        render: (item) => (
          <div className="text-gray-500 dark:text-gray-400">{formatDate(item.due_date)}</div>
        ),
      },
      {
        key: 'created_at',
        header: 'Created',
        sortable: true,
        render: (item) => (
          <div className="text-left text-gray-500 dark:text-gray-400">
            {formatDate(item.created_at)}
          </div>
        ),
      },
      { key: 'actions' },
    ],
    [formatDate, getPriorityColor, getStatusColor, router]
  );

  // Dropdown actions (memoized to prevent recreation on every render)
  const getDropdownActions = useCallback(
    (_workItem: WorkItem): DataTableDropdownAction<WorkItem>[] => [
      {
        label: 'View Details',
        icon: (
          <svg
            className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
            viewBox="0 0 16 16"
          >
            <path d="M8 2C4.5 2 1.5 4.5 0 8c1.5 3.5 4.5 6 8 6s6.5-2.5 8-6c-1.5-3.5-4.5-6-8-6zm0 10c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
          </svg>
        ),
        onClick: (w) => router.push(`/work/${w.id}`),
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
        onClick: handleEditWorkItem,
      },
      {
        label: 'Delete',
        icon: (
          <svg className="w-4 h-4 fill-current text-red-400 shrink-0" viewBox="0 0 16 16">
            <path d="M5 7h6v6H5V7zm6-3.5V2h-1V.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2H5v1.5H4V4h8v-.5H11zM7 2V1h2v1H7zM6 5v6h1V5H6zm3 0v6h1V5H9z" />
          </svg>
        ),
        onClick: handleDeleteWorkItem,
        variant: 'danger',
        confirmModal: {
          title: (w) => `Delete "${w.subject}"`,
          message: 'This action cannot be undone. The work item and all associated data will be permanently removed.',
          confirmText: 'Delete Work Item',
        },
      },
    ],
    [handleEditWorkItem, handleDeleteWorkItem, router]
  );

  // Bulk actions for mass operations (memoized)
  const bulkActions: DataTableBulkAction<WorkItem>[] = useMemo(
    () => [
      {
        label: 'Delete Selected',
        variant: 'danger',
        onClick: handleBulkDelete,
        confirmModal: {
          title: 'Delete Selected Work Items',
          message: 'This action cannot be undone. All selected work items and their associated data will be permanently removed.',
          confirmText: 'Delete All Selected',
        },
      },
    ],
    [handleBulkDelete]
  );

  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <p className="text-red-600 dark:text-red-400">
            Error loading work items: {error.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Work Items
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

        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          {/* Date Range Filter */}
          <DateSelect onDateChange={handleDateChange} />

          {/* Dropdown Filter (Status + Priority) */}
          <FilterButton align="right" filters={filterGroups} onFilterChange={handleFilterChange} />

          {/* Add Button */}
          <ProtectedComponent
            permissions={[
              'work-items:create:own',
              'work-items:create:organization',
              'work-items:manage:all',
            ]}
            requireAll={false}
          >
            <Button
              variant="primary"
              disabled={isLoading}
              onClick={() => setIsAddModalOpen(true)}
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
              <span className="max-xs:sr-only">Add Work Item</span>
            </Button>
          </ProtectedComponent>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        title="All Work Items"
        data={filteredData}
        columns={columns}
        dropdownActions={getDropdownActions}
        bulkActions={bulkActions}
        pagination={{ itemsPerPage: 10 }}
        selectionMode="multi"
        isLoading={isLoading}
        searchable={true}
        searchPlaceholder="Search work items..."
        exportable={true}
        exportFileName="work-items"
        densityToggle={true}
        resizable={true}
        stickyHeader={true}
      />

      {/* Modals */}
      <AddWorkItemModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={refetch}
      />

      <EditWorkItemModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedWorkItem(null);
        }}
        onSuccess={refetch}
        workItem={selectedWorkItem}
      />
    </div>
  );
}
