'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useState } from 'react';
import { type DataSource, useDeleteDataSource } from '@/lib/hooks/use-data-sources';
import Toast from './toast';

interface DeleteDataSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  dataSource: DataSource | null;
}

export default function DeleteDataSourceModal({
  isOpen,
  onClose,
  onSuccess,
  dataSource,
}: DeleteDataSourceModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const deleteDataSourceMutation = useDeleteDataSource();

  const handleClose = () => {
    onClose();
  };

  const handleDelete = async () => {
    if (!dataSource) {
      setToastMessage('No data source selected for deletion');
      setToastType('error');
      setShowToast(true);
      return;
    }

    setIsDeleting(true);

    try {
      await deleteDataSourceMutation.mutateAsync(dataSource.data_source_id.toString());

      setToastMessage(`Data source "${dataSource.data_source_name}" deleted successfully!`);
      setToastType('success');
      setShowToast(true);

      // Wait a moment to show success message before closing
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1000);
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : 'Failed to delete data source');
      setToastType('error');
      setShowToast(true);
    } finally {
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
                  <div className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                        <svg
                          className="h-6 w-6 text-red-600 dark:text-red-400"
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
                    </div>
                    <div className="mt-3 text-center">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                        Delete Data Source
                      </h3>
                      <div className="mt-2">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Are you sure you want to delete "{dataSource?.data_source_name}"? This
                          action cannot be undone.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Warning about dependent resources */}
                  <div className="px-6 py-4 bg-yellow-50 dark:bg-yellow-900/20 border-t border-b border-yellow-200 dark:border-yellow-800">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg
                          className="h-5 w-5 text-yellow-600 dark:text-yellow-400"
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
                          <p>
                            Charts and dashboards using this data source may stop working. Consider
                            deactivating instead of deleting if you want to preserve existing
                            configurations.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Modal footer */}
                  <div className="flex justify-end gap-3 px-6 py-4">
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
                      {isDeleting ? 'Deleting...' : 'Delete Data Source'}
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
        type={toastType}
        open={showToast}
        setOpen={setShowToast}
        className="fixed bottom-4 right-4 z-50"
      >
        {toastMessage}
      </Toast>
    </>
  );
}
