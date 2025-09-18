'use client';

import { useState, useEffect, useRef } from 'react';
import type { ChartDefinitionListItem } from './charts-table';

interface ChartsTableItemProps {
  chart: ChartDefinitionListItem;
  onCheckboxChange: (id: string, checked: boolean) => void;
  isSelected: boolean;
  onEdit?: (chart: ChartDefinitionListItem) => void | undefined;
  onDelete?: (chartId: string) => void | undefined;
}

export default function ChartsTableItem({
  chart,
  onCheckboxChange,
  isSelected,
  onEdit,
  onDelete,
}: ChartsTableItemProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onCheckboxChange(chart.chart_definition_id, e.target.checked);
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
    onEdit?.(chart);
    setDropdownOpen(false);
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${chart.chart_name}"?`)) {
      onDelete?.(chart.chart_definition_id);
    }
    setDropdownOpen(false);
  };

  const getChartTypeIcon = (type: string) => {
    switch (type) {
      case 'line': return '📈';
      case 'bar': return '📊';
      case 'pie': return '🥧';
      case 'doughnut': return '🍩';
      case 'area': return '🏔️';
      default: return '📊';
    }
  };

  const getChartTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'line': return 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200';
      case 'bar': return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200';
      case 'pie': return 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200';
      case 'doughnut': return 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200';
      case 'area': return 'bg-teal-100 dark:bg-teal-900/20 text-teal-800 dark:text-teal-200';
      default: return 'bg-gray-100 dark:bg-gray-900/20 text-gray-800 dark:text-gray-200';
    }
  };

  return (
    <tr>
      {/* Checkbox */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="flex items-center">
          <label className="inline-flex">
            <span className="sr-only">Select chart</span>
            <input
              className="form-checkbox"
              type="checkbox"
              onChange={handleCheckboxChange}
              checked={isSelected}
            />
          </label>
        </div>
      </td>

      {/* Chart Name */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="flex items-center">
          <div>
            <div className="font-medium text-gray-800 dark:text-gray-100">
              {chart.chart_name}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              ID: {chart.chart_definition_id.slice(0, 8)}...
            </div>
          </div>
        </div>
      </td>

      {/* Chart Type */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="flex items-center">
          <span className="mr-2">{getChartTypeIcon(chart.chart_type)}</span>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getChartTypeBadgeColor(chart.chart_type)}`}>
            {chart.chart_type}
          </span>
        </div>
      </td>

      {/* Description */}
      <td className="px-2 first:pl-5 last:pr-5 py-3">
        <div className="text-gray-800 dark:text-gray-100 max-w-xs truncate">
          {chart.chart_description || (
            <span className="text-gray-400 dark:text-gray-500 italic">No description</span>
          )}
        </div>
      </td>

      {/* Category */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-gray-800 dark:text-gray-100">
          {chart.category_name || (
            <span className="text-gray-400 dark:text-gray-500 italic">Uncategorized</span>
          )}
        </div>
      </td>

      {/* Status */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-center">
        <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          chart.is_active
            ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
            : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200'
        }`}>
          {chart.is_active ? 'Active' : 'Inactive'}
        </div>
      </td>

      {/* Created By */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-gray-800 dark:text-gray-100">
          {chart.creator_name && chart.creator_last_name 
            ? `${chart.creator_name} ${chart.creator_last_name}`
            : chart.created_by || 'Unknown'
          }
        </div>
      </td>

      {/* Created Date */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-gray-800 dark:text-gray-100">
          {new Date(chart.created_at).toLocaleDateString()}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {new Date(chart.created_at).toLocaleTimeString()}
        </div>
      </td>

      {/* Actions Menu */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="relative inline-flex" ref={dropdownRef}>
          <button
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
            <div className="origin-top-right z-10 absolute top-full right-0 min-w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 py-1.5 rounded-lg shadow-lg overflow-hidden mt-1">
              <ul>
                {onEdit && (
                  <li>
                    <button
                      className="font-medium text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 flex py-1 px-3 w-full text-left"
                      onClick={handleEdit}
                    >
                      Edit Chart
                    </button>
                  </li>
                )}
                <li>
                  <button
                    className="font-medium text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 flex py-1 px-3 w-full text-left"
                    onClick={() => {
                      navigator.clipboard.writeText(chart.chart_definition_id);
                      setDropdownOpen(false);
                    }}
                  >
                    Copy ID
                  </button>
                </li>
                <li>
                  <button
                    className="font-medium text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 flex py-1 px-3 w-full text-left"
                    onClick={() => {
                      // TODO: Implement chart preview
                      setDropdownOpen(false);
                    }}
                  >
                    Preview Chart
                  </button>
                </li>
                {onDelete && (
                  <li>
                    <button
                      className="font-medium text-sm text-red-500 hover:text-red-600 flex py-1 px-3 w-full text-left"
                      onClick={handleDelete}
                    >
                      Delete Chart
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
