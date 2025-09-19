'use client';

import { useState, useEffect } from 'react';
import DeleteButton from '@/components/delete-button';
import DateSelect from '@/components/date-select';
import FilterButton from '@/components/dropdown-filter';
import UsersTable from './users-table';
import PaginationClassic from '@/components/pagination-classic';
import AddUserModal from '@/components/add-user-modal';
import EditUserModal from '@/components/edit-user-modal';
import { useUsers, type User } from '@/lib/hooks/use-users';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import { usePagination } from '@/lib/hooks/use-pagination';

export default function UsersContent() {
  // Component rendered (client-side debug)
  if (process.env.NODE_ENV === 'development') {
    console.log('👥 UsersContent: Component rendered')
  }
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: users, isLoading, error, refetch } = useUsers(); // Access token handled by middleware
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Pagination
  const pagination = usePagination(users, { itemsPerPage: 10 });

  // Auth state logging (client-side debug)
  if (process.env.NODE_ENV === 'development') {
    console.log('👤 UsersContent: Auth state -', {
      isAuthenticated,
      authLoading
      // Access token now handled securely server-side via httpOnly cookies
    })
  }

  // API state logging (client-side debug)
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 UsersContent: API state -', {
      hasUsers: !!users,
      isLoading,
      hasError: !!error,
      errorMessage: error?.message
    })
  }

  // Redirect to login if not authenticated
  useEffect(() => {
    // useEffect trigger logging (client-side debug)
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 UsersContent: useEffect triggered -', { authLoading, isAuthenticated })
    }
    if (!authLoading && !isAuthenticated) {
      // Redirect logging (client-side debug)
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 UsersContent: Redirecting to login - no authentication')
      }
      const currentPath = window.location.pathname + window.location.search;
      const loginUrl = `/signin?callbackUrl=${encodeURIComponent(currentPath)}`;
      window.location.href = loginUrl;
    } else if (!authLoading && isAuthenticated) {
      // Authentication success logging (client-side debug)
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ UsersContent: User authenticated, staying on page')
      }
    }
  }, [isAuthenticated, authLoading]);

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setIsEditUserModalOpen(true);
  };

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
            <span className="ml-3 text-gray-600 dark:text-gray-400">Checking authentication...</span>
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
          <ProtectedComponent permission="users:create:organization">
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
      {isLoading ? (
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
            <span className="ml-3 text-gray-600 dark:text-gray-400">Loading users...</span>
          </div>
        </div>
      ) : (
        <UsersTable users={pagination.currentItems} onEdit={handleEditUser} />
      )}

      {/* Pagination */}
      <div className="mt-8">
        <PaginationClassic 
          currentPage={pagination.currentPage}
          totalItems={pagination.totalItems}
          itemsPerPage={pagination.itemsPerPage}
          startItem={pagination.startItem}
          endItem={pagination.endItem}
          hasPrevious={pagination.hasPrevious}
          hasNext={pagination.hasNext}
          onPrevious={pagination.goToPrevious}
          onNext={pagination.goToNext}
        />
      </div>

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
