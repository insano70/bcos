'use client';

import { useState } from 'react';
import Link from 'next/link';
import DeleteButton from '@/components/delete-button';
import FilterButton from '@/components/dropdown-filter';
import DataSourceColumnsTable from './data-source-columns-table';
import PaginationClassic from '@/components/pagination-classic';
import AddDataSourceColumnModal from '@/components/add-data-source-column-modal';
import EditDataSourceColumnModal from '@/components/edit-data-source-column-modal';
import DeleteDataSourceColumnModal from '@/components/delete-data-source-column-modal';
import IntrospectDataSourceModal from '@/components/introspect-data-source-modal';
import { useDataSourceColumns, useDataSource, type DataSourceColumn } from '@/lib/hooks/use-data-sources';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import { usePagination } from '@/lib/hooks/use-pagination';
import Toast from '@/components/toast';

interface DataSourceColumnsContentProps {
  dataSourceId: number;
}

export default function DataSourceColumnsContent({ dataSourceId }: DataSourceColumnsContentProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: dataSourceResponse } = useDataSource(dataSourceId);
  const { data: response, isLoading, error, refetch } = useDataSourceColumns(dataSourceId, { limit: 50, offset: 0 });

  const dataSource = dataSourceResponse?.dataSource;
  const columns = response?.columns || [];

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

  // Pagination
  const pagination = usePagination(columns, { itemsPerPage: 10 });

  // Auth state logging
  if (process.env.NODE_ENV === 'development') {
    console.log('👤 DataSourceColumnsContent: Auth state -', {
      isAuthenticated,
      authLoading,
      dataSourceId
    });
  }

  // API state logging
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 DataSourceColumnsContent: API state -', {
      hasDataSource: !!dataSource,
      hasColumns: !!columns,
      columnCount: columns.length,
      isLoading,
      hasError: !!error,
      errorMessage: error?.message
    });
  }

  // Redirect to login if not authenticated
  if (!authLoading && !isAuthenticated) {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔒 DataSourceColumnsContent: User not authenticated');
    }
    return null;
  }

  // Loading state
  if (authLoading || !dataSource) {
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
              {authLoading ? 'Authenticating...' : 'Loading data source...'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-8">
          <div className="text-center">
            <svg className="mx-auto h-12 w-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">Error Loading Columns</h3>
            <p className="mt-1 text-sm text-red-500">
              Failed to load columns: {error.message}
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleEditColumn = (column: DataSourceColumn) => {
    setSelectedColumn(column);
    setIsEditColumnModalOpen(true);
  };

  const handleDeleteColumn = (column: DataSourceColumn) => {
    setSelectedColumn(column);
    setIsDeleteModalOpen(true);
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
                    <path d="m19.707 9.293-2-2-7-7a1 1 0 0 0-1.414 0l-7 7-2 2A1 1 0 0 0 1 10h2v6a3 3 0 0 0 3 3h4v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4h4a3 3 0 0 0 3-3v-6h2a1 1 0 0 0 .707-1.707Z"/>
                  </svg>
                  Data Sources
                </Link>
              </li>
              <li>
                <div className="flex items-center">
                  <svg className="w-3 h-3 text-gray-400 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7"/>
                  </svg>
                  <span className="ml-1 text-sm font-medium text-gray-500 md:text-gray-700 dark:text-gray-400 dark:md:text-gray-400">
                    {dataSource.data_source_name}
                  </span>
                </div>
              </li>
              <li aria-current="page">
                <div className="flex items-center">
                  <svg className="w-3 h-3 text-gray-400 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7"/>
                  </svg>
                  <span className="ml-1 text-sm font-medium text-gray-500 dark:text-gray-400">Columns</span>
                </div>
              </li>
            </ol>
          </nav>

          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Column Configuration
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

          {/* Data source info */}
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Data Source:</span> {dataSource.data_source_name}
            <span className="mx-2">•</span>
            <span className="font-medium">Table:</span> {dataSource.schema_name}.{dataSource.table_name}
            <span className="mx-2">•</span>
            <span className="font-medium">Type:</span> {dataSource.database_type || 'postgresql'}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          {/* Delete button */}
          <DeleteButton />

          {/* Filter button */}
          <FilterButton align="right" />

          {/* Introspect button - only show when no columns exist */}
          {columns.length === 0 && (
            <ProtectedComponent permission="data-sources:create:organization">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setIsIntrospectModalOpen(true)}
                className="btn bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  className="fill-current shrink-0 xs:hidden"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                >
                  <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 12c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm1-3H7V4h2v5z" />
                </svg>
                <span className="max-xs:sr-only">Introspect</span>
              </button>
            </ProtectedComponent>
          )}

          {/* Add column button - protected by RBAC */}
          <ProtectedComponent permission="data-sources:create:organization">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setIsAddColumnModalOpen(true)}
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
              <span className="max-xs:sr-only">Add Column</span>
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
            <span className="ml-3 text-gray-600 dark:text-gray-400">Loading columns...</span>
          </div>
        </div>
      ) : (
        <DataSourceColumnsTable
          columns={pagination.currentItems}
          onEdit={handleEditColumn}
          onDelete={handleDeleteColumn}
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

      {/* Add Column Modal */}
      <AddDataSourceColumnModal
        isOpen={isAddColumnModalOpen}
        onClose={() => setIsAddColumnModalOpen(false)}
        onSuccess={() => {
          refetch();
          showSuccessToast('Column added successfully!');
        }}
        dataSourceId={dataSourceId}
      />

      {/* Edit Column Modal */}
      <EditDataSourceColumnModal
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
