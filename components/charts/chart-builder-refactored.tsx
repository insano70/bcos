'use client';

import { useState, useEffect } from 'react';
import Toast from '@/components/toast';
import { ChartFilter, MeasureType, MultipleSeriesConfig } from '@/lib/types/analytics';
import { calculatedFieldsService } from '@/lib/services/calculated-fields';

// Import the new focused components
import ChartBuilderCore, { ChartConfig } from './chart-builder-core';
import ChartBuilderAdvanced from './chart-builder-advanced';
import ChartBuilderPreview from './chart-builder-preview';
import ChartBuilderSave from './chart-builder-save';
import ChartBuilderSchema from './chart-builder-schema';

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
    startDate: '2024-01-01',
    endDate: '2025-12-31',
    groupBy: 'provider_name',
    calculatedField: undefined,
    advancedFilters: [],
    useAdvancedFiltering: false,
    useMultipleSeries: false,
    seriesConfigs: []
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

  const updateConfig = (key: keyof ChartConfig, value: string | boolean | ChartFilter[] | undefined) => {
    setChartConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleAdvancedFiltersChange = (filters: ChartFilter[]) => {
    setChartConfig(prev => ({ ...prev, advancedFilters: filters }));
  };

  const handleDateRangeChange = (startDate: string, endDate: string) => {
    setChartConfig(prev => ({ ...prev, startDate, endDate }));
  };

  const addSeries = () => {
    const newSeries: MultipleSeriesConfig = {
      id: `series_${Date.now()}`,
      measure: (schemaInfo?.availableMeasures[0]?.measure || 'Charges by Provider') as MeasureType,
      aggregation: 'sum',
      label: `Series ${chartConfig.seriesConfigs.length + 1}`,
    };
    setChartConfig(prev => ({
      ...prev,
      seriesConfigs: [...prev.seriesConfigs, newSeries]
    }));
  };

  const updateSeries = (seriesId: string, updates: Partial<MultipleSeriesConfig>) => {
    setChartConfig(prev => ({
      ...prev,
      seriesConfigs: prev.seriesConfigs.map(series =>
        series.id === seriesId ? { ...series, ...updates } : series
      )
    }));
  };

  const removeSeries = (seriesId: string) => {
    setChartConfig(prev => ({
      ...prev,
      seriesConfigs: prev.seriesConfigs.filter(series => series.id !== seriesId)
    }));
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
      // Create chart definition matching the expected schema
      const chartDefinition = {
        chart_name: chartConfig.chartName,
        chart_description: `${chartConfig.chartType} chart showing ${chartConfig.measure} by ${chartConfig.groupBy}`,
        chart_type: chartConfig.chartType,
        chart_category_id: 1, // Default category
        data_source: {
          table: 'ih.agg_app_measures',
          filters: [
            { field: 'measure', operator: 'eq', value: chartConfig.measure },
            { field: 'frequency', operator: 'eq', value: chartConfig.frequency },
            ...(chartConfig.practiceUid ? [{ field: 'practice_uid', operator: 'eq', value: parseInt(chartConfig.practiceUid) }] : []),
            ...(chartConfig.startDate ? [{ field: 'date_index', operator: 'gte', value: chartConfig.startDate }] : []),
            ...(chartConfig.endDate ? [{ field: 'date_index', operator: 'lte', value: chartConfig.endDate }] : []),
            ...chartConfig.advancedFilters
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
      <div className="px-6 py-6">
        {currentStep === 'configure' && (
          <div className="space-y-6">
            <ChartBuilderCore
              schemaInfo={schemaInfo}
              chartConfig={chartConfig}
              updateConfig={updateConfig}
              handleDateRangeChange={handleDateRangeChange}
            />
            
            <ChartBuilderAdvanced
              schemaInfo={schemaInfo}
              chartConfig={chartConfig}
              updateConfig={updateConfig}
              handleAdvancedFiltersChange={handleAdvancedFiltersChange}
              addSeries={addSeries}
              updateSeries={updateSeries}
              removeSeries={removeSeries}
            />

            <div className="flex justify-end">
              <button
                onClick={handlePreview}
                className="px-6 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors"
              >
                Preview Chart
              </button>
            </div>
          </div>
        )}

        {currentStep === 'preview' && (
          <ChartBuilderPreview
            chartConfig={chartConfig}
            previewKey={previewKey}
            onBackToConfigure={() => setCurrentStep('configure')}
            onProceedToSave={() => setCurrentStep('save')}
          />
        )}

        {currentStep === 'save' && (
          <ChartBuilderSave
            chartConfig={chartConfig}
            isSaving={isSaving}
            onBackToPreview={() => setCurrentStep('preview')}
            onSave={handleSave}
          />
        )}
      </div>

      {/* Schema Information Panel */}
      <ChartBuilderSchema schemaInfo={schemaInfo} />

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
