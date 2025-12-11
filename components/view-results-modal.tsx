'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';

interface ViewResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: unknown[];
  rowCount: number;
  executionTime: number;
  sql: string;
}

export default function ViewResultsModal({
  isOpen,
  onClose,
  results,
  rowCount,
  executionTime,
  sql,
}: ViewResultsModalProps) {
  const columns =
    results.length > 0 && results[0]
      ? Object.keys(results[0] as Record<string, unknown>)
      : [];

  return (
    <Transition appear show={isOpen}>
      <Dialog as="div" onClose={onClose}>
        <TransitionChild
          as="div"
          className="fixed inset-0 bg-gray-900/30 z-50 transition-opacity"
          enter="transition ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition ease-out duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          aria-hidden="true"
        />
        <TransitionChild
          as="div"
          className="fixed inset-0 z-50 overflow-hidden flex items-center my-4 justify-center px-4 sm:px-6"
          enter="transition ease-in-out duration-200"
          enterFrom="opacity-0 translate-y-4"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in-out duration-200"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-4"
        >
          <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden max-w-6xl w-full max-h-[90vh]">
            {/* Modal header */}
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between">
                <div>
                  <Dialog.Title className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                    Query Results
                  </Dialog.Title>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {rowCount} {rowCount === 1 ? 'row' : 'rows'} in {executionTime}ms
                  </p>
                </div>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                  onClick={onClose}
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* SQL Preview */}
            <div className="px-4 sm:px-6 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                  View SQL
                </summary>
                <pre className="mt-2 bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono overflow-x-auto">
                  <code>{sql}</code>
                </pre>
              </details>
            </div>

            {/* Modal body */}
            <div className="px-4 sm:px-6 py-4 overflow-auto max-h-[calc(90vh-240px)]">
              {results.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No results to display</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                      <tr>
                        {columns.map((col) => (
                          <th
                            key={col}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {results.map((row, idx) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: Static display table, rows not reordered
                        <tr key={idx}>
                          {columns.map((col) => (
                            <td
                              key={col}
                              className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap"
                            >
                              {String((row as Record<string, unknown>)[col] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rowCount > results.length && (
                    <p className="text-sm text-gray-500 mt-2 text-center">
                      Showing first {results.length} of {rowCount} rows (sample only)
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </DialogPanel>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}

