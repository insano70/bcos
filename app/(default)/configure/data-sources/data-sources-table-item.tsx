'use client';

import { useState, useEffect, useRef } from 'react';
import type { DataSource } from '@/lib/hooks/use-data-sources';

interface DataSourcesTableItemProps {
  dataSource: DataSource & { id: string; _uniqueKey: string };
  onCheckboxChange: (id: string, checked: boolean) => void;
  isSelected: boolean;
  onEdit?: ((dataSource: DataSource) => void) | undefined;
  onDelete?: ((dataSource: DataSource) => void) | undefined;
  onTest?: ((dataSource: DataSource) => void) | undefined;
}

export default function DataSourcesTableItem({
  dataSource,
  onCheckboxChange,
  isSelected,
  onEdit,
  onDelete,
  onTest,
}: DataSourcesTableItemProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onCheckboxChange(dataSource.id, e.target.checked);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleEdit = () => {
    onEdit?.(dataSource);
    setDropdownOpen(false);
  };

  const handleDelete = () => {
    onDelete?.(dataSource);
    setDropdownOpen(false);
  };

  const handleTest = () => {
    onTest?.(dataSource);
    setDropdownOpen(false);
  };

  const getStatusBadge = () => {
    if (!dataSource.is_active) {
      return (
        <div className="inline-flex font-medium bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full text-center px-2.5 py-0.5">
          Inactive
        </div>
      );
    }

    switch (dataSource.connection_status) {
      case 'connected':
        return (
          <div className="inline-flex font-medium bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 rounded-full text-center px-2.5 py-0.5">
            Connected
          </div>
        );
      case 'error':
        return (
          <div className="inline-flex font-medium bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full text-center px-2.5 py-0.5">
            Error
          </div>
        );
      default:
        return (
          <div className="inline-flex font-medium bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded-full text-center px-2.5 py-0.5">
            Untested
          </div>
        );
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <tr>
      {/* Checkbox */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="flex items-center">
          <label className="inline-flex">
            <span className="sr-only">Select</span>
            <input
              className="form-checkbox"
              type="checkbox"
              checked={isSelected}
              onChange={handleCheckboxChange}
            />
          </label>
        </div>
      </td>

      {/* Name */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="flex items-center">
          <div>
            <div className="font-medium text-gray-800 dark:text-gray-100">
              {dataSource.data_source_name}
            </div>
            {dataSource.data_source_description && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {dataSource.data_source_description}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Table */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="font-medium text-gray-800 dark:text-gray-100">
          {dataSource.table_name}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {dataSource.schema_name}
        </div>
      </td>

      {/* Database Type */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-gray-800 dark:text-gray-100">
          {dataSource.database_type || 'postgresql'}
        </div>
      </td>

      {/* Status */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        {getStatusBadge()}
      </td>

      {/* Column Count */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-gray-800 dark:text-gray-100">
          {dataSource.column_count || 0}
        </div>
      </td>

      {/* Updated */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-gray-800 dark:text-gray-100">
          {formatDate(dataSource.updated_at)}
        </div>
      </td>

      {/* Actions dropdown */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="relative inline-flex" ref={dropdownRef}>
          <button
            type="button"
            className="rounded-full"
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <span className="sr-only">Menu</span>
            <svg className="w-8 h-8 fill-current text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="2" />
              <circle cx="10" cy="16" r="2" />
              <circle cx="22" cy="16" r="2" />
            </svg>
          </button>
          {dropdownOpen && (
            <div className="origin-top-right z-50 fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 py-1.5 rounded-lg shadow-lg overflow-hidden min-w-44"
                 style={{
                   top: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().bottom + 4 : 0,
                   left: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().right - 176 : 0
                 }}>
              <ul>
                {onTest && (
                  <li>
                    <button
                      type="button"
                      className="font-medium text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200 flex items-center py-1 px-3 w-full text-left"
                      onClick={handleTest}
                    >
                      <svg className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0 mr-2" viewBox="0 0 16 16">
                        <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 12c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm1-3H7V4h2v5z" />
                      </svg>
                      <span>Test Connection</span>
                    </button>
                  </li>
                )}
                {onEdit && (
                  <li>
                    <button
                      type="button"
                      className="font-medium text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200 flex items-center py-1 px-3 w-full text-left"
                      onClick={handleEdit}
                    >
                      <svg className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0 mr-2" viewBox="0 0 16 16">
                        <path d="m13.7 2.3-1-1c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4zM10.5 6.5L9 5l.5-.5L11 6l-.5.5zM2 14v-3l6-6 3 3-6 6H2z" />
                      </svg>
                      <span>Edit</span>
                    </button>
                  </li>
                )}
                {onDelete && (
                  <li>
                    <button
                      type="button"
                      className="font-medium text-sm text-red-500 hover:text-red-600 flex items-center py-1 px-3 w-full text-left"
                      onClick={handleDelete}
                    >
                      <svg className="w-4 h-4 fill-current text-red-400 shrink-0 mr-2" viewBox="0 0 16 16">
                        <path d="M5 7h6a1 1 0 0 1 0 2H5a1 1 0 0 1 0-2zM4 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
                      </svg>
                      <span>Delete</span>
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
