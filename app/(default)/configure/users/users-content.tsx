'use client';

import { useEffect, useMemo, useState } from 'react';
import BulkUserImportModal from '@/components/bulk-user-import-modal';
import UserModal from '@/components/user-modal';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import { Badge } from '@/components/ui/badge';
import DataTable, {
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-standard';
import DateSelect, { type DateRange } from '@/components/date-select';
import DeleteButton from '@/components/delete-button';
import FilterButton, { type ActiveFilter, type FilterGroup } from '@/components/dropdown-filter';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import { apiClient } from '@/lib/api/client';
import { clientDebugLog } from '@/lib/utils/debug-client';
import { type User, useUsers } from '@/lib/hooks/use-users';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { ErrorDisplay } from '@/components/error-display';

export default function UsersContent() {
  // Component rendered (client-side debug)
  clientDebugLog.component('UsersContent: Component rendered');
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: users, isLoading, error, refetch } = useUsers(); // Access token handled by middleware
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
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
      group: 'Email Verification',
      options: [
        { label: 'All', value: 'all', field: 'email_verified' },
        { label: 'Verified', value: 'verified', field: 'email_verified', comparator: true },
        { label: 'Pending', value: 'pending', field: 'email_verified', comparator: false },
      ],
    },
  ];

  // Apply filters to users data
  const filteredUsers = useMemo(() => {
    if (!users) {
      return [];
    }

    return users.filter((user) => {
      // Apply status/email filters
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

        const matchesFilters = Object.entries(filtersByField).every(([field, filters]) => {
          return filters.some((filter) => {
            const userValue = user[field as keyof User];
            return userValue === filter.comparator;
          });
        });

        if (!matchesFilters) {
          return false;
        }
      }

      // Apply date range filter on created_at
      if (dateRange.startDate || dateRange.endDate) {
        const userCreatedAt = user.created_at ? new Date(user.created_at) : null;
        if (!userCreatedAt) {
          return false;
        }

        if (dateRange.startDate && userCreatedAt < dateRange.startDate) {
          return false;
        }

        if (dateRange.endDate && userCreatedAt > dateRange.endDate) {
          return false;
        }
      }

      return true;
    });
  }, [users, activeFilters, dateRange]);

  const handleFilterChange = (filters: ActiveFilter[]) => {
    setActiveFilters(filters);
  };

  const handleDateChange = (newDateRange: DateRange) => {
    setDateRange(newDateRange);
  };

  // Helper functions
  const formatDate = (date: string | Date | null) => {
    if (!date) return '-';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Auth state logging (client-side debug)
  clientDebugLog.auth('UsersContent: Auth state', {
    isAuthenticated,
    authLoading,
    // Access token now handled securely server-side via httpOnly cookies
  });

  // API state logging (client-side debug)
  clientDebugLog.api('UsersContent: API state', {
    hasUsers: !!users,
    isLoading,
    hasError: !!error,
    errorMessage: error?.message,
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    // useEffect trigger logging (client-side debug)
    clientDebugLog.auth('UsersContent: useEffect triggered', { authLoading, isAuthenticated });
    if (!authLoading && !isAuthenticated) {
      // Redirect logging (client-side debug)
      clientDebugLog.auth('UsersContent: Redirecting to login - no authentication');
      const currentPath = window.location.pathname + window.location.search;
      const loginUrl = `/signin?callbackUrl=${encodeURIComponent(currentPath)}`;
      window.location.href = loginUrl;
    } else if (!authLoading && isAuthenticated) {
      // Authentication success logging (client-side debug)
      clientDebugLog.auth('UsersContent: User authenticated, staying on page');
    }
  }, [isAuthenticated, authLoading]);

  const handleEditUser = (_user: User) => {
    setSelectedUser(_user);
    setIsEditUserModalOpen(true);
  };

  const handleToggleActive = async (_user: User) => {
    await apiClient.put(`/api/users/${_user.id}`, {
      data: {
        is_active: !_user.is_active,
      },
    });
    refetch();
  };

  const handleDeleteUser = async (_user: User) => {
    await apiClient.delete(`/api/users/${_user.id}`);
    refetch();
  };

  // Define table columns
  const columns: DataTableColumn<User>[] = [
    { key: 'checkbox' },
    {
      key: 'first_name',
      header: 'Name',
      sortable: true,
      render: (user) => (
        <div className="flex items-center">
          <div className="shrink-0 mr-2 sm:mr-3">
            <Avatar
              size="lg"
              firstName={user.first_name}
              lastName={user.last_name}
              userId={user.id}
            />
          </div>
          <div className="font-medium text-gray-800 dark:text-gray-100">
            {user.first_name} {user.last_name}
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      render: (user) => <div className="text-left">{user.email}</div>,
    },
    {
      key: 'email_verified',
      header: 'Email Status',
      sortable: true,
      align: 'center',
      render: (user) => (
        <div className="text-center">
          <Badge color={user.email_verified ? 'green' : 'yellow'} size="sm">
            {user.email_verified ? 'Verified' : 'Pending'}
          </Badge>
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      align: 'center',
      render: (user) => (
        <div className="text-center">
          <Badge color={user.is_active ? 'green' : 'red'} size="sm">
            {user.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (user) => (
        <div className="text-left text-gray-500 dark:text-gray-400">
          {formatDate(user.created_at)}
        </div>
      ),
    },
    { key: 'actions' },
  ];

  // Define dropdown actions
  const getDropdownActions = (_user: User): DataTableDropdownAction<User>[] => [
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
      onClick: handleEditUser,
    },
    {
      label: (u) => (u.is_active ? 'Inactivate' : 'Activate'),
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
        title: (u) => (u.is_active ? 'Inactivate User' : 'Activate User'),
        message: (u) =>
          u.is_active
            ? 'They will no longer be able to access the system.'
            : 'They will regain access to the system.',
        confirmText: (u) => (u.is_active ? 'Inactivate User' : 'Activate User'),
      },
    },
    {
      label: 'Delete',
      icon: (
        <svg className="w-4 h-4 fill-current text-red-400 shrink-0" viewBox="0 0 16 16">
          <path d="M5 7h6v6H5V7zm6-3.5V2h-1V.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2H5v1.5H4V4h8v-.5H11zM7 2V1h2v1H7zM6 5v6h1V5H6zm3 0v6h1V5H9z" />
        </svg>
      ),
      onClick: handleDeleteUser,
      variant: 'danger',
      confirmModal: {
        title: 'Delete User',
        message: 'This action cannot be undone.',
        confirmText: 'Delete User',
      },
    },
  ];

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Spinner size="lg" />
          <span className="text-gray-600 dark:text-gray-400">Checking authentication...</span>
        </div>
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <ErrorDisplay
          variant="inline"
          error={error}
          title="Users"
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
            Users
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

          {/* Import users button - protected by RBAC */}
          <ProtectedComponent
            permissions={['users:create:organization', 'users:manage:all']}
            requireAll={false}
          >
            <Button
              variant="secondary"
              disabled={isLoading}
              onClick={() => setIsBulkImportModalOpen(true)}
              leftIcon={
                <svg
                  className="fill-current shrink-0 xs:hidden"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                >
                  <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3 9H9v2c0 .6-.4 1-1 1s-1-.4-1-1V9H5c-.6 0-1-.4-1-1s.4-1 1-1h2V5c0-.6.4-1 1-1s1 .4 1 1v2h2c.6 0 1 .4 1 1s-.4 1-1 1z" />
                </svg>
              }
            >
              <span className="max-xs:sr-only">Import Users</span>
            </Button>
          </ProtectedComponent>

          {/* Add user button - protected by RBAC */}
          <ProtectedComponent
            permissions={['users:create:organization', 'users:manage:all']}
            requireAll={false}
          >
            <Button
              variant="primary"
              disabled={isLoading}
              onClick={() => setIsAddUserModalOpen(true)}
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
              <span className="max-xs:sr-only">Add User</span>
            </Button>
          </ProtectedComponent>
        </div>
      </div>

      {/* Table */}
      <DataTable
        title="All Users"
        data={filteredUsers}
        columns={columns}
        dropdownActions={getDropdownActions}
        pagination={{ itemsPerPage: 10 }}
        selectionMode="multi"
        isLoading={isLoading}
        searchable={true}
        searchPlaceholder="Search users..."
        exportable={true}
        exportFileName="users"
      />

      {/* Add User Modal */}
      <UserModal
        mode="create"
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
        onSuccess={() => {
          refetch(); // Refresh the users list after successful creation
        }}
      />

      {/* Edit User Modal */}
      <UserModal
        mode="edit"
        isOpen={isEditUserModalOpen}
        onClose={() => {
          setIsEditUserModalOpen(false);
          setSelectedUser(null);
        }}
        onSuccess={() => {
          refetch(); // Refresh the users list after successful update
        }}
        user={selectedUser}
      />

      {/* Bulk Import Modal */}
      <BulkUserImportModal
        isOpen={isBulkImportModalOpen}
        onClose={() => setIsBulkImportModalOpen(false)}
        onSuccess={() => {
          refetch(); // Refresh the users list after successful import
        }}
      />
    </div>
  );
}
