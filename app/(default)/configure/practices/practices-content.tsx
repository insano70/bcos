'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Spinner } from '@/components/ui/spinner';
import { ErrorDisplay } from '@/components/error-display';
import { usePracticePermissions } from '@/lib/hooks/use-permissions';
import { usePractices } from '@/lib/hooks/use-practices';
import type { Practice } from '@/lib/types/practice';
import { clientErrorLog } from '@/lib/utils/debug-client';
import { getPracticeStatusColor } from '@/lib/utils/badge-colors';

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
          <Badge color={getPracticeStatusColor(practice.status)} size="sm">
            {practice.status.charAt(0).toUpperCase() + practice.status.slice(1)}
          </Badge>
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
              <Spinner
                sizeClassName="w-6 h-6"
                borderClassName="border-2"
                trackClassName="border-current opacity-25"
                indicatorClassName="border-current opacity-75"
                className="text-blue-600 dark:text-blue-400 mr-3"
              />
              <div>
                <h3 className="text-blue-800 dark:text-blue-200 font-semibold">Session Expired</h3>
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
        <ErrorDisplay
          variant="inline"
          error={errorMessage}
          title="Practices"
          onRetry={() => refetch()}
        />
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
            <Button
              variant="primary"
              disabled={isLoading}
              onClick={() => setIsAddPracticeModalOpen(true)}
              leftIcon={
                <svg className="fill-current shrink-0 xs:hidden" width="16" height="16" viewBox="0 0 16 16">
                  <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
                </svg>
              }
            >
              <span className="max-xs:sr-only">Add Practice</span>
            </Button>
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
