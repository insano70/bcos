'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { type DataSourceColumn, useDeleteDataSourceColumn } from '@/lib/hooks/use-data-sources';
import Toast from './toast';
import { Button } from '@/components/ui/button';
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
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="sm"
        title="Delete Data Source Column"
        preventClose={isDeleting}
      >
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
          <Button variant="secondary" onClick={handleClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={isDeleting}
            loading={isDeleting}
            loadingText="Deleting..."
          >
            Delete Column
          </Button>
        </div>
      </Modal>

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
