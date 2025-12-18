'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { type DataSource, useIntrospectDataSource } from '@/lib/hooks/use-data-sources';
import Toast from './toast';
import { Button } from '@/components/ui/button';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface IntrospectDataSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  dataSource: DataSource | null;
}

export default function IntrospectDataSourceModal({
  isOpen,
  onClose,
  onSuccess,
  dataSource,
}: IntrospectDataSourceModalProps) {
  const [isIntrospecting, setIsIntrospecting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [_toastMessage, setToastMessage] = useState('');
  const [_toastType, setToastType] = useState<'success' | 'error'>('success');

  const introspectMutation = useIntrospectDataSource(dataSource?.data_source_id || 0);

  const handleClose = () => {
    if (!isIntrospecting) {
      onClose();
    }
  };

  const handleIntrospect = async () => {
    if (!dataSource) {
      setToastMessage('No data source selected for introspection');
      setToastType('error');
      setShowToast(true);
      return;
    }

    setIsIntrospecting(true);

    try {
      const _result = await introspectMutation.mutateAsync({});

      // Show success toast
      setShowToast(true);

      // Close modal after a brief delay to show toast
      setTimeout(() => {
        onClose();
        onSuccess?.();
        setShowToast(false);
      }, 2000);
    } catch (error) {
      // Log client-side introspection errors for debugging
      clientErrorLog('Error introspecting data source:', error);
      setToastMessage(error instanceof Error ? error.message : 'Failed to introspect data source');
      setToastType('error');
      setShowToast(true);
      setIsIntrospecting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="sm"
        title="Introspect Data Source"
        preventClose={isIntrospecting}
      >
        {/* Modal body */}
        <div className="px-6 py-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      This will automatically create column definitions by analyzing the table
                      structure in the analytics database.
                    </div>

                    {/* Data source details */}
                    {dataSource && (
                      <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md">
                        <div className="text-sm">
                          <div className="font-medium text-gray-800 dark:text-gray-100">
                            {dataSource.data_source_name}
                          </div>
                          <div className="text-gray-600 dark:text-gray-400 mt-1">
                            Table: {dataSource.schema_name}.{dataSource.table_name}
                          </div>
                          <div className="text-gray-600 dark:text-gray-400">
                            Database: {dataSource.database_type || 'postgresql'}
                          </div>
                          {dataSource.data_source_description && (
                            <div className="text-gray-600 dark:text-gray-400 mt-1">
                              {dataSource.data_source_description}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Information */}
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg
                            className="w-5 h-5 text-blue-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                            What will happen
                          </h4>
                          <div className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                            <ul className="list-disc list-inside space-y-1">
                              <li>Connect to the analytics database</li>
                              <li>Analyze the table structure</li>
                              <li>Create column definitions with intelligent defaults</li>
                              <li>
                                Set appropriate flags for measures, dimensions, and date fields
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

        {/* Modal footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" onClick={handleClose} disabled={isIntrospecting}>
            Cancel
          </Button>
          <Button
            variant="blue"
            onClick={handleIntrospect}
            disabled={isIntrospecting}
            loading={isIntrospecting}
            loadingText="Introspecting..."
          >
            Introspect Columns
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
        Columns introspected successfully!
      </Toast>
    </>
  );
}
