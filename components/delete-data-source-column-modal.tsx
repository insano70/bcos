'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useState } from 'react';
import { type DataSourceColumn, useDeleteDataSourceColumn } from '@/lib/hooks/use-data-sources';
import Toast from './toast';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface DeleteDataSourceColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  column: DataSourceColumn | null;
  dataSourceId: number;
}

export default function DeleteDataSourceColumnModal({
  isOpen,
  onClose,
  onSuccess,
  column,
  dataSourceId,
}: DeleteDataSourceColumnModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [_toastMessage, setToastMessage] = useState('');
  const [_toastType, setToastType] = useState<'success' | 'error'>('success');

  const deleteColumnMutation = useDeleteDataSourceColumn(dataSourceId, column?.column_id || 0);

  const handleClose = () => {
    if (!isDeleting) {
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!column) {
      setToastMessage('No column selected for deletion');
      setToastType('error');
      setShowToast(true);
      return;
    }

    setIsDeleting(true);

    try {
      await deleteColumnMutation.mutateAsync(column.column_id.toString());

      // Show success toast
      setShowToast(true);

      // Close modal after a brief delay to show toast
      setTimeout(() => {
        onClose();
        onSuccess?.();
        setShowToast(false);
      }, 2000);
    } catch (error) {
      // Log client-side column deletion errors for debugging
      clientErrorLog('Error deleting column:', error);
      setToastMessage(error instanceof Error ? error.message : 'Failed to delete column');
      setToastType('error');
      setShowToast(true);
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Transition appear show={isOpen}>
        <Dialog as="div" className="relative z-50" onClose={handleClose}>
          <TransitionChild
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <TransitionChild
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl">
                  {/* Modal header */}
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <svg
                          className="w-6 h-6 text-red-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                          />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100">
                          Delete Data Source Column
                        </h3>
                      </div>
                    </div>
                  </div>

                  {/* Modal body */}
                  <div className="px-6 py-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Are you sure you want to delete this data source column? This action cannot be
                      undone.
                    </div>

                    {/* Column details */}
                    {column && (
                      <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md">
                        <div className="text-sm">
                          <div className="font-medium text-gray-800 dark:text-gray-100">
                            {column.display_name}
                          </div>
                          <div className="text-gray-600 dark:text-gray-400 mt-1">
                            Column: {column.column_name} • Type: {column.data_type}
                          </div>
                          {column.column_description && (
                            <div className="text-gray-600 dark:text-gray-400 mt-1">
                              {column.column_description}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Warning */}
                    <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg
                            className="w-5 h-5 text-yellow-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            Warning
                          </h4>
                          <div className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                            Deleting this column will remove it from all existing charts and
                            dashboards that use it. This action cannot be reversed.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Modal footer */}
                  <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isDeleting}
                    >
                      Cancel
                    </button>
                    <button type="button" onClick={handleDelete}
                      disabled={isDeleting}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDeleting ? (
                        <>
                          <svg
                            className="animate-spin -ml-1 mr-3 h-4 w-4 text-white"
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
                          Deleting...
                        </>
                      ) : (
                        'Delete Column'
                      )}
                    </button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Toast Notification */}
      <Toast
        type="success"
        open={showToast}
        setOpen={setShowToast}
        className="fixed bottom-4 right-4 z-50"
      >
        Column deleted successfully!
      </Toast>
    </>
  );
}
