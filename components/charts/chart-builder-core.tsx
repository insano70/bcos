'use client';

import { ChartFilter, MeasureType, MultipleSeriesConfig } from '@/lib/types/analytics';
import DateRangePresets from './date-range-presets';

interface FieldDefinition {
  name: string;
  type: string;
  description: string;
  example: any;
  groupable: boolean;
  filterable: boolean;
  aggregatable?: boolean;
  allowedValues?: string[];
}

interface SchemaInfo {
  fields: Record<string, FieldDefinition>;
  availableMeasures: Array<{ measure: string; count: string }>;
  availableFrequencies: Array<{ frequency: string; count: string }>;
}

export interface ChartConfig {
  chartName: string;
  chartType: 'line' | 'bar' | 'doughnut';
  measure: string;
  frequency: string;
  practiceUid: string;
  startDate: string;
  endDate: string;
  groupBy: string;
  calculatedField?: string | undefined;
  advancedFilters: ChartFilter[];
  useAdvancedFiltering: boolean;
  useMultipleSeries: boolean;
  seriesConfigs: MultipleSeriesConfig[];
}

interface ChartBuilderCoreProps {
  schemaInfo: SchemaInfo;
  chartConfig: ChartConfig;
  updateConfig: (key: keyof ChartConfig, value: string | boolean | ChartFilter[] | undefined) => void;
  handleDateRangeChange: (startDate: string, endDate: string) => void;
}

export default function ChartBuilderCore({
  schemaInfo,
  chartConfig,
  updateConfig,
  handleDateRangeChange
}: ChartBuilderCoreProps) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
        Basic Configuration
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Chart Name */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Chart Name *
          </label>
          <input
            type="text"
            value={chartConfig.chartName}
            onChange={(e) => updateConfig('chartName', e.target.value)}
            placeholder="Enter a descriptive name for your chart"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>

        {/* Chart Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Chart Type
          </label>
          <select
            value={chartConfig.chartType}
            onChange={(e) => updateConfig('chartType', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="bar">Bar Chart</option>
            <option value="line">Line Chart</option>
            <option value="doughnut">Doughnut Chart</option>
          </select>
        </div>

        {/* Measure */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Measure *
          </label>
          <select
            value={chartConfig.measure}
            onChange={(e) => updateConfig('measure', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">Select a measure...</option>
            {schemaInfo.availableMeasures.map((measure) => (
              <option key={measure.measure} value={measure.measure}>
                {measure.measure} ({measure.count} records)
              </option>
            ))}
          </select>
        </div>

        {/* Frequency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Frequency
          </label>
          <select
            value={chartConfig.frequency}
            onChange={(e) => updateConfig('frequency', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">All frequencies...</option>
            {schemaInfo.availableFrequencies.map((freq) => (
              <option key={freq.frequency} value={freq.frequency}>
                {freq.frequency} ({freq.count} records)
              </option>
            ))}
          </select>
        </div>

        {/* Practice Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Practice Filter
          </label>
          <input
            type="text"
            value={chartConfig.practiceUid}
            onChange={(e) => updateConfig('practiceUid', e.target.value)}
            placeholder="Filter by practice (e.g., 114)"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>

        {/* Date Range Selection */}
        <div className="md:col-span-2">
          <DateRangePresets
            onDateRangeChange={handleDateRangeChange}
            currentStartDate={chartConfig.startDate}
            currentEndDate={chartConfig.endDate}
          />
        </div>

        {/* Group By */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Group By
          </label>
          <select
            value={chartConfig.groupBy}
            onChange={(e) => updateConfig('groupBy', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="none">No Grouping</option>
            <option value="practice">Practice</option>
            <option value="provider_name">Provider</option>
            <option value="measure">Measure Type</option>
          </select>
        </div>
      </div>
    </div>
  );
}
