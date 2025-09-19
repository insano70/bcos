'use client';

import { useState, useEffect, useRef } from 'react';
import type { DashboardListItem } from '@/lib/types/analytics';

interface DashboardsTableItemProps {
  dashboard: DashboardListItem;
  onCheckboxChange: (id: string, checked: boolean) => void;
  isSelected: boolean;
  onEdit?: (dashboard: DashboardListItem) => void;
  onDelete?: (dashboard: DashboardListItem) => void;
}

export default function DashboardsTableItem({
  dashboard,
  onCheckboxChange,
  isSelected,
  onEdit,
  onDelete,
}: DashboardsTableItemProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onCheckboxChange(dashboard.dashboard_id, e.target.checked);
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
    onEdit?.(dashboard);
    setDropdownOpen(false);
  };

  const handleDelete = () => {
    onDelete?.(dashboard);
    setDropdownOpen(false);
  };

  const getChartCountBadgeColor = (count: number) => {
    if (count === 0) return 'bg-gray-100 dark:bg-gray-900/20 text-gray-800 dark:text-gray-200';
    if (count <= 3) return 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200';
    if (count <= 6) return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200';
    return 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200';
  };

  return (
    <tr>
      {/* Checkbox */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="flex items-center">
          <label className="inline-flex">
            <span className="sr-only">Select dashboard</span>
            <input
              className="form-checkbox"
              type="checkbox"
              onChange={handleCheckboxChange}
              checked={isSelected}
            />
          </label>
        </div>
      </td>

      {/* Dashboard Name */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="flex items-center">
          <div>
            <div className="font-medium text-gray-800 dark:text-gray-100">
              {dashboard.dashboard_name}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              ID: {dashboard.dashboard_id.slice(0, 8)}...
            </div>
          </div>
        </div>
      </td>

      {/* Description */}
      <td className="px-2 first:pl-5 last:pr-5 py-3">
        <div className="text-gray-800 dark:text-gray-100 max-w-xs truncate">
          {dashboard.dashboard_description || (
            <span className="text-gray-400 dark:text-gray-500 italic">No description</span>
          )}
        </div>
      </td>

      {/* Chart Count */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-center">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getChartCountBadgeColor(dashboard.chart_count)}`}>
          {dashboard.chart_count} {dashboard.chart_count === 1 ? 'chart' : 'charts'}
        </span>
      </td>

      {/* Category */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-gray-800 dark:text-gray-100">
          {dashboard.category_name || (
            <span className="text-gray-400 dark:text-gray-500 italic">Uncategorized</span>
          )}
        </div>
      </td>

      {/* Created By */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-gray-800 dark:text-gray-100">
          {dashboard.creator_name && dashboard.creator_last_name 
            ? `${dashboard.creator_name} ${dashboard.creator_last_name}`
            : dashboard.created_by || 'Unknown'
          }
        </div>
      </td>

      {/* Created Date */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-gray-800 dark:text-gray-100">
          {new Date(dashboard.created_at).toLocaleDateString()}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {new Date(dashboard.created_at).toLocaleTimeString()}
        </div>
      </td>

      {/* Actions Menu */}
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
            <div className="origin-top-right z-50 fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 py-1.5 rounded-lg shadow-lg overflow-hidden min-w-36"
                 style={{
                   top: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().bottom + 4 : 0,
                   left: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().right - 144 : 0
                 }}>
              <ul>
                {onEdit && (
                  <li>
                    <button
                      type="button"
                      className="font-medium text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 flex py-1 px-3 w-full text-left"
                      onClick={handleEdit}
                    >
                      Edit Dashboard
                    </button>
                  </li>
                )}
                <li>
                  <button
                    type="button"
                    className="font-medium text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 flex py-1 px-3 w-full text-left"
                    onClick={() => {
                      navigator.clipboard.writeText(dashboard.dashboard_id);
                      setDropdownOpen(false);
                    }}
                  >
                    Copy ID
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="font-medium text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 flex py-1 px-3 w-full text-left"
                    onClick={() => {
                      // TODO: Implement dashboard preview
                      setDropdownOpen(false);
                    }}
                  >
                    Preview Dashboard
                  </button>
                </li>
                {onDelete && (
                  <li>
                    <button
                      type="button"
                      className="font-medium text-sm text-red-500 hover:text-red-600 flex py-1 px-3 w-full text-left"
                      onClick={handleDelete}
                    >
                      Delete Dashboard
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
