'use client';

import { ProtectedComponent } from '@/components/rbac/protected-component';
import type { DataSourceColumn } from '@/lib/hooks/use-data-sources';

interface DataSourceColumnsTableItemProps {
  column: DataSourceColumn;
  onCheckboxChange: (id: number, checked: boolean) => void;
  isSelected: boolean;
  onEdit: (column: DataSourceColumn) => void;
  onDelete: (column: DataSourceColumn) => void;
}

export default function DataSourceColumnsTableItem({
  column,
  onCheckboxChange,
  isSelected,
  onEdit,
  onDelete,
}: DataSourceColumnsTableItemProps) {
  const getColumnTypeBadge = () => {
    const types = [];
    if (column.is_measure) types.push('Measure');
    if (column.is_dimension) types.push('Dimension');
    if (column.is_date_field) types.push('Date');

    if (types.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1">
        {types.map((type) => (
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

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onCheckboxChange(column.column_id, e.target.checked);
  };

  return (
    <tr>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="flex items-center">
          <label className="inline-flex">
            <span className="sr-only">Select</span>
            <input
              className="form-checkbox"
              type="checkbox"
              onChange={handleCheckboxChange}
              checked={isSelected}
            />
          </label>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="font-mono text-gray-900 dark:text-gray-100">{column.column_name}</div>
        {column.column_description && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs truncate">
            {column.column_description}
          </div>
        )}
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-gray-900 dark:text-gray-100">{column.display_name}</div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
          {column.data_type}
        </span>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">{getColumnTypeBadge()}</td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
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
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            column.is_active
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}
        >
          {column.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="flex items-center space-x-2">
          <ProtectedComponent permission="data-sources:update:organization">
            <button
              type="button"
              onClick={() => onEdit(column)}
              className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
              title="Edit column"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </ProtectedComponent>
        </div>
      </td>
    </tr>
  );
}
