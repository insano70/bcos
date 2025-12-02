'use client';

import { useMemo, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import AddPracticeModal from '@/components/add-practice-modal';
import DataTable, {
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-standard';
import DateSelect, { type DateRange } from '@/components/date-select';
import DeleteButton from '@/components/delete-button';
import FilterButton, { type ActiveFilter, type FilterGroup } from '@/components/dropdown-filter';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import Toast from '@/components/toast';
import { usePracticePermissions } from '@/lib/hooks/use-permissions';
import { usePractices } from '@/lib/hooks/use-practices';
import type { Practice } from '@/lib/types/practice';
import { clientErrorLog } from '@/lib/utils/debug-client';

export default function PracticesContent() {
  const { data: practices, isLoading, error, refetch } = usePractices();
  const _practicePermissions = usePracticePermissions();
  const [isAddPracticeModalOpen, setIsAddPracticeModalOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
    period: 'All Time',
  });

  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Define filter configuration
  const filterGroups: FilterGroup[] = [
    {
      group: 'Status',
      options: [
        { label: 'All', value: 'all', field: 'status' },
        { label: 'Active', value: 'active', field: 'status', comparator: 'active' },
        { label: 'Inactive', value: 'inactive', field: 'status', comparator: 'inactive' },
        { label: 'Pending', value: 'pending', field: 'status', comparator: 'pending' },
      ],
    },
  ];

  // Apply filters to practices data
  const filteredPractices = useMemo(() => {
    if (!practices) {
      return [];
    }

    return practices.filter((practice) => {
      // Apply status filters
      if (activeFilters.length > 0) {
        const matchesFilters = activeFilters.every((filter) => {
          const practiceValue = practice[filter.field as keyof Practice];
          return practiceValue === filter.comparator;
        });
        if (!matchesFilters) {
          return false;
        }
      }

      // Apply date range filter on created_at
      if (dateRange.startDate || dateRange.endDate) {
        const practiceCreatedAt = practice.created_at ? new Date(practice.created_at) : null;
        if (!practiceCreatedAt) {
          return false;
        }

        if (dateRange.startDate && practiceCreatedAt < dateRange.startDate) {
          return false;
        }

        if (dateRange.endDate && practiceCreatedAt > dateRange.endDate) {
          return false;
        }
      }

      return true;
    });
  }, [practices, activeFilters, dateRange]);

  const handleFilterChange = (filters: ActiveFilter[]) => {
    setActiveFilters(filters);
  };

  const handleDateChange = (newDateRange: DateRange) => {
    setDateRange(newDateRange);
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return '-';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
      case 'inactive':
        return 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      case 'pending':
        return 'text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
      default:
        return 'text-gray-700 bg-gray-100 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const handleEdit = (_practice: Practice) => {
    window.location.href = `/configure/practices/${_practice.id}`;
  };

  const handlePreview = (_practice: Practice) => {
    window.open(`/template-preview/${_practice.id}`, '_blank', 'noopener,noreferrer');
  };

  const handleCopyDomain = (_practice: Practice) => {
    navigator.clipboard.writeText(_practice.domain);
  };

  const handleActivate = async (_practice: Practice) => {
    try {
      await apiClient.put(`/api/practices/${_practice.id}`, {
        status: 'active',
      });

      // Refresh the practices list to show updated status
      refetch();
      setToastType('success');
      setToastMessage(`${_practice.name} has been activated`);
      setShowToast(true);
    } catch (error) {
      clientErrorLog('Error activating practice', error);
      setToastType('error');
      setToastMessage('Failed to activate practice');
      setShowToast(true);
    }
  };

  // Define table columns
  const columns: DataTableColumn<Practice>[] = [
    { key: 'checkbox' },
    {
      key: 'name',
      header: 'Practice Name',
      sortable: true,
      render: (practice) => (
        <div className="flex items-center">
          <div className="w-10 h-10 shrink-0 mr-2 sm:mr-3">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium text-sm">
              🏥
            </div>
          </div>
          <div className="font-medium text-gray-800 dark:text-gray-100">{practice.name}</div>
        </div>
      ),
    },
    {
      key: 'domain',
      header: 'Domain',
      sortable: true,
      render: (practice) => (
        <div className="text-left">
          <a
            href={`https://${practice.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {practice.domain}
          </a>
        </div>
      ),
    },
    {
      key: 'template_name',
      header: 'Template',
      sortable: true,
      render: (practice) => (
        <div className="text-left text-gray-600 dark:text-gray-400">{practice.template_name}</div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      render: (practice) => (
        <div className="text-center">
          <span
            className={`inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
              practice.status
            )}`}
          >
            {practice.status.charAt(0).toUpperCase() + practice.status.slice(1)}
          </span>
        </div>
      ),
    },
    {
      key: 'owner_email',
      header: 'Owner',
      sortable: true,
      render: (practice) => (
        <div className="text-left text-gray-600 dark:text-gray-400">{practice.owner_email}</div>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (practice) => (
        <div className="text-left text-gray-500 dark:text-gray-400">
          {formatDate(practice.created_at)}
        </div>
      ),
    },
    { key: 'actions' },
  ];

  // Define dropdown actions
  const getDropdownActions = (_practice: Practice): DataTableDropdownAction<Practice>[] => {
    const actions: DataTableDropdownAction<Practice>[] = [
      {
        label: 'Edit Practice',
        icon: (
          <svg
            className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
            viewBox="0 0 16 16"
          >
            <path d="m13.7 2.3-1-1c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4zM10.5 6.5L9 5l.5-.5L11 6l-.5.5zM2 14v-3l6-6 3 3-6 6H2z" />
          </svg>
        ),
        onClick: handleEdit,
      },
      {
        label: 'Preview Site',
        icon: (
          <svg
            className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
            viewBox="0 0 16 16"
          >
            <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zM7 11.4L3.6 8 5 6.6l2 2 4-4L12.4 6 7 11.4z" />
          </svg>
        ),
        onClick: handlePreview,
      },
      {
        label: 'Copy Domain',
        icon: (
          <svg
            className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
            viewBox="0 0 16 16"
          >
            <path d="M11 0H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V1a1 1 0 0 0-1-1zM5 2h6v10H5V2z" />
          </svg>
        ),
        onClick: handleCopyDomain,
      },
    ];

    // Add "Activate" action only if practice is not already active
    if (_practice.status !== 'active') {
      actions.push({
        label: 'Activate',
        icon: (
          <svg
            className="w-4 h-4 fill-current text-green-500 dark:text-green-400 shrink-0"
            viewBox="0 0 16 16"
          >
            <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm3.7 6.7l-4 4c-.2.2-.4.3-.7.3-.3 0-.5-.1-.7-.3l-2-2c-.4-.4-.4-1 0-1.4.4-.4 1-.4 1.4 0l1.3 1.3 3.3-3.3c.4-.4 1-.4 1.4 0 .4.4.4 1 0 1.4z" />
          </svg>
        ),
        onClick: handleActivate,
      });
    }

    return actions;
  };

  if (error) {
    // Check if this is a session expiry error
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    const isSessionExpired = errorMessage.includes('Session expired');

    if (isSessionExpired) {
      // Don't render error UI for session expiry - redirect is happening
      return (
        <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
            <div className="flex items-center">
              <svg
                className="animate-spin h-6 w-6 text-blue-600 dark:text-blue-400 mr-3"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <div>
                <h3 className="text-blue-800 dark:text-blue-200 font-medium">Session Expired</h3>
                <p className="text-blue-600 dark:text-blue-400 text-sm mt-1">
                  Redirecting to login page...
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

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
                Error loading practices
              </h3>
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">{errorMessage}</p>
              <button
                type="button"
                onClick={() => refetch()}
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
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Page header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        {/* Left: Title */}
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Practices
            {isLoading && (
              <span className="ml-3 inline-flex items-center">
                <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="ml-2 text-sm text-gray-500">Loading...</span>
              </span>
            )}
          </h1>
        </div>

        {/* Right: Actions */}
        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          {/* Delete button - only for users who can manage practices */}
          <ProtectedComponent permission="practices:manage:all">
            <DeleteButton />
          </ProtectedComponent>

          {/* Filter and date controls - available to all who can read practices */}
          <ProtectedComponent permissions={['practices:read:own', 'practices:read:all']}>
            <DateSelect onDateChange={handleDateChange} />
            <FilterButton
              align="right"
              filters={filterGroups}
              onFilterChange={handleFilterChange}
            />
          </ProtectedComponent>

          {/* Add practice button - only for super admins */}
          <ProtectedComponent permission="practices:create:all">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setIsAddPracticeModalOpen(true)}
              className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className="fill-current shrink-0 xs:hidden"
                width="16"
                height="16"
                viewBox="0 0 16 16"
              >
                <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
              </svg>
              <span className="max-xs:sr-only">Add Practice</span>
            </button>
          </ProtectedComponent>
        </div>
      </div>

      {/* Table */}
      <DataTable
        title="All Practices"
        data={filteredPractices}
        columns={columns}
        dropdownActions={getDropdownActions}
        pagination={{ itemsPerPage: 10 }}
        selectionMode="multi"
        isLoading={isLoading}
        searchable={true}
        searchPlaceholder="Search practices..."
        exportable={true}
        exportFileName="practices"
      />

      {/* Add Practice Modal */}
      <AddPracticeModal
        isOpen={isAddPracticeModalOpen}
        onClose={() => setIsAddPracticeModalOpen(false)}
        onSuccess={() => {
          // Refresh practices list after successful creation
          refetch();
        }}
      />

      {/* Toast notifications */}
      <Toast type={toastType} open={showToast} setOpen={setShowToast}>
        {toastMessage}
      </Toast>
    </div>
  );
}
