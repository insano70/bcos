'use client';

import { useEffect, useState } from 'react';
import AddUserModal from '@/components/add-user-modal';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import DateSelect from '@/components/date-select';
import DeleteButton from '@/components/delete-button';
import FilterButton from '@/components/dropdown-filter';
import EditUserModal from '@/components/edit-user-modal';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import { type User, useUsers } from '@/lib/hooks/use-users';
import DataTableEnhanced, {
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-enhanced';
import { apiClient } from '@/lib/api/client';

export default function UsersContent() {
  // Component rendered (client-side debug)
  if (process.env.NODE_ENV === 'development') {
    console.log('👥 UsersContent: Component rendered');
  }
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: users, isLoading, error, refetch } = useUsers(); // Access token handled by middleware
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

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
  if (process.env.NODE_ENV === 'development') {
    console.log('👤 UsersContent: Auth state -', {
      isAuthenticated,
      authLoading,
      // Access token now handled securely server-side via httpOnly cookies
    });
  }

  // API state logging (client-side debug)
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 UsersContent: API state -', {
      hasUsers: !!users,
      isLoading,
      hasError: !!error,
      errorMessage: error?.message,
    });
  }

  // Redirect to login if not authenticated
  useEffect(() => {
    // useEffect trigger logging (client-side debug)
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 UsersContent: useEffect triggered -', { authLoading, isAuthenticated });
    }
    if (!authLoading && !isAuthenticated) {
      // Redirect logging (client-side debug)
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 UsersContent: Redirecting to login - no authentication');
      }
      const currentPath = window.location.pathname + window.location.search;
      const loginUrl = `/signin?callbackUrl=${encodeURIComponent(currentPath)}`;
      window.location.href = loginUrl;
    } else if (!authLoading && isAuthenticated) {
      // Authentication success logging (client-side debug)
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ UsersContent: User authenticated, staying on page');
      }
    }
  }, [isAuthenticated, authLoading]);

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setIsEditUserModalOpen(true);
  };

  const handleToggleActive = async (user: User) => {
    await apiClient.put(`/api/users/${user.id}`, {
      data: {
        is_active: !user.is_active,
      },
    });
    refetch();
  };

  const handleDeleteUser = async (user: User) => {
    await apiClient.delete(`/api/users/${user.id}`);
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
          <div className="w-10 h-10 shrink-0 mr-2 sm:mr-3">
            <div className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center text-white font-medium">
              {user.first_name.charAt(0)}
              {user.last_name.charAt(0)}
            </div>
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
          {user.email_verified === true ? (
            <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 rounded-full">
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full">
              Pending
            </span>
          )}
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
          {user.is_active === true ? (
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
      render: (user) => (
        <div className="text-left text-gray-500 dark:text-gray-400">
          {formatDate(user.created_at)}
        </div>
      ),
    },
    { key: 'actions' },
  ];

  // Define dropdown actions
  const getDropdownActions = (user: User): DataTableDropdownAction<User>[] => [
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
      confirm: (u) =>
        u.is_active
          ? `Are you sure you want to inactivate ${u.first_name} ${u.last_name}? They will no longer be able to access the system.`
          : `Are you sure you want to activate ${u.first_name} ${u.last_name}?`,
    },
    {
      label: 'Delete',
      icon: (
        <svg
          className="w-4 h-4 fill-current text-red-400 shrink-0"
          viewBox="0 0 16 16"
        >
          <path d="M5 7h6v6H5V7zm6-3.5V2h-1V.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2H5v1.5H4V4h8v-.5H11zM7 2V1h2v1H7zM6 5v6h1V5H6zm3 0v6h1V5H9z" />
        </svg>
      ),
      onClick: handleDeleteUser,
      variant: 'danger',
      confirm: (u) =>
        `Are you sure you want to delete ${u.first_name} ${u.last_name}? This action cannot be undone.`,
    },
  ];

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-8">
          <div className="flex items-center justify-center">
            <svg className="animate-spin h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24">
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
            <span className="ml-3 text-gray-600 dark:text-gray-400">
              Checking authentication...
            </span>
          </div>
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
              <h3 className="text-red-800 dark:text-red-200 font-medium">Error loading users</h3>
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
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
            Users
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
          {/* Delete button */}
          <DeleteButton />

          {/* Dropdown */}
          <DateSelect />

          {/* Filter button */}
          <FilterButton align="right" />

          {/* Add user button - protected by RBAC */}
          <ProtectedComponent
            permissions={['users:create:organization', 'users:manage:all']}
            requireAll={false}
          >
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setIsAddUserModalOpen(true)}
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
              <span className="max-xs:sr-only">Add User</span>
            </button>
          </ProtectedComponent>
        </div>
      </div>

      {/* Table */}
      <DataTableEnhanced
        title="All Users"
        data={users || []}
        columns={columns}
        dropdownActions={getDropdownActions}
        pagination={{ itemsPerPage: 10 }}
        selectionMode="multi"
        isLoading={isLoading}
      />

      {/* Add User Modal */}
      <AddUserModal
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
        onSuccess={() => {
          refetch(); // Refresh the users list after successful creation
        }}
      />

      {/* Edit User Modal */}
      <EditUserModal
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
    </div>
  );
}
