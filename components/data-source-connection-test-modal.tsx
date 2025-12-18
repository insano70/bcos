'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import {
  type ConnectionTestResult,
  type DataSource,
  useTestConnection,
} from '@/lib/hooks/use-data-sources';
import Toast from './toast';
import { Button } from '@/components/ui/button';

interface ConnectionTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataSource: DataSource | null;
}

export default function DataSourceConnectionTestModal({
  isOpen,
  onClose,
  dataSource,
}: ConnectionTestModalProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Always call the hook - hooks must be called in the same order every render
  const testConnectionMutation = useTestConnection(dataSource?.data_source_id || null);

  const handleClose = () => {
    setTestResult(null);
    onClose();
  };

  const handleTestConnection = async () => {
    if (!dataSource || !dataSource.data_source_id) {
      setToastMessage('No data source selected for testing');
      setToastType('error');
      setShowToast(true);
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testConnectionMutation.mutateAsync({});
      setTestResult(result);

      if (result.success) {
        setToastMessage('Connection test completed successfully!');
        setToastType('success');
      } else {
        setToastMessage(`Connection test failed: ${result.error}`);
        setToastType('error');
      }
      setShowToast(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection test failed';
      setTestResult({
        success: false,
        error: errorMessage,
      });
      setToastMessage(errorMessage);
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsTesting(false);
    }
  };

  const formatConnectionTime = (timeMs?: number) => {
    if (!timeMs) return 'N/A';
    if (timeMs < 1000) return `${timeMs}ms`;
    return `${(timeMs / 1000).toFixed(2)}s`;
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="md"
        title="Test Connection"
      >
        {/* Modal body */}
        <div className="px-6 py-4">
                    {/* Data Source Info */}
                    {dataSource && (
                      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                          {dataSource.data_source_name}
                        </h3>
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                          <div>
                            <span className="font-medium">Table:</span> {dataSource.schema_name}.
                            {dataSource.table_name}
                          </div>
                          <div>
                            <span className="font-medium">Database:</span>{' '}
                            {dataSource.database_type || 'postgresql'}
                          </div>
                          {dataSource.data_source_description && (
                            <div>
                              <span className="font-medium">Description:</span>{' '}
                              {dataSource.data_source_description}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

          {/* Test Button */}
          <div className="mb-6">
            <Button
              variant="blue"
              fullWidth
              onClick={handleTestConnection}
              disabled={isTesting || !dataSource}
              loading={isTesting}
              loadingText="Testing Connection..."
              leftIcon={
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              }
            >
              Test Connection
            </Button>
          </div>

                    {/* Test Results */}
                    {testResult && (
                      <div
                        className={`p-4 rounded-lg border ${
                          testResult.success
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                        }`}
                      >
                        <div className="flex items-center mb-3">
                          {testResult.success ? (
                            <svg
                              className="w-5 h-5 text-green-600 dark:text-green-400 mr-2"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-5 h-5 text-red-600 dark:text-red-400 mr-2"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                          <h4
                            className={`font-medium ${
                              testResult.success
                                ? 'text-green-800 dark:text-green-200'
                                : 'text-red-800 dark:text-red-200'
                            }`}
                          >
                            {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                          </h4>
                        </div>

                        {/* Error Message */}
                        {!testResult.success && testResult.error && (
                          <div className="mb-3">
                            <p className="text-sm text-red-700 dark:text-red-300">
                              <span className="font-medium">Error:</span> {testResult.error}
                            </p>
                          </div>
                        )}

                        {/* Connection Details */}
                        {testResult.details && (
                          <div className="space-y-2 text-sm">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span
                                  className={`font-medium ${
                                    testResult.success
                                      ? 'text-green-700 dark:text-green-300'
                                      : 'text-red-700 dark:text-red-300'
                                  }`}
                                >
                                  Connection Time:
                                </span>
                                <span
                                  className={`ml-2 ${
                                    testResult.success
                                      ? 'text-green-600 dark:text-green-400'
                                      : 'text-red-600 dark:text-red-400'
                                  }`}
                                >
                                  {formatConnectionTime(testResult.details.connection_time_ms)}
                                </span>
                              </div>
                              <div>
                                <span
                                  className={`font-medium ${
                                    testResult.success
                                      ? 'text-green-700 dark:text-green-300'
                                      : 'text-red-700 dark:text-red-300'
                                  }`}
                                >
                                  Schema Access:
                                </span>
                                <span
                                  className={`ml-2 ${
                                    testResult.details.schema_accessible
                                      ? 'text-green-600 dark:text-green-400'
                                      : 'text-red-600 dark:text-red-400'
                                  }`}
                                >
                                  {testResult.details.schema_accessible ? 'Yes' : 'No'}
                                </span>
                              </div>
                              <div>
                                <span
                                  className={`font-medium ${
                                    testResult.success
                                      ? 'text-green-700 dark:text-green-300'
                                      : 'text-red-700 dark:text-red-300'
                                  }`}
                                >
                                  Table Access:
                                </span>
                                <span
                                  className={`ml-2 ${
                                    testResult.details.table_accessible
                                      ? 'text-green-600 dark:text-green-400'
                                      : 'text-red-600 dark:text-red-400'
                                  }`}
                                >
                                  {testResult.details.table_accessible ? 'Yes' : 'No'}
                                </span>
                              </div>
                              {testResult.success &&
                                testResult.details.sample_row_count !== undefined && (
                                  <div>
                                    <span className="font-medium text-green-700 dark:text-green-300">
                                      Sample Rows:
                                    </span>
                                    <span className="ml-2 text-green-600 dark:text-green-400">
                                      {testResult.details.sample_row_count.toLocaleString()}
                                    </span>
                                  </div>
                                )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

        {/* Modal footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
          {testResult && !testResult.success && (
            <Button
              variant="violet"
              onClick={handleTestConnection}
              disabled={isTesting}
              loading={isTesting}
              loadingText="Retesting..."
            >
              Try Again
            </Button>
          )}
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
