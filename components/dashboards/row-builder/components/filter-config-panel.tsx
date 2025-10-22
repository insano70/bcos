'use client';

import type { DashboardFilterConfig } from '@/lib/types/analytics';

interface FilterConfigPanelProps {
  config: DashboardFilterConfig;
  onChange: (config: DashboardFilterConfig) => void;
}

/**
 * Filter configuration panel UI
 *
 * Allows configuration of dashboard-wide filters including:
 * - Enable/disable filter bar
 * - Toggle visibility of individual filters (date range, organization, practice, provider)
 * - Set default filter values
 */
export default function FilterConfigPanel({ config, onChange }: FilterConfigPanelProps) {
  const updateConfig = (updates: Partial<DashboardFilterConfig>) => {
    onChange({ ...config, ...updates });
  };

  const updateDefaultFilters = (updates: Partial<DashboardFilterConfig['defaultFilters']>) => {
    onChange({
      ...config,
      defaultFilters: { ...config.defaultFilters, ...updates },
    });
  };

  return (
    <div className="mb-6 border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/30">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100">
            Dashboard Filters
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Configure dashboard-wide filters that apply to all charts
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => updateConfig({ enabled: e.target.checked })}
            className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
          />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Enable Filter Bar
          </span>
        </label>
      </div>

      {config.enabled && (
        <div className="space-y-4 pl-4 border-l-2 border-violet-200 dark:border-violet-800">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Visible Filters:
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showDateRange ?? true}
                onChange={(e) => updateConfig({ showDateRange: e.target.checked })}
                className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Date Range</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showOrganization ?? true}
                onChange={(e) => updateConfig({ showOrganization: e.target.checked })}
                className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Organization</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showPractice ?? false}
                onChange={(e) => updateConfig({ showPractice: e.target.checked })}
                className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Practice</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showProvider ?? false}
                onChange={(e) => updateConfig({ showProvider: e.target.checked })}
                className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Provider</span>
            </label>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Default Filter Values:
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Default Date Range Preset
                </label>
                <select
                  value={config.defaultFilters?.dateRangePreset || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value) {
                      updateDefaultFilters({ dateRangePreset: value });
                    } else {
                      const newDefaultFilters = { ...config.defaultFilters };
                      delete newDefaultFilters.dateRangePreset;
                      onChange({ ...config, defaultFilters: newDefaultFilters });
                    }
                  }}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">No Default (Use Chart Defaults)</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last_7_days">Last 7 Days</option>
                  <option value="last_14_days">Last 14 Days</option>
                  <option value="last_30_days">Last 30 Days</option>
                  <option value="last_90_days">Last 90 Days</option>
                  <option value="last_180_days">Last 180 Days</option>
                  <option value="last_365_days">Last 365 Days</option>
                  <option value="this_month">This Month</option>
                  <option value="last_month">Last Month</option>
                  <option value="last_3_full_months">Trailing 3 Months</option>
                  <option value="last_6_full_months">Trailing 6 Months</option>
                  <option value="last_12_full_months">Trailing 12 Months</option>
                  <option value="this_quarter">This Quarter</option>
                  <option value="last_quarter">Last Quarter</option>
                  <option value="ytd">Year to Date</option>
                  <option value="this_year">This Year</option>
                  <option value="last_year">Last Year</option>
                </select>
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              💡 Default values are applied when the dashboard loads. Users can override with URL
              parameters.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
