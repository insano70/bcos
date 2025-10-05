'use client';

import { useItemSelection } from '@/components/utils/use-item-selection';
import { useTableSort } from '@/lib/hooks/use-table-sort';
import type { DashboardListItem } from '@/lib/types/analytics';
import DashboardsTableItem from './dashboards-table-item';

interface DashboardsTableProps {
  dashboards: DashboardListItem[];
  onEdit?: (dashboard: DashboardListItem) => void;
  onDelete?: (dashboard: DashboardListItem) => void;
  onPreview?: (dashboard: DashboardListItem) => void;
  onPublish?: (dashboard: DashboardListItem) => void;
  onUnpublish?: (dashboard: DashboardListItem) => void;
}

export default function DashboardsTable({
  dashboards,
  onEdit,
  onDelete,
  onPreview,
  onPublish,
  onUnpublish,
}: DashboardsTableProps) {
  // Filter out invalid dashboards and map to have 'id' property for useItemSelection
  const validDashboards = dashboards.filter(
    (dashboard) =>
      dashboard?.dashboard_id &&
      typeof dashboard.dashboard_id === 'string' &&
      dashboard.dashboard_id.trim().length > 0
  );

  const dashboardsWithId = validDashboards.map((dashboard, index) => ({
    ...dashboard,
    id: dashboard.dashboard_id,
    // Ensure unique keys by adding index as fallback
    _uniqueKey: `${dashboard.dashboard_id}-${index}`,
  }));

  const { selectedItems, isAllSelected, handleCheckboxChange, handleSelectAllChange } =
    useItemSelection(dashboardsWithId);
  const { sortedData, handleSort, getSortIcon } = useTableSort(dashboardsWithId);

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl relative">
      <header className="px-5 py-4">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">
          All Dashboards{' '}
          <span className="text-gray-400 dark:text-gray-500 font-medium">
            {validDashboards.filter((dashboard) => dashboard.is_active !== false).length}
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
                  <button
                    type="button"
                    onClick={() => handleSort('dashboard_name')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Dashboard Name</span>
                    {getSortIcon('dashboard_name')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('dashboard_description')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Description</span>
                    {getSortIcon('dashboard_description')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('chart_count')}
                    className="flex items-center justify-center gap-1 font-semibold hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer w-full"
                  >
                    <span>Charts</span>
                    {getSortIcon('chart_count')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('category_name')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Category</span>
                    {getSortIcon('category_name')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('is_active')}
                    className="flex items-center justify-center gap-1 font-semibold hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer w-full"
                  >
                    <span>Status</span>
                    {getSortIcon('is_active')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('creator_name')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Created By</span>
                    {getSortIcon('creator_name')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('created_at')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Created</span>
                    {getSortIcon('created_at')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <span className="sr-only">Menu</span>
                </th>
              </tr>
            </thead>
            {/* Table body */}
            <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
              {sortedData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-2 first:pl-5 last:pr-5 py-12 text-center">
                    <div className="text-gray-500 dark:text-gray-400">
                      📊{' '}
                      {dashboards.length > 0 ? 'No valid dashboards found' : 'No dashboards found'}
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">
                      {dashboards.length > 0
                        ? 'Dashboard data appears to be corrupted. Please check the logs.'
                        : 'Create your first dashboard to get started'}
                    </p>
                  </td>
                </tr>
              ) : (
                sortedData.map((dashboard) => (
                  <DashboardsTableItem
                    key={dashboard._uniqueKey}
                    dashboard={dashboard}
                    onCheckboxChange={handleCheckboxChange}
                    isSelected={selectedItems.includes(dashboard.dashboard_id)}
                    {...(onEdit && { onEdit })}
                    {...(onDelete && { onDelete })}
                    {...(onPreview && { onPreview })}
                    {...(onPublish && { onPublish })}
                    {...(onUnpublish && { onUnpublish })}
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
