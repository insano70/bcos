'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { type DataSource, useIntrospectDataSource } from '@/lib/hooks/use-data-sources';
import Toast from './toast';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
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
                    <InlineAlert type="info" title="What will happen" className="mt-4">
                      <ul className="list-disc list-inside space-y-1">
                        <li>Connect to the analytics database</li>
                        <li>Analyze the table structure</li>
                        <li>Create column definitions with intelligent defaults</li>
                        <li>Set appropriate flags for measures, dimensions, and date fields</li>
                      </ul>
                    </InlineAlert>
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
