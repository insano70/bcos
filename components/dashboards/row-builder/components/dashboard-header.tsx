'use client';

import type { RowBasedDashboardConfig } from '@/components/charts/dashboard-row-builder';

interface DashboardHeaderProps {
  config: RowBasedDashboardConfig;
  onUpdateConfig: (updates: Partial<RowBasedDashboardConfig>) => void;
  isEditMode: boolean;
  onCancel?: (() => void) | undefined;
}

/**
 * Dashboard header with metadata inputs (name, description)
 *
 * Displays the page title, description, and metadata input fields
 * for dashboard name and description. Shows a back button if onCancel is provided.
 */
export default function DashboardHeader({
  config,
  onUpdateConfig,
  isEditMode,
  onCancel,
}: DashboardHeaderProps) {
  return (
    <>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isEditMode ? 'Edit Dashboard' : 'Row-Based Dashboard Builder'}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {isEditMode
                ? `Editing: ${config.dashboardName || 'Unnamed Dashboard'}`
                : 'Create dashboards with flexible row-based layouts'}
            </p>
          </div>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              ← Back to Dashboards
            </button>
          )}
        </div>
      </div>

      {/* Dashboard Metadata Inputs */}
      <div className="p-6 pb-0">
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Dashboard Name *
            </label>
            <input
              type="text"
              value={config.dashboardName}
              onChange={(e) => onUpdateConfig({ dashboardName: e.target.value })}
              placeholder="Enter dashboard name"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <input
              type="text"
              value={config.dashboardDescription}
              onChange={(e) => onUpdateConfig({ dashboardDescription: e.target.value })}
              placeholder="Dashboard description"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
      </div>
    </>
  );
}
