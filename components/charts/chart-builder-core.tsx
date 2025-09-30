'use client';

import { ChartFilter, MeasureType, MultipleSeriesConfig } from '@/lib/types/analytics';
import DateRangePresets from './date-range-presets';
import DataSourceSelector from './data-source-selector';
import ColorPaletteSelector from './color-palette-selector';

interface FieldDefinition {
  name: string;
  type: string;
  description: string;
  example: unknown;
  groupable: boolean;
  filterable: boolean;
  aggregatable?: boolean;
  allowedValues?: string[];
}

interface SchemaInfo {
  fields: Record<string, FieldDefinition>;
  availableMeasures: Array<{ measure: string }>;
  availableFrequencies: Array<{ frequency: string }>;
  availableGroupByFields: Array<{ columnName: string; displayName: string }>;
}

export interface DataSource {
  id: number;
  name: string;
  description: string | null;
  tableName: string;
  schemaName: string;
}

export interface ChartConfig {
  chartName: string;
  chartType: 'line' | 'bar' | 'stacked-bar' | 'doughnut';
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
  selectedDataSource: DataSource | null;
  stackingMode?: 'normal' | 'percentage';
  colorPalette?: string;
}

interface ChartBuilderCoreProps {
  schemaInfo: SchemaInfo | null;
  chartConfig: ChartConfig;
  updateConfig: (key: keyof ChartConfig, value: string | boolean | ChartFilter[] | DataSource | null | undefined) => void;
  handleDateRangeChange: (presetId: string, startDate: string, endDate: string) => void;
  selectedDatePreset?: string;
  isLoadingSchema: boolean;
}

export default function ChartBuilderCore({
  schemaInfo,
  chartConfig,
  updateConfig,
  handleDateRangeChange,
  selectedDatePreset = 'custom',
  isLoadingSchema
}: ChartBuilderCoreProps) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
        Basic Configuration
      </h3>

      {/* Data Source Selector - Always Visible */}
      <DataSourceSelector
        selectedDataSource={chartConfig.selectedDataSource}
        onDataSourceChange={(dataSource) => updateConfig('selectedDataSource', dataSource)}
        className="mb-6"
      />

      {/* Schema-dependent fields - Conditional */}
      {isLoadingSchema ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mb-3"></div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Loading schema for {chartConfig.selectedDataSource?.name}...
          </p>
        </div>
      ) : !schemaInfo ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <svg className="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          <p className="mb-2">Please select a data source to begin</p>
        </div>
      ) : (
        <>
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
            <option value="stacked-bar">Stacked Bar Chart</option>
            <option value="line">Line Chart</option>
            <option value="doughnut">Doughnut Chart</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Measure - Hidden when multiple series is enabled */}
        {!chartConfig.useMultipleSeries ? (
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
                  {measure.measure}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md border border-blue-200 dark:border-blue-800">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Multiple Series Mode Enabled
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Individual measures are configured in the Advanced Options section below. Each series can have its own measure and aggregation method.
                </p>
              </div>
            </div>
          </div>
        )}

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
                {freq.frequency}
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
            {schemaInfo.availableGroupByFields.map((field) => (
              <option key={field.columnName} value={field.columnName}>
                {field.displayName}
              </option>
            ))}
          </select>
          {chartConfig.chartType === 'stacked-bar' && (
            <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Stacked Bar Charts
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Stacked bars show each group (Provider, Practice, etc.) as a colored segment in a single bar per time period. Select a Group By option to create multiple stack segments.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Date Range Selection */}
        <div className="md:col-span-2">
          <DateRangePresets
            onDateRangeChange={handleDateRangeChange}
            currentStartDate={chartConfig.startDate}
            currentEndDate={chartConfig.endDate}
            selectedPreset={selectedDatePreset}
          />
        </div>
      </div>

      {/* Color Palette Selector - Full Width */}
      <div className="mt-6">
        <ColorPaletteSelector
          value={chartConfig.colorPalette || 'default'}
          onChange={(paletteId) => updateConfig('colorPalette', paletteId)}
        />
      </div>
        </>
      )}
    </div>
  );
}
