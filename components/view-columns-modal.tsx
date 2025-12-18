'use client';

import { useEffect, useState, useCallback } from 'react';
import { Modal } from '@/components/ui/modal';
import { apiClient } from '@/lib/api/client';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={`Columns: ${tableName}`}
    >
      {/* Modal body */}
            <div className="px-4 sm:px-6 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              {isLoading && (
                <div className="text-center py-8">
                  <Spinner size="md" />
                  <p className="mt-2 text-sm text-gray-500">Loading columns...</p>
                </div>
              )}

              {error && (
                <div className="text-center py-8">
                  <p className="text-red-600 dark:text-red-400">{error}</p>
                  <Button variant="violet" onClick={fetchColumns} className="mt-4">
                    Try Again
                  </Button>
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
                                <Button
                                  variant="violet"
                                  size="xs"
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
                                >
                                  Save
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="xs"
                                  onClick={() => setEditingColumn(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between group">
                                <span>
                                  {col.description || (
                                    <span className="italic text-gray-400">No description</span>
                                  )}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => {
                                    setEditingColumn(col.column_metadata_id);
                                    setEditDescription(col.description || '');
                                  }}
                                  className="opacity-0 group-hover:opacity-100 ml-2 text-violet-600 hover:text-violet-700 p-0"
                                  aria-label="Edit description"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </Button>
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
                <Button variant="secondary" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
    </Modal>
  );
}

