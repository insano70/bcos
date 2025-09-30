import { useState } from 'react';
import type { DataSourceColumn } from '@/lib/hooks/use-data-sources';
import { ProtectedComponent } from '@/components/rbac/protected-component';

interface DataSourceColumnsTableProps {
  columns: DataSourceColumn[];
  onEdit: (column: DataSourceColumn) => void;
  onDelete: (column: DataSourceColumn) => void;
}

export default function DataSourceColumnsTable({
  columns,
  onEdit,
  onDelete
}: DataSourceColumnsTableProps) {
  const [sortConfig, setSortConfig] = useState<{
    key: keyof DataSourceColumn;
    direction: 'asc' | 'desc';
  } | null>(null);

  const handleSort = (key: keyof DataSourceColumn) => {
    setSortConfig(current => ({
      key,
      direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedColumns = [...columns].sort((a, b) => {
    if (!sortConfig) return 0;

    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    // Handle null/undefined values
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return sortConfig.direction === 'asc' ? -1 : 1;
    if (bValue == null) return sortConfig.direction === 'asc' ? 1 : -1;

    // Convert to strings for comparison if needed
    const aStr = String(aValue);
    const bStr = String(bValue);

    const comparison = aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
    return sortConfig.direction === 'asc' ? comparison : -comparison;
  });

  const getSortIcon = (key: keyof DataSourceColumn) => {
    if (sortConfig?.key !== key) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }

    return sortConfig.direction === 'asc' ? (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const getColumnTypeBadge = (column: DataSourceColumn) => {
    const types = [];
    if (column.is_measure) types.push('Measure');
    if (column.is_dimension) types.push('Dimension');
    if (column.is_date_field) types.push('Date');

    if (types.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1">
        {types.map(type => (
          <span
            key={type}
            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              type === 'Measure'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                : type === 'Dimension'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
            }`}
          >
            {type}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-4 py-3 text-left">
                <button
                  type="button"
                  onClick={() => handleSort('column_name')}
                  className="flex items-center space-x-1 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <span>Column Name</span>
                  {getSortIcon('column_name')}
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  type="button"
                  onClick={() => handleSort('display_name')}
                  className="flex items-center space-x-1 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <span>Display Name</span>
                  {getSortIcon('display_name')}
                </button>
              </th>
              <th className="px-4 py-3 text-left">Data Type</th>
              <th className="px-4 py-3 text-left">Column Type</th>
              <th className="px-4 py-3 text-left">Flags</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-gray-200 dark:divide-gray-700">
            {sortedColumns.map((column) => (
              <tr key={column.column_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="px-4 py-3">
                  <div className="font-mono text-gray-900 dark:text-gray-100">
                    {column.column_name}
                  </div>
                  {column.column_description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs truncate">
                      {column.column_description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="text-gray-900 dark:text-gray-100">
                    {column.display_name}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                    {column.data_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {getColumnTypeBadge(column)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {column.is_filterable && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                        Filterable
                      </span>
                    )}
                    {column.is_groupable && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200">
                        Groupable
                      </span>
                    )}
                    {column.is_measure_type && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        Measure Type
                      </span>
                    )}
                    {column.is_time_period && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                        Time Period
                      </span>
                    )}
                    {column.is_sensitive && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                        Sensitive
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    column.is_active
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                    {column.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center space-x-2">
                    <ProtectedComponent permission="data-sources:update:organization">
                      <button
                        type="button"
                        onClick={() => onEdit(column)}
                        className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                        title="Edit column"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </ProtectedComponent>

                    <ProtectedComponent permission="data-sources:delete:organization">
                      <button
                        type="button"
                        onClick={() => onDelete(column)}
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Delete column"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </ProtectedComponent>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {columns.length === 0 && (
        <div className="px-4 py-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No columns configured</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Get started by adding columns to this data source.
          </p>
        </div>
      )}
    </div>
  );
}
