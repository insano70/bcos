'use client';

import type { ChartConfig } from './chart-builder-core';

interface ChartBuilderSaveProps {
  chartConfig: ChartConfig;
  isSaving: boolean;
  onBackToPreview: () => void;
  onSave: () => void;
}

export default function ChartBuilderSave({
  chartConfig,
  isSaving,
  onBackToPreview,
  onSave,
}: ChartBuilderSaveProps) {
  return (
    <div className="space-y-6">
      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-4">
          Ready to Save: {chartConfig.chartName}
        </h3>

        <div className="space-y-2 text-sm text-green-700 dark:text-green-300">
          <div>
            <strong>Type:</strong> {chartConfig.chartType}
          </div>
          <div>
            <strong>Measure:</strong> {chartConfig.measure}
          </div>
          <div>
            <strong>Frequency:</strong> {chartConfig.frequency}
          </div>
          <div>
            <strong>Group By:</strong> {chartConfig.groupBy}
          </div>
          {chartConfig.calculatedField && (
            <div>
              <strong>Calculated Field:</strong> {chartConfig.calculatedField}
            </div>
          )}
          {chartConfig.useAdvancedFiltering && (
            <div>
              <strong>Advanced Filters:</strong> Enabled ({chartConfig.advancedFilters.length}{' '}
              filters)
            </div>
          )}
          {chartConfig.useMultipleSeries && (
            <div>
              <strong>Multiple Series:</strong> Enabled ({chartConfig.seriesConfigs.length} series)
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={onBackToPreview}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Back to Preview
        </button>

        <button type="button" onClick={onSave}
          disabled={isSaving}
          className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Chart Definition'}
        </button>
      </div>
    </div>
  );
}
