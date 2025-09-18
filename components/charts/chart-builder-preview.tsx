'use client';

import AnalyticsChart from './analytics-chart';
import { ChartConfig } from './chart-builder-core';

interface ChartBuilderPreviewProps {
  chartConfig: ChartConfig;
  previewKey: number;
  onBackToConfigure: () => void;
  onProceedToSave: () => void;
}

export default function ChartBuilderPreview({
  chartConfig,
  previewKey,
  onBackToConfigure,
  onProceedToSave
}: ChartBuilderPreviewProps) {
  return (
    <div className="space-y-6">
      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
          Chart Preview: {chartConfig.chartName}
        </h3>
        
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
            {...(chartConfig.useMultipleSeries && chartConfig.seriesConfigs.length > 0 ? { multipleSeries: chartConfig.seriesConfigs } : {})}
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
          onClick={onProceedToSave}
          className="px-6 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors"
        >
          Save Chart
        </button>
      </div>
    </div>
  );
}
