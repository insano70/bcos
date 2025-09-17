'use client';

import { useState, useEffect } from 'react';
import AnalyticsChart from './analytics-chart';
import Toast from '@/components/toast';

/**
 * Functional Chart Builder
 * Actually builds working charts with real data awareness
 */

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

interface ChartConfig {
  chartName: string;
  chartType: 'line' | 'bar' | 'doughnut';
  measure: string;
  frequency: string;
  practiceUid: string;
  startDate: string;
  endDate: string;
  groupBy: string;
}

export default function FunctionalChartBuilder() {
  const [schemaInfo, setSchemaInfo] = useState<SchemaInfo | null>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(true);
  const [currentStep, setCurrentStep] = useState<'configure' | 'preview' | 'save'>('configure');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  
  const [chartConfig, setChartConfig] = useState<ChartConfig>({
    chartName: '',
    chartType: 'bar',
    measure: '',
    frequency: '',
    practiceUid: '114',
    startDate: '2024-01-01', // Default to last year
    endDate: '2025-12-31',   // Default to end of next year
    groupBy: 'provider_name'
  });

  const [previewKey, setPreviewKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Load schema information on mount
  useEffect(() => {
    loadSchemaInfo();
  }, []);

  const loadSchemaInfo = async () => {
    try {
      console.log('🔍 Loading analytics schema information...');
      
      const response = await fetch('/api/admin/analytics/schema');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setSchemaInfo(result.data);
      
      // Set default values based on schema
      if (result.data.availableMeasures.length > 0) {
        setChartConfig(prev => ({
          ...prev,
          measure: result.data.availableMeasures[0].measure
        }));
      }
      
      if (result.data.availableFrequencies.length > 0) {
        setChartConfig(prev => ({
          ...prev,
          frequency: result.data.availableFrequencies[0].frequency
        }));
      }

      console.log('✅ Schema loaded:', {
        fieldCount: Object.keys(result.data.fields).length,
        measureCount: result.data.availableMeasures.length
      });
      
    } catch (error) {
      console.error('❌ Failed to load schema:', error);
    } finally {
      setIsLoadingSchema(false);
    }
  };

  const updateConfig = (key: keyof ChartConfig, value: string) => {
    setChartConfig(prev => ({ ...prev, [key]: value }));
  };

  const handlePreview = () => {
    if (!chartConfig.chartName.trim()) {
      setToastMessage('Chart name is required');
      setToastType('error');
      setShowToast(true);
      return;
    }
    if (!chartConfig.measure) {
      setToastMessage('Measure selection is required');
      setToastType('error');
      setShowToast(true);
      return;
    }
    
    setPreviewKey(prev => prev + 1); // Force re-render of preview chart
    setCurrentStep('preview');
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      // Build chart definition from config
      const chartDefinition = {
        chart_name: chartConfig.chartName,
        chart_description: `${chartConfig.measure} - ${chartConfig.frequency} analysis`,
        chart_type: chartConfig.chartType,
        data_source: {
          table: 'ih.gr_app_measures',
          filters: [
            { field: 'measure', operator: 'eq', value: chartConfig.measure },
            { field: 'frequency', operator: 'eq', value: chartConfig.frequency },
            ...(chartConfig.practiceUid ? [{ field: 'practice_uid', operator: 'eq', value: chartConfig.practiceUid }] : []),
            ...(chartConfig.startDate ? [{ field: 'period_start', operator: 'gte', value: chartConfig.startDate }] : []),
            ...(chartConfig.endDate ? [{ field: 'period_end', operator: 'lte', value: chartConfig.endDate }] : [])
          ],
          groupBy: [chartConfig.groupBy, 'period_end'],
          orderBy: [{ field: 'period_end', direction: 'ASC' }]
        },
        chart_config: {
          x_axis: { field: 'period_end', label: 'Date', format: 'date' },
          y_axis: { field: 'measure_value', label: 'Amount', format: 'currency' },
          series: { groupBy: chartConfig.groupBy, colorPalette: 'default' },
          options: { responsive: true, showLegend: true, showTooltips: true, animation: true }
        }
      };

      console.log('💾 Saving chart definition:', chartDefinition);

      const response = await fetch('/api/admin/analytics/charts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chartDefinition),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save chart');
      }

      const result = await response.json();
      console.log('✅ Chart saved successfully:', result);
      
      setToastMessage(`Chart "${chartConfig.chartName}" saved successfully!`);
      setToastType('success');
      setShowToast(true);
      setCurrentStep('configure');
      
    } catch (error) {
      console.error('❌ Failed to save chart:', error);
      setToastMessage(`Failed to save chart: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingSchema) {
    return (
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading analytics schema...</span>
        </div>
      </div>
    );
  }

  if (!schemaInfo) {
    return (
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl p-8">
        <div className="text-center text-red-500">
          Failed to load analytics schema. Please check your database connection.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Functional Chart Builder
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Build charts with real data from ih.gr_app_measures
        </p>
      </div>

      {/* Step Navigation */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex space-x-6">
          {[
            { key: 'configure', label: 'Configure' },
            { key: 'preview', label: 'Preview' },
            { key: 'save', label: 'Save' }
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setCurrentStep(key as any)}
              className={`pb-2 border-b-2 font-medium text-sm ${
                currentStep === key
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="p-6">
        {currentStep === 'configure' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Chart Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Chart Name *
                </label>
                <input
                  type="text"
                  value={chartConfig.chartName}
                  onChange={(e) => updateConfig('chartName', e.target.value)}
                  placeholder="Enter chart name"
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
                  <option value="line">Line Chart</option>
                  <option value="bar">Bar Chart</option>
                  <option value="doughnut">Doughnut Chart</option>
                </select>
              </div>

              {/* Measure Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Measure *
                </label>
                <select
                  value={chartConfig.measure}
                  onChange={(e) => updateConfig('measure', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Select measure...</option>
                  {schemaInfo.availableMeasures.map((measure) => (
                    <option key={measure.measure} value={measure.measure}>
                      {measure.measure} ({measure.count} records)
                    </option>
                  ))}
                </select>
              </div>

              {/* Frequency Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Frequency
                </label>
                <select
                  value={chartConfig.frequency}
                  onChange={(e) => updateConfig('frequency', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {schemaInfo.availableFrequencies.map((freq) => (
                    <option key={freq.frequency} value={freq.frequency}>
                      {freq.frequency} ({freq.count} records)
                    </option>
                  ))}
                </select>
              </div>

              {/* Practice UID Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Practice UID (Optional)
                </label>
                <input
                  type="text"
                  value={chartConfig.practiceUid}
                  onChange={(e) => updateConfig('practiceUid', e.target.value)}
                  placeholder="Filter by practice (e.g., 114)"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={chartConfig.startDate}
                  onChange={(e) => updateConfig('startDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={chartConfig.endDate}
                  onChange={(e) => updateConfig('endDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Filters: date_index BETWEEN start_date AND end_date
                </div>
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

            <div className="flex justify-end">
              <button
                onClick={handlePreview}
                disabled={!chartConfig.chartName.trim() || !chartConfig.measure}
                className="px-6 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Preview Chart
              </button>
            </div>
          </div>
        )}

        {currentStep === 'preview' && (
          <div className="space-y-6">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
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
                />
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep('configure')}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Back to Configure
              </button>
              
              <button
                onClick={() => setCurrentStep('save')}
                className="px-6 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors"
              >
                Save Chart
              </button>
            </div>
          </div>
        )}

        {currentStep === 'save' && (
          <div className="space-y-6">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-6">
              <h3 className="text-lg font-medium text-green-800 dark:text-green-200 mb-4">
                Ready to Save: {chartConfig.chartName}
              </h3>
              
              <div className="space-y-2 text-sm text-green-700 dark:text-green-300">
                <div><strong>Type:</strong> {chartConfig.chartType}</div>
                <div><strong>Measure:</strong> {chartConfig.measure}</div>
                <div><strong>Frequency:</strong> {chartConfig.frequency}</div>
                <div><strong>Group By:</strong> {chartConfig.groupBy}</div>
                {chartConfig.practiceUid && <div><strong>Practice:</strong> {chartConfig.practiceUid}</div>}
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep('preview')}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Back to Preview
              </button>
              
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Chart Definition'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Schema Information Panel */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 group-open:text-violet-600 dark:group-open:text-violet-400">
            📊 Available Data Fields ({Object.keys(schemaInfo.fields).length})
          </summary>
          
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {Object.entries(schemaInfo.fields).map(([key, field]) => (
              <div key={key} className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                <div className="font-medium text-gray-900 dark:text-gray-100">{field.name}</div>
                <div className="text-gray-600 dark:text-gray-400">{field.type}</div>
                <div className="text-gray-500 dark:text-gray-400 mt-1">{field.description}</div>
                {field.example && (
                  <div className="text-violet-600 dark:text-violet-400 mt-1">
                    Example: {field.example}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* Toast Notification */}
      <Toast
        type={toastType}
        open={showToast}
        setOpen={setShowToast}
        className="fixed bottom-4 right-4 z-50"
      >
        {toastMessage}
      </Toast>
    </div>
  );
}
