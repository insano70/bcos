'use client';

import { useState } from 'react';
import DeleteButton from '@/components/delete-button';
import DateSelect from '@/components/date-select';
import FilterButton from '@/components/dropdown-filter';
import DataSourcesTable from './data-sources-table';
import PaginationClassic from '@/components/pagination-classic';
import AddDataSourceModal from '@/components/add-data-source-modal';
import EditDataSourceModal from '@/components/edit-data-source-modal';
import DataSourceConnectionTestModal from '@/components/data-source-connection-test-modal';
import DeleteDataSourceModal from '@/components/delete-data-source-modal';
import { useDataSources, type DataSource } from '@/lib/hooks/use-data-sources';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import { usePagination } from '@/lib/hooks/use-pagination';
import Toast from '@/components/toast';

export default function DataSourcesContent() {
  // Component rendered (client-side debug)
  if (process.env.NODE_ENV === 'development') {
    console.log('🗄️ DataSourcesContent: Component rendered');
  }
  
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: response, isLoading, error, refetch } = useDataSources({ limit: 50, offset: 0 });

  const dataSources = response?.dataSources || [];
  
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

  // Pagination
  const pagination = usePagination(dataSources, { itemsPerPage: 10 });

  // Auth state logging (client-side debug)
  if (process.env.NODE_ENV === 'development') {
    console.log('👤 DataSourcesContent: Auth state -', {
      isAuthenticated,
      authLoading
    });
  }

  // API state logging (client-side debug)
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 DataSourcesContent: API state -', {
      hasDataSources: !!dataSources,
      dataSourceCount: dataSources.length,
      isLoading,
      hasError: !!error,
      errorMessage: error?.message
    });
  }

  // Redirect to login if not authenticated
  if (!authLoading && !isAuthenticated) {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔒 DataSourcesContent: User not authenticated, should redirect');
    }
    return null; // Let the auth provider handle the redirect
  }

  // Loading state
  if (authLoading) {
    return (
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
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-8">
        <div className="text-center text-red-500">
          Failed to load data sources: {error.message}
        </div>
      </div>
    );
  }

  const handleEditDataSource = (dataSource: DataSource) => {
    setSelectedDataSource(dataSource);
    setIsEditDataSourceModalOpen(true);
  };

  const handleDeleteDataSource = (dataSource: DataSource) => {
    setSelectedDataSource(dataSource);
    setIsDeleteModalOpen(true);
  };

  const handleTestDataSource = (dataSource: DataSource) => {
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

          {/* Add data source button - protected by RBAC */}
          <ProtectedComponent permission="data-sources:create:organization">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setIsAddDataSourceModalOpen(true)}
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
              <span className="max-xs:sr-only">Add Data Source</span>
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
            <span className="ml-3 text-gray-600 dark:text-gray-400">Loading data sources...</span>
          </div>
        </div>
      ) : (
        <DataSourcesTable 
          dataSources={pagination.currentItems} 
          onEdit={handleEditDataSource}
          onDelete={handleDeleteDataSource}
          onTest={handleTestDataSource}
        />
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

      {/* Add Data Source Modal */}
      <AddDataSourceModal
        isOpen={isAddDataSourceModalOpen}
        onClose={() => setIsAddDataSourceModalOpen(false)}
        onSuccess={() => {
          refetch(); // Refresh the data sources list after successful creation
          showSuccessToast('Data source created successfully!');
        }}
      />

      {/* Edit Data Source Modal */}
      <EditDataSourceModal
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
