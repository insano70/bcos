'use client';

import { ChartFilter, MeasureType, MultipleSeriesConfig } from '@/lib/types/analytics';
import AdvancedFilterBuilder from './advanced-filter-builder';
import { calculatedFieldsService } from '@/lib/services/calculated-fields';
import { ChartConfig } from './chart-builder-core';
import HistoricalComparisonWidget from './historical-comparison-widget';
import TrendAnalysisDashboard from './trend-analysis-dashboard';
import AnomalyMonitoringDashboard from './anomaly-monitoring-dashboard';
import AnomalyRuleConfigurator from './anomaly-rule-configurator';
import AccordionBasic from '@/components/accordion-basic';

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
  availableMeasures: Array<{ measure: string }>;
  availableFrequencies: Array<{ frequency: string }>;
}

interface ChartBuilderAdvancedProps {
  schemaInfo: SchemaInfo;
  chartConfig: ChartConfig;
  updateConfig: (key: keyof ChartConfig, value: string | boolean | ChartFilter[] | undefined) => void;
  handleAdvancedFiltersChange: (filters: ChartFilter[]) => void;
  addSeries: () => void;
  updateSeries: (seriesId: string, updates: Partial<MultipleSeriesConfig>) => void;
  removeSeries: (seriesId: string) => void;
}

export default function ChartBuilderAdvanced({
  schemaInfo,
  chartConfig,
  updateConfig,
  handleAdvancedFiltersChange,
  addSeries,
  updateSeries,
  removeSeries
}: ChartBuilderAdvancedProps) {
  const availableCalculatedFields = calculatedFieldsService.getAvailableCalculatedFields();

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
        Advanced Options
      </h3>

      {/* Calculated Fields */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Calculated Field (Optional)
        </label>
        <select
          value={chartConfig.calculatedField || ''}
          onChange={(e) => updateConfig('calculatedField', e.target.value || undefined)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        >
          <option value="">No calculated field</option>
          {availableCalculatedFields.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name} - {field.description}
            </option>
          ))}
        </select>
      </div>

      {/* Advanced Filtering Toggle */}
      <div className="mb-6">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={chartConfig.useAdvancedFiltering}
            onChange={(e) => updateConfig('useAdvancedFiltering', e.target.checked)}
            className="mr-2 text-violet-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Enable Advanced Filtering
          </span>
        </label>

        {chartConfig.useAdvancedFiltering && (
          <div className="mt-4">
            <AdvancedFilterBuilder
              availableFields={Object.entries(schemaInfo.fields).map(([key, field]) => {
                const fieldDef = {
                  name: key,
                  displayName: field.name,
                  type: field.type
                };
                if (field.allowedValues) {
                  (fieldDef as any).allowedValues = field.allowedValues;
                }
                return fieldDef;
              })}
              onFiltersChange={handleAdvancedFiltersChange}
              initialFilters={chartConfig.advancedFilters}
            />
          </div>
        )}
      </div>

      {/* Stacking Mode - Only for stacked-bar charts */}
      {chartConfig.chartType === 'stacked-bar' && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Stacking Mode
          </label>
          <select
            value={chartConfig.stackingMode || 'normal'}
            onChange={(e) => updateConfig('stackingMode', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="normal">Normal Stacked</option>
            <option value="percentage">100% Stacked (Percentage)</option>
          </select>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Normal: Show actual values stacked. Percentage: Normalize to 100% to compare proportions.
          </p>
        </div>
      )}

      {/* Multiple Series Toggle */}
      {(chartConfig.chartType === 'line' || chartConfig.chartType === 'bar') && (
        <div className="mb-6">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={chartConfig.useMultipleSeries}
              onChange={(e) => updateConfig('useMultipleSeries', e.target.checked)}
              className="mr-2 text-violet-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Enable Multiple Series (Different Aggregations)
            </span>
          </label>

          {chartConfig.useMultipleSeries && (
            <div className="mt-4 space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-md font-medium text-gray-800 dark:text-gray-200">
                  Series Configuration
                </h4>
                <button
                  onClick={addSeries}
                  className="px-3 py-1 bg-violet-500 text-white text-sm rounded hover:bg-violet-600 transition-colors"
                >
                  Add Series
                </button>
              </div>

              {chartConfig.seriesConfigs.map((series, index) => (
                <div key={series.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h5 className="font-medium text-gray-700 dark:text-gray-300">
                      Series {index + 1}
                    </h5>
                    <button
                      onClick={() => removeSeries(series.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Measure
                      </label>
                      <select
                        value={series.measure}
                        onChange={(e) => updateSeries(series.id, { measure: e.target.value as MeasureType })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        {schemaInfo.availableMeasures.map((measure) => (
                          <option key={measure.measure} value={measure.measure}>
                            {measure.measure}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Aggregation
                      </label>
                      <select
                        value={series.aggregation}
                        onChange={(e) => updateSeries(series.id, { aggregation: e.target.value as 'sum' | 'avg' | 'count' | 'min' | 'max' })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        <option value="sum">Sum</option>
                        <option value="avg">Average</option>
                        <option value="count">Count</option>
                        <option value="min">Minimum</option>
                        <option value="max">Maximum</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Label
                      </label>
                      <input
                        type="text"
                        value={series.label}
                        onChange={(e) => updateSeries(series.id, { label: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Color (Optional)
                      </label>
                      <input
                        type="color"
                        value={series.color || '#00AEEF'}
                        onChange={(e) => updateSeries(series.id, { color: e.target.value })}
                        className="w-full h-8 border border-gray-300 dark:border-gray-600 rounded"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Analysis Section - Hidden under accordion */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
        <AccordionBasic title="Analysis">
          <div className="space-y-6 pt-4">
            {/* Historical Analysis Section */}
            {chartConfig.measure && chartConfig.frequency && (
              <div>
                <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4">
                  Historical Analysis
                </h4>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Historical Comparison */}
                  <HistoricalComparisonWidget
                    measure={typeof chartConfig.measure === 'object' ? (chartConfig.measure as any).measure : chartConfig.measure as any}
                    frequency={typeof chartConfig.frequency === 'object' ? (chartConfig.frequency as any).frequency : chartConfig.frequency as any}
                    practiceUid={chartConfig.practiceUid}
                    className="h-fit"
                  />
                  
                  {/* Trend Analysis */}
                  <TrendAnalysisDashboard
                    measure={typeof chartConfig.measure === 'object' ? (chartConfig.measure as any).measure : chartConfig.measure as any}
                    frequency={typeof chartConfig.frequency === 'object' ? (chartConfig.frequency as any).frequency : chartConfig.frequency as any}
                    practiceUid={chartConfig.practiceUid}
                    periods={12}
                    className="h-fit"
                  />
                </div>
              </div>
            )}

            {/* Anomaly Detection Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4">
                Anomaly Detection & Monitoring
              </h4>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Anomaly Monitoring Dashboard */}
                <AnomalyMonitoringDashboard className="h-fit" />
                
                {/* Anomaly Rule Configurator */}
                <AnomalyRuleConfigurator
                  measure={typeof chartConfig.measure === 'object' ? (chartConfig.measure as any).measure : chartConfig.measure as any}
                  className="h-fit"
                />
              </div>
            </div>
          </div>
        </AccordionBasic>
      </div>
    </div>
  );
}
