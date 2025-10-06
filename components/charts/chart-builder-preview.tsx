'use client';

import AnalyticsChart from './analytics-chart';
import { ChartConfig } from './chart-builder-core';

interface ChartBuilderPreviewProps {
  chartConfig: ChartConfig;
  previewKey: number;
  onBackToConfigure: () => void;
  onSave: () => void;
  isSaving: boolean;
}

export default function ChartBuilderPreview({
  chartConfig,
  previewKey,
  onBackToConfigure,
  onSave,
  isSaving
}: ChartBuilderPreviewProps) {
  return (
    <div className="space-y-6">
      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Chart Preview: {chartConfig.chartName}
          </h3>
          {chartConfig.periodComparison?.enabled && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Period Comparison Enabled
              </span>
            </div>
          )}
        </div>
        
        {/* Live Chart Preview */}
        <div className="bg-white dark:bg-gray-700 rounded-lg p-4">
          <AnalyticsChart
            key={previewKey}
            chartType={chartConfig.chartType}
            measure={chartConfig.measure as any}
            frequency={chartConfig.frequency as any}
            practice={chartConfig.practiceUid.trim() || undefined}
            startDate={chartConfig.startDate || undefined}
            endDate={chartConfig.endDate || undefined}
            groupBy={chartConfig.groupBy}
            width={700}
            height={400}
            title={chartConfig.chartName}
            calculatedField={chartConfig.calculatedField}
            advancedFilters={chartConfig.advancedFilters}
            dataSourceId={chartConfig.selectedDataSource?.id}
            stackingMode={chartConfig.stackingMode || 'normal'}
            colorPalette={chartConfig.colorPalette || 'default'}
            {...(chartConfig.useMultipleSeries && chartConfig.seriesConfigs.length > 0 ? { multipleSeries: chartConfig.seriesConfigs } : {})}
            {...(chartConfig.periodComparison?.enabled ? { periodComparison: chartConfig.periodComparison } : {})}
          />
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBackToConfigure}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Back to Configure
        </button>
        
        <button
          onClick={onSave}
          disabled={isSaving}
          className="px-6 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors disabled:opacity-50 flex items-center"
        >
          {isSaving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Saving...
            </>
          ) : (
            'Save Chart'
          )}
        </button>
      </div>
    </div>
  );
}
