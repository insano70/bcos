'use client';

import { useItemSelection } from '@/components/utils/use-item-selection';
import DashboardsTableItem from './dashboards-table-item';
import type { DashboardListItem } from '@/lib/types/analytics';

interface DashboardsTableProps {
  dashboards: DashboardListItem[];
  onEdit?: (dashboard: DashboardListItem) => void;
  onDelete?: (dashboard: DashboardListItem) => void;
  onPreview?: (dashboard: DashboardListItem) => void;
}

export default function DashboardsTable({ dashboards, onEdit, onDelete, onPreview }: DashboardsTableProps) {
  // Map dashboards to have 'id' property for useItemSelection
  const dashboardsWithId = dashboards.map(dashboard => ({ ...dashboard, id: dashboard.dashboard_id }));
  
  const {
    selectedItems,
    isAllSelected,
    handleCheckboxChange,
    handleSelectAllChange,
  } = useItemSelection(dashboardsWithId);

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl relative">
      <header className="px-5 py-4">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">
          All Dashboards{' '}
          <span className="text-gray-400 dark:text-gray-500 font-medium">
            {dashboards.filter(dashboard => dashboard.is_active !== false).length}
          </span>
        </h2>
      </header>
      <div>
        {/* Table */}
        <div className="overflow-x-auto">
          <table className="table-auto w-full dark:text-gray-300">
            {/* Table header */}
            <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
              <tr>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
                  <div className="flex items-center">
                    <label className="inline-flex">
                      <span className="sr-only">Select all</span>
                      <input
                        className="form-checkbox"
                        type="checkbox"
                        onChange={handleSelectAllChange}
                        checked={isAllSelected}
                      />
                    </label>
                  </div>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <div className="font-semibold text-left">Dashboard Name</div>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <div className="font-semibold text-left">Description</div>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <div className="font-semibold text-center">Charts</div>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <div className="font-semibold text-left">Category</div>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <div className="font-semibold text-left">Created By</div>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <div className="font-semibold text-left">Created</div>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <span className="sr-only">Menu</span>
                </th>
              </tr>
            </thead>
            {/* Table body */}
            <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
              {dashboards.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-2 first:pl-5 last:pr-5 py-12 text-center">
                    <div className="text-gray-500 dark:text-gray-400">
                      📊 No dashboards found
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">
                      Create your first dashboard to get started
                    </p>
                  </td>
                </tr>
              ) : (
                dashboards.map((dashboard) => (
                  <DashboardsTableItem
                    key={dashboard.dashboard_id}
                    dashboard={dashboard}
                    onCheckboxChange={handleCheckboxChange}
                    isSelected={selectedItems.includes(dashboard.dashboard_id)}
                    {...(onEdit && { onEdit })}
                    {...(onDelete && { onDelete })}
                    {...(onPreview && { onPreview })}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
