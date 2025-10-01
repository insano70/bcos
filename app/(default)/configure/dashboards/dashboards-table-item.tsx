'use client';

import { useEffect, useRef, useState } from 'react';
import type { DashboardListItem } from '@/lib/types/analytics';

interface DashboardsTableItemProps {
  dashboard: DashboardListItem;
  onCheckboxChange: (id: string, checked: boolean) => void;
  isSelected: boolean;
  onEdit?: (dashboard: DashboardListItem) => void;
  onDelete?: (dashboard: DashboardListItem) => void;
  onPreview?: (dashboard: DashboardListItem) => void;
  onPublish?: (dashboard: DashboardListItem) => void;
  onUnpublish?: (dashboard: DashboardListItem) => void;
}

export default function DashboardsTableItem({
  dashboard,
  onCheckboxChange,
  isSelected,
  onEdit,
  onDelete,
  onPreview,
  onPublish,
  onUnpublish,
}: DashboardsTableItemProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside - must be at top level
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

  // Safety check - if dashboard is invalid, render error row
  if (!dashboard || !dashboard.dashboard_id) {
    return (
      <tr>
        <td colSpan={9} className="px-2 first:pl-5 last:pr-5 py-3 text-center text-red-500">
          ❌ Invalid dashboard data
        </td>
      </tr>
    );
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onCheckboxChange(dashboard.dashboard_id, e.target.checked);
  };

  const handleEdit = () => {
    onEdit?.(dashboard);
    setDropdownOpen(false);
  };

  const handleDelete = () => {
    onDelete?.(dashboard);
    setDropdownOpen(false);
  };

  const handlePreview = () => {
    onPreview?.(dashboard);
    setDropdownOpen(false);
  };

  const handlePublish = () => {
    onPublish?.(dashboard);
    setDropdownOpen(false);
  };

  const handleUnpublish = () => {
    onUnpublish?.(dashboard);
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
              {dashboard.dashboard_name || 'Unnamed Dashboard'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              ID: {dashboard.dashboard_id?.slice(0, 8) || 'unknown'}...
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
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getChartCountBadgeColor(dashboard.chart_count)}`}
        >
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

      {/* Status */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-center">
        {dashboard.is_published ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200">
            <svg className="w-1.5 h-1.5 mr-1.5" fill="currentColor" viewBox="0 0 8 8">
              <circle cx={4} cy={4} r={3} />
            </svg>
            Published
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200">
            <svg className="w-1.5 h-1.5 mr-1.5" fill="currentColor" viewBox="0 0 8 8">
              <circle cx={4} cy={4} r={3} />
            </svg>
            Under Development
          </span>
        )}
      </td>

      {/* Created By */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-gray-800 dark:text-gray-100">
          {dashboard.creator_name && dashboard.creator_last_name
            ? `${dashboard.creator_name} ${dashboard.creator_last_name}`
            : dashboard.created_by || 'Unknown'}
        </div>
      </td>

      {/* Created Date */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-gray-800 dark:text-gray-100">
          {dashboard.created_at ? new Date(dashboard.created_at).toLocaleDateString() : 'Unknown'}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {dashboard.created_at ? new Date(dashboard.created_at).toLocaleTimeString() : ''}
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
            <svg
              className="w-8 h-8 fill-current text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400"
              viewBox="0 0 32 32"
            >
              <circle cx="16" cy="16" r="2" />
              <circle cx="10" cy="16" r="2" />
              <circle cx="22" cy="16" r="2" />
            </svg>
          </button>
          {dropdownOpen && (
            <div
              className="origin-top-right z-50 fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 py-1.5 rounded-lg shadow-lg overflow-hidden min-w-36"
              style={{
                top: dropdownRef.current
                  ? dropdownRef.current.getBoundingClientRect().bottom + 4
                  : 0,
                left: dropdownRef.current
                  ? dropdownRef.current.getBoundingClientRect().right - 144
                  : 0,
              }}
            >
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
                    onClick={handlePreview}
                  >
                    Preview Dashboard
                  </button>
                </li>
                {/* Publish/Unpublish actions - shown conditionally based on status */}
                {!dashboard.is_published && onPublish && (
                  <li>
                    <button
                      type="button"
                      className="font-medium text-sm text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 flex py-1 px-3 w-full text-left"
                      onClick={handlePublish}
                    >
                      Publish Dashboard
                    </button>
                  </li>
                )}
                {dashboard.is_published && onUnpublish && (
                  <li>
                    <button
                      type="button"
                      className="font-medium text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 flex py-1 px-3 w-full text-left"
                      onClick={handleUnpublish}
                    >
                      Unpublish Dashboard
                    </button>
                  </li>
                )}
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
