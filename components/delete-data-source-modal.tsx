'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { type DataSource, useDeleteDataSource } from '@/lib/hooks/use-data-sources';
import Toast from './toast';
import { Button } from '@/components/ui/button';

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
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="sm"
        title="Delete Data Source"
      >
        {/* Modal body */}
        <div className="px-6 py-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Are you sure you want to delete "{dataSource?.data_source_name}"? This
            action cannot be undone.
          </p>
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
            Delete Data Source
          </Button>
        </div>
      </Modal>

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
