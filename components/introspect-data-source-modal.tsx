'use client';

import { useState } from 'react';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useIntrospectDataSource, type DataSource } from '@/lib/hooks/use-data-sources';
import Toast from './toast';

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
  dataSource
}: IntrospectDataSourceModalProps) {
  const [isIntrospecting, setIsIntrospecting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

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
      const result = await introspectMutation.mutateAsync({});

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
      if (process.env.NODE_ENV === 'development') {
        console.error('Error introspecting data source:', error);
      }
      setToastMessage(error instanceof Error ? error.message : 'Failed to introspect data source');
      setToastType('error');
      setShowToast(true);
      setIsIntrospecting(false);
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
                        <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100">
                          Introspect Data Source
                        </h3>
                      </div>
                    </div>
                  </div>

                  {/* Modal body */}
                  <div className="px-6 py-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      This will automatically create column definitions by analyzing the table structure in the analytics database.
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
                          <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
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
                              <li>Set appropriate flags for measures, dimensions, and date fields</li>
                            </ul>
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
                      disabled={isIntrospecting}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleIntrospect}
                      disabled={isIntrospecting}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isIntrospecting ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Introspecting...
                        </>
                      ) : (
                        'Introspect Columns'
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
        Columns introspected successfully!
      </Toast>
    </>
  );
}

