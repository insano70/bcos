'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { type DataSourceColumn, useDeleteDataSourceColumn } from '@/lib/hooks/use-data-sources';
import Toast from './toast';
import { Button } from '@/components/ui/button';
import { clientErrorLog } from '@/lib/utils/debug-client';
import { InlineAlert } from '@/components/ui/inline-alert';

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
                    <InlineAlert type="warning" title="Warning" className="mt-4">
                      Deleting this column will remove it from all existing charts and dashboards
                      that use it. This action cannot be reversed.
                    </InlineAlert>
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
