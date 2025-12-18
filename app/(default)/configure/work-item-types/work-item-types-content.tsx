'use client';

import { useCallback, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import WorkItemTypeModal from '@/components/work-item-type-modal';
import DataTable, {
  type DataTableBulkAction,
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-standard';
import DateSelect, { type DateRange } from '@/components/date-select';
import FilterButton, { type ActiveFilter, type FilterGroup } from '@/components/dropdown-filter';
import ManageRelationshipsModal from '@/components/manage-relationships-modal';
import ManageStatusesModal from '@/components/manage-statuses-modal';
import ManageWorkItemFieldsModal from '@/components/manage-work-item-fields-modal';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import { Spinner } from '@/components/ui/spinner';
import WorkflowVisualizationModal from '@/components/workflow-visualization-modal';
import { apiClient } from '@/lib/api/client';
import { useWorkItemTypes, type WorkItemType } from '@/lib/hooks/use-work-item-types';
import { getActiveStatusColor } from '@/lib/utils/badge-colors';

export default function WorkItemTypesContent() {
  const { data: workItemTypes, isLoading, error, refetch } = useWorkItemTypes();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isManageStatusesOpen, setIsManageStatusesOpen] = useState(false);
  const [isManageFieldsOpen, setIsManageFieldsOpen] = useState(false);
  const [isManageRelationshipsOpen, setIsManageRelationshipsOpen] = useState(false);
  const [isWorkflowOpen, setIsWorkflowOpen] = useState(false);
  const [selectedWorkItemType, setSelectedWorkItemType] = useState<WorkItemType | null>(null);

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
    if (!workItemTypes) return [];

    return workItemTypes.filter((item) => {
      // Status filter
      if (statusFilter === 'active' && item.is_active !== true) return false;
      if (statusFilter === 'inactive' && item.is_active !== false) return false;

      // Date filter
      if (dateRange?.startDate && new Date(item.created_at) < dateRange.startDate) return false;

      return true;
    });
  }, [workItemTypes, statusFilter, dateRange]);

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
  const handleEditWorkItemType = useCallback((workItemType: WorkItemType) => {
    setSelectedWorkItemType(workItemType);
    setIsEditModalOpen(true);
  }, []);

  const handleToggleActive = useCallback(
    async (workItemType: WorkItemType) => {
      await apiClient.patch(`/api/work-item-types/${workItemType.id}`, {
        is_active: !workItemType.is_active,
      });
      refetch();
    },
    [refetch]
  );

  const handleDeleteWorkItemType = useCallback(
    async (workItemType: WorkItemType) => {
      await apiClient.delete(`/api/work-item-types/${workItemType.id}`);
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
    async (items: WorkItemType[]) => {
      await batchPromises(
        items,
        (item) =>
          apiClient.patch(`/api/work-item-types/${item.id}`, {
            is_active: true,
          }),
        5 // Process 5 requests at a time to avoid server overwhelm
      );
      await refetch();
    },
    [batchPromises, refetch]
  );

  const handleBulkInactivate = useCallback(
    async (items: WorkItemType[]) => {
      await batchPromises(
        items,
        (item) =>
          apiClient.patch(`/api/work-item-types/${item.id}`, {
            is_active: false,
          }),
        5
      );
      await refetch();
    },
    [batchPromises, refetch]
  );

  const handleBulkDelete = useCallback(
    async (items: WorkItemType[]) => {
      await batchPromises(items, (item) => apiClient.delete(`/api/work-item-types/${item.id}`), 5);
      await refetch();
    },
    [batchPromises, refetch]
  );

  // Table columns definition (memoized - static configuration)
  const columns: DataTableColumn<WorkItemType>[] = useMemo(
    () => [
      { key: 'checkbox' },
      {
        key: 'name',
        header: 'Name',
        sortable: true,
        render: (type) => (
          <div className="flex items-center gap-2">
            {type.icon && <span className="text-lg">{type.icon}</span>}
            <div className="font-medium text-gray-800 dark:text-gray-100">{type.name}</div>
          </div>
        ),
      },
      {
        key: 'description',
        header: 'Description',
        render: (type) => (
          <div className="text-gray-600 dark:text-gray-400 max-w-md truncate">
            {type.description || '-'}
          </div>
        ),
      },
      {
        key: 'organization_name',
        header: 'Organization',
        sortable: true,
        render: (type) => (
          <div className="text-gray-600 dark:text-gray-400">
            {type.organization_name || 'Global'}
          </div>
        ),
      },
      {
        key: 'is_active',
        header: 'Status',
        sortable: true,
        align: 'center',
        render: (type) => (
          <div className="text-center">
            <Badge color={getActiveStatusColor(type.is_active)} size="sm">
              {type.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        ),
      },
      {
        key: 'created_at',
        header: 'Created',
        sortable: true,
        render: (type) => (
          <div className="text-left text-gray-500 dark:text-gray-400">
            {formatDate(type.created_at)}
          </div>
        ),
      },
      { key: 'actions' },
    ],
    [formatDate]
  );

  const handleManageStatuses = useCallback((workItemType: WorkItemType) => {
    setSelectedWorkItemType(workItemType);
    setIsManageStatusesOpen(true);
  }, []);

  const handleManageFields = useCallback((workItemType: WorkItemType) => {
    setSelectedWorkItemType(workItemType);
    setIsManageFieldsOpen(true);
  }, []);

  const handleManageRelationships = useCallback((workItemType: WorkItemType) => {
    setSelectedWorkItemType(workItemType);
    setIsManageRelationshipsOpen(true);
  }, []);

  const handleViewWorkflow = useCallback((workItemType: WorkItemType) => {
    setSelectedWorkItemType(workItemType);
    setIsWorkflowOpen(true);
  }, []);

  // Dropdown actions (memoized to prevent recreation on every render)
  const getDropdownActions = useCallback(
    (workItemType: WorkItemType): DataTableDropdownAction<WorkItemType>[] => {
      const actions: DataTableDropdownAction<WorkItemType>[] = [];

      // Manage Fields - available for all types
      actions.push({
        label: 'Manage Custom Fields',
        icon: (
          <svg
            className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
            viewBox="0 0 16 16"
          >
            <path d="M9 12h6v6H9v-6zm-9 0h6v6H0v-6zm0-9h6v6H0V3zm9 0h6v6H9V3z" />
          </svg>
        ),
        onClick: handleManageFields,
      });

      // Manage Statuses - available for all types
      actions.push({
        label: 'Manage Statuses',
        icon: (
          <svg
            className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
            viewBox="0 0 16 16"
          >
            <path d="M0 3a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H1a1 1 0 0 1-1-1zm0 5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H1a1 1 0 0 1-1-1zm1 4a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2H1z" />
          </svg>
        ),
        onClick: handleManageStatuses,
      });

      // Manage Relationships - available for all types
      actions.push({
        label: 'Manage Relationships',
        icon: (
          <svg
            className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
            viewBox="0 0 16 16"
          >
            <path d="M13 10V3L4 14h7v-4zm-9 0V3L0 14h4v-4zm9-7V0l-4 4h4z" />
          </svg>
        ),
        onClick: handleManageRelationships,
      });

      // View Workflow - available for all types
      actions.push({
        label: 'View Workflow',
        icon: (
          <svg
            className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
            viewBox="0 0 16 16"
          >
            <path d="M14 0H2C.9 0 0 .9 0 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V2c0-1.1-.9-2-2-2zM5.5 12c-.3 0-.5-.2-.5-.5v-7c0-.3.2-.5.5-.5s.5.2.5.5v7c0 .3-.2.5-.5.5zm5 0c-.3 0-.5-.2-.5-.5v-7c0-.3.2-.5.5-.5s.5.2.5.5v7c0 .3-.2.5-.5.5z" />
          </svg>
        ),
        onClick: handleViewWorkflow,
      });

      // Only allow editing organization types (not global)
      if (workItemType.organization_id) {
        actions.push({
          label: 'Edit',
          icon: (
            <svg
              className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
              viewBox="0 0 16 16"
            >
              <path d="m13.7 2.3-1-1c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4zM10.5 6.5L9 5l.5-.5L11 6l-.5.5zM2 14v-3l6-6 3 3-6 6H2z" />
            </svg>
          ),
          onClick: handleEditWorkItemType,
        });
        actions.push({
          label: (t) => (t.is_active ? 'Inactivate' : 'Activate'),
          icon: (
            <svg
              className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
              viewBox="0 0 16 16"
            >
              <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 12c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm1-3H7V4h2v5z" />
            </svg>
          ),
          onClick: handleToggleActive,
          confirmModal: {
            title: (t) => (t.is_active ? 'Inactivate Work Item Type' : 'Activate Work Item Type'),
            message: (t) =>
              t.is_active
                ? `Are you sure you want to inactivate ${t.name}?`
                : `Are you sure you want to activate ${t.name}?`,
            confirmText: (t) => (t.is_active ? 'Inactivate' : 'Activate'),
          },
        });
        actions.push({
          label: 'Delete',
          icon: (
            <svg className="w-4 h-4 fill-current text-red-400 shrink-0" viewBox="0 0 16 16">
              <path d="M5 7h6v6H5V7zm6-3.5V2h-1V.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2H5v1.5H4V4h8v-.5H11zM7 2V1h2v1H7zM6 5v6h1V5H6zm3 0v6h1V5H9z" />
            </svg>
          ),
          onClick: handleDeleteWorkItemType,
          variant: 'danger',
          confirmModal: {
            title: 'Delete Work Item Type',
            message: (t) =>
              `Are you sure you want to delete ${t.name}? This action cannot be undone.`,
            confirmText: 'Delete',
          },
        });
      }

      return actions;
    },
    [
      handleManageFields,
      handleManageStatuses,
      handleManageRelationships,
      handleViewWorkflow,
      handleEditWorkItemType,
      handleToggleActive,
      handleDeleteWorkItemType,
    ]
  );

  // Bulk actions for mass operations (memoized)
  const bulkActions: DataTableBulkAction<WorkItemType>[] = useMemo(
    () => [
      {
        label: 'Activate Selected',
        onClick: handleBulkActivate,
        confirmModal: {
          title: 'Activate Selected',
          message: 'Are you sure you want to activate all selected items?',
          confirmText: 'Activate',
        },
      },
      {
        label: 'Inactivate Selected',
        onClick: handleBulkInactivate,
        confirmModal: {
          title: 'Inactivate Selected',
          message: 'Are you sure you want to inactivate all selected items?',
          confirmText: 'Inactivate',
        },
      },
      {
        label: 'Delete Selected',
        variant: 'danger',
        onClick: handleBulkDelete,
        confirmModal: {
          title: 'Delete Selected',
          message: 'Are you sure you want to delete all selected items? This action cannot be undone.',
          confirmText: 'Delete',
        },
      },
    ],
    [handleBulkActivate, handleBulkInactivate, handleBulkDelete]
  );

  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4">
          <p className="text-red-800 dark:text-red-200">
            Error loading work item types. Please try again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Page header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-5">
        {/* Left: Title */}
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Work Item Types
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
          {/* Date range filter */}
          <DateSelect onDateChange={handleDateChange} />

          {/* Filter button */}
          <FilterButton filters={filterGroups} onFilterChange={handleFilterChange} />

          {/* Add type button */}
          <ProtectedComponent permission="work-items:manage:organization">
            <Button
              variant="primary"
              onClick={() => setIsAddModalOpen(true)}
              leftIcon={
                <svg className="fill-current shrink-0" width="16" height="16" viewBox="0 0 16 16">
                  <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
                </svg>
              }
            >
              <span className="hidden xs:block">Add Work Item Type</span>
            </Button>
          </ProtectedComponent>
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        title="Work Item Types"
        columns={columns}
        data={filteredData}
        isLoading={isLoading}
        dropdownActions={getDropdownActions}
        bulkActions={bulkActions}
        searchable={true}
        searchPlaceholder="Search work item types..."
      />

      {/* Add Modal */}
      <WorkItemTypeModal
        mode="create"
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => {
          setIsAddModalOpen(false);
          refetch();
        }}
      />

      {/* Edit Modal */}
      <WorkItemTypeModal
        mode="edit"
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedWorkItemType(null);
        }}
        onSuccess={() => {
          setIsEditModalOpen(false);
          setSelectedWorkItemType(null);
          refetch();
        }}
        workItemType={selectedWorkItemType}
      />

      {/* Manage Custom Fields Modal */}
      {selectedWorkItemType && (
        <ManageWorkItemFieldsModal
          isOpen={isManageFieldsOpen}
          onClose={() => {
            setIsManageFieldsOpen(false);
            setSelectedWorkItemType(null);
          }}
          workItemTypeId={selectedWorkItemType.id}
          workItemTypeName={selectedWorkItemType.name}
        />
      )}

      {/* Manage Statuses Modal */}
      {selectedWorkItemType && (
        <ManageStatusesModal
          isOpen={isManageStatusesOpen}
          onClose={() => {
            setIsManageStatusesOpen(false);
            setSelectedWorkItemType(null);
          }}
          workItemTypeId={selectedWorkItemType.id}
          workItemTypeName={selectedWorkItemType.name}
        />
      )}

      {/* Manage Relationships Modal */}
      {selectedWorkItemType && (
        <ManageRelationshipsModal
          isOpen={isManageRelationshipsOpen}
          onClose={() => {
            setIsManageRelationshipsOpen(false);
            setSelectedWorkItemType(null);
          }}
          workItemTypeId={selectedWorkItemType.id}
          workItemTypeName={selectedWorkItemType.name}
        />
      )}

      {/* Workflow Visualization Modal */}
      {selectedWorkItemType && (
        <WorkflowVisualizationModal
          isOpen={isWorkflowOpen}
          onClose={() => {
            setIsWorkflowOpen(false);
            setSelectedWorkItemType(null);
          }}
          workItemTypeId={selectedWorkItemType.id}
          workItemTypeName={selectedWorkItemType.name}
          organizationId={selectedWorkItemType.organization_id || ''}
        />
      )}
    </div>
  );
}
