'use client';

import type { FrequencyType, MeasureType } from '@/lib/types/analytics';
import { Spinner } from '@/components/ui/spinner';
import AnalyticsChart from './analytics-chart';
import type { ChartConfig } from './chart-builder-core';

interface ChartBuilderPreviewProps {
  chartConfig: ChartConfig;
  dateRangePreset?: string;
  previewKey: number;
  onBackToConfigure: () => void;
  onSave: () => void;
  isSaving: boolean;
}

export default function ChartBuilderPreview({
  chartConfig,
  dateRangePreset,
  previewKey,
  onBackToConfigure,
  onSave,
  isSaving,
}: ChartBuilderPreviewProps) {
  // Generate a more comprehensive key that includes colorPalette to force re-render
  const chartKey = `${previewKey}-${chartConfig.colorPalette || 'default'}`;

  return (
    <div className="space-y-6">
      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
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
        <div
          className="bg-white dark:bg-gray-700 rounded-lg p-4 flex flex-col"
          style={{ height: '500px', maxHeight: '500px', overflow: 'hidden' }}
        >
          <AnalyticsChart
            key={chartKey}
            chartType={chartConfig.chartType}
            measure={chartConfig.measure as MeasureType}
            frequency={chartConfig.frequency as FrequencyType}
            startDate={chartConfig.startDate || undefined}
            endDate={chartConfig.endDate || undefined}
            dateRangePreset={dateRangePreset}
            groupBy={chartConfig.groupBy}
            title={chartConfig.chartName}
            calculatedField={chartConfig.calculatedField}
            advancedFilters={chartConfig.advancedFilters}
            dataSourceId={chartConfig.selectedDataSource?.id}
            stackingMode={chartConfig.stackingMode || 'normal'}
            colorPalette={chartConfig.colorPalette || 'default'}
            className="w-full h-full flex-1"
            responsive={true}
            minHeight={200}
            maxHeight={400}
            nocache={true}
            {...(chartConfig.useMultipleSeries && chartConfig.seriesConfigs.length > 0
              ? { multipleSeries: chartConfig.seriesConfigs }
              : {})}
            {...(chartConfig.periodComparison?.enabled
              ? { periodComparison: chartConfig.periodComparison }
              : {})}
            {...(chartConfig.dualAxisConfig ? { dualAxisConfig: chartConfig.dualAxisConfig } : {})}
          />
        </div>
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={onBackToConfigure}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Back to Configure
        </button>

        <button type="button" onClick={onSave}
          disabled={isSaving}
          className="px-6 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors disabled:opacity-50 flex items-center"
        >
          {isSaving ? (
            <>
              <Spinner size="sm" className="mr-2" trackClassName="border-white/30" indicatorClassName="border-white" />
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
