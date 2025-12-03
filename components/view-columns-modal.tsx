'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import type { ColumnMetadata } from '@/lib/types/data-explorer';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface ViewColumnsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: string | null;
  tableName: string;
}

export default function ViewColumnsModal({
  isOpen,
  onClose,
  tableId,
  tableName,
}: ViewColumnsModalProps) {
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');

  const fetchColumns = useCallback(async () => {
    if (!tableId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await apiClient.get<ColumnMetadata[]>(
        `/api/data/explorer/metadata/tables/${tableId}/columns`
      );
      setColumns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load columns');
    } finally {
      setIsLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    if (isOpen && tableId) {
      fetchColumns();
    }
  }, [isOpen, tableId, fetchColumns]);

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
          <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden max-w-4xl w-full max-h-[90vh]">
            {/* Modal header */}
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between">
                <Dialog.Title className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  Columns: {tableName}
                </Dialog.Title>
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

            {/* Modal body */}
            <div className="px-4 sm:px-6 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              {isLoading && (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
                  <p className="mt-2 text-sm text-gray-500">Loading columns...</p>
                </div>
              )}

              {error && (
                <div className="text-center py-8">
                  <p className="text-red-600 dark:text-red-400">{error}</p>
                  <button
                    type="button"
                    onClick={fetchColumns}
                    className="mt-4 btn bg-violet-500 hover:bg-violet-600 text-white"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!isLoading && !error && columns.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No columns found for this table.</p>
                </div>
              )}

              {!isLoading && !error && columns.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Column Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Data Type
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Semantic Type
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Nullable
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          PK
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          FK
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Statistics
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {columns.map((col) => (
                        <tr key={col.column_metadata_id}>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                            {col.column_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {col.data_type}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {col.semantic_type || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            {col.is_nullable ? (
                              <span className="text-gray-400">✓</span>
                            ) : (
                              <span className="text-gray-600 dark:text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            {col.is_primary_key ? (
                              <span className="text-violet-600 font-semibold">PK</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            {col.is_foreign_key ? (
                              <span className="text-blue-600 font-semibold">FK</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {editingColumn === col.column_metadata_id ? (
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={editDescription}
                                  onChange={(e) => setEditDescription(e.target.value)}
                                  className="form-input text-sm flex-1"
                                  placeholder="Add description"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await apiClient.put(
                                        `/api/data/explorer/metadata/columns/${col.column_metadata_id}`,
                                        { description: editDescription }
                                      );
                                      await fetchColumns();
                                      setEditingColumn(null);
                                    } catch (err) {
                                      clientErrorLog('Failed to update:', err);
                                    }
                                  }}
                                  className="btn-sm bg-violet-500 hover:bg-violet-600 text-white"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingColumn(null)}
                                  className="btn-sm border-gray-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between group">
                                <span>
                                  {col.description || (
                                    <span className="italic text-gray-400">No description</span>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingColumn(col.column_metadata_id);
                                    setEditDescription(col.description || '');
                                  }}
                                  className="opacity-0 group-hover:opacity-100 ml-2 text-violet-600 hover:text-violet-700"
                                  title="Edit description"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {col.statistics_analysis_status === 'completed' ? (
                              <div className="space-y-1">
                                {col.common_values && Array.isArray(col.common_values) && col.common_values.length > 0 ? (
                                  <div className="text-xs">
                                    <span className="font-medium">Common:</span>{' '}
                                    {(col.common_values as Array<{ value: string; percentage: number }>).slice(0, 3).map((v) => `${v.value} (${v.percentage}%)`).join(', ')}
                                  </div>
                                ) : null}
                                {col.min_value && col.max_value ? (
                                  <div className="text-xs">
                                    <span className="font-medium">Range:</span> {col.min_value} to {col.max_value}
                                  </div>
                                ) : null}
                                {col.distinct_count !== null && col.distinct_count !== undefined ? (
                                  <div className="text-xs">
                                    <span className="font-medium">Distinct:</span> {col.distinct_count}
                                  </div>
                                ) : null}
                                {col.null_percentage ? (
                                  <div className="text-xs">
                                    <span className="font-medium">Null:</span> {col.null_percentage}%
                                  </div>
                                ) : null}
                              </div>
                            ) : col.statistics_analysis_status === 'analyzing' ? (
                              <span className="text-xs italic text-violet-600">Analyzing...</span>
                            ) : col.statistics_analysis_status === 'failed' ? (
                              <span className="text-xs italic text-red-600" title={col.statistics_analysis_error || undefined}>Failed</span>
                            ) : col.statistics_analysis_status === 'skipped' ? (
                              <span className="text-xs italic text-gray-400">Skipped</span>
                            ) : (
                              <span className="text-xs italic text-gray-400">Not analyzed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {columns.length} {columns.length === 1 ? 'column' : 'columns'} total
                </p>
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

