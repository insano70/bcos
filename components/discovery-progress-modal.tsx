'use client';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface DiscoveryProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDiscovering: boolean;
  result: {
    tables_discovered: number;
    tables_new: number;
    tables_updated: number;
    columns_analyzed: number;
  } | null;
  error: string | null;
}

export default function DiscoveryProgressModal({
  isOpen,
  onClose,
  isDiscovering,
  result,
  error,
}: DiscoveryProgressModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title={isDiscovering ? 'Discovering Tables...' : result ? 'Discovery Complete' : 'Discovery Failed'}
      preventClose={isDiscovering}
    >
      <div className="px-4 sm:px-6 py-4">

              {isDiscovering && (
                <div className="text-center py-8">
                  <Spinner size="lg" className="mb-4" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Analyzing ih schema tables and columns...
                  </p>
                </div>
              )}

              {error && (
                <div className="py-4">
                  <div className="flex items-center justify-center mb-4">
                    <svg className="h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
                </div>
              )}

              {result && !isDiscovering && (
                <div className="py-4">
                  <div className="flex items-center justify-center mb-4">
                    <svg className="h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Tables Discovered:</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {result.tables_discovered}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">New Tables:</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        {result.tables_new}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Updated Tables:</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {result.tables_updated}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Columns Analyzed:</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {result.columns_analyzed}
                      </span>
                    </div>
                  </div>

                  {result.tables_new > 0 && (
                    <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded">
                      <p className="text-sm text-green-700 dark:text-green-300">
                        {result.tables_new} new {result.tables_new === 1 ? 'table' : 'tables'} added to metadata. 
                        You can now edit descriptions and add sample questions to improve AI query generation.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <Button
                  variant="violet"
                  onClick={onClose}
                  disabled={isDiscovering}
                  loading={isDiscovering}
                  loadingText="Discovering..."
                >
                  Close
                </Button>
              </div>
      </div>
    </Modal>
  );
}

