'use client';

import { useState, useEffect } from 'react';
import Toast from '@/components/toast';
import { ChartDefinition, ChartFilter, MeasureType, MultipleSeriesConfig } from '@/lib/types/analytics';
import { calculatedFieldsService } from '@/lib/services/calculated-fields';
import { FormSkeleton, Skeleton } from '@/components/ui/loading-skeleton';
import { apiClient } from '@/lib/api/client';

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
  example: unknown;
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

// Chart Builder Loading Skeleton
function ChartBuilderSkeleton() {
  return (
    <div className="max-w-6xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-96 mt-1" />
      </div>

      {/* Step Navigation */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex space-x-6">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-4 w-20" />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        <FormSkeleton fields={8} />
      </div>

      {/* Schema Panel */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}

interface ChartBuilderProps {
  editingChart?: ChartDefinition; // Chart definition to edit
  onCancel?: () => void; // Callback when canceling
  onSaveSuccess?: () => void; // Callback when save is successful
}

export default function FunctionalChartBuilder({ editingChart, onCancel, onSaveSuccess }: ChartBuilderProps = {}) {
  const [schemaInfo, setSchemaInfo] = useState<SchemaInfo | null>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(true);
  const [currentStep, setCurrentStep] = useState<'configure' | 'preview'>('configure');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [isEditMode, setIsEditMode] = useState(!!editingChart);
  
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
  
  const [selectedDatePreset, setSelectedDatePreset] = useState<string>('custom');

  const [previewKey, setPreviewKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Load schema information on mount
  useEffect(() => {
    loadSchemaInfo();
  }, []);

  // Populate form when editing
  useEffect(() => {
    if (editingChart && schemaInfo) {
      // Extract data from chart definition
      const dataSource = editingChart.data_source as { filters?: ChartFilter[]; advancedFilters?: ChartFilter[] };
      const chartConfigData = editingChart.chart_config as {
        calculatedField?: string;
        seriesConfigs?: MultipleSeriesConfig[];
        dateRangePreset?: string;
        series?: { groupBy?: string };
      } || {};

      // Find practice UID from filters
      const practiceFilter = dataSource.filters?.find((f: ChartFilter) => f.field === 'practice_uid');
      const measureFilter = dataSource.filters?.find((f: ChartFilter) => f.field === 'measure');
      const frequencyFilter = dataSource.filters?.find((f: ChartFilter) => f.field === 'frequency');
      const startDateFilter = dataSource.filters?.find((f: ChartFilter) => f.field === 'date_index' && f.operator === 'gte');
      const endDateFilter = dataSource.filters?.find((f: ChartFilter) => f.field === 'date_index' && f.operator === 'lte');

      // Extract advanced configuration
      const calculatedField = chartConfigData.calculatedField || undefined;
      const advancedFilters = dataSource.advancedFilters || [];
      const useAdvancedFiltering = Array.isArray(advancedFilters) && advancedFilters.length > 0;
      const seriesConfigs = chartConfigData.seriesConfigs || [];
      const useMultipleSeries = Array.isArray(seriesConfigs) && seriesConfigs.length > 0;
      const selectedPreset = chartConfigData.dateRangePreset || 'custom';
      
      const newConfig = {
        chartName: editingChart.chart_name || '',
        chartType: (editingChart.chart_type === 'pie' || editingChart.chart_type === 'area' ? 'bar' : editingChart.chart_type) || 'bar',
        measure: String(measureFilter?.value || ''),
        frequency: String(frequencyFilter?.value || ''),
        practiceUid: practiceFilter?.value?.toString() || '',
        startDate: String(startDateFilter?.value || '2024-01-01'),
        endDate: String(endDateFilter?.value || '2025-12-31'),
        groupBy: chartConfigData.series?.groupBy || 'provider_name',
        calculatedField,
        advancedFilters,
        useAdvancedFiltering,
        useMultipleSeries,
        seriesConfigs
      };
      
      setSelectedDatePreset(selectedPreset);
      
      setChartConfig(newConfig);
    }
  }, [editingChart, schemaInfo]);

  const loadSchemaInfo = async () => {
    try {
      console.log('🔍 Loading analytics schema information...');
      
      const result = await apiClient.get<SchemaInfo>('/api/admin/analytics/schema');
      setSchemaInfo(result);
      
      // Set default values based on schema
      if (result.availableMeasures && result.availableMeasures.length > 0) {
        setChartConfig(prev => ({
          ...prev,
          measure: result.availableMeasures[0] as any
        }));
      }
      
      if (result.availableFrequencies && result.availableFrequencies.length > 0) {
        setChartConfig(prev => ({
          ...prev,
          frequency: result.availableFrequencies[0] as any
        }));
      }

      console.log('✅ Schema loaded:', {
        fieldCount: result.fields ? Object.keys(result.fields).length : 0,
        measureCount: result.availableMeasures ? result.availableMeasures.length : 0
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
  
  const handleDatePresetChange = (presetId: string, startDate: string, endDate: string) => {
    setSelectedDatePreset(presetId);
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
        chart_category_id: null, // No category by default
        chart_config: {
          x_axis: { field: 'period_end', label: 'Date', format: 'date' },
          y_axis: { field: 'measure_value', label: 'Amount', format: 'currency' },
          series: { groupBy: chartConfig.groupBy, colorPalette: 'default' },
          options: { responsive: true, showLegend: true, showTooltips: true, animation: true },
          // Save additional configuration
          calculatedField: chartConfig.calculatedField,
          dateRangePreset: selectedDatePreset,
          seriesConfigs: chartConfig.seriesConfigs
        },
        // Save advanced filters in data_source
        data_source: {
          table: 'ih.agg_app_measures',
          filters: [
            { field: 'measure', operator: 'eq', value: chartConfig.measure },
            { field: 'frequency', operator: 'eq', value: chartConfig.frequency },
            ...(chartConfig.practiceUid ? [{ field: 'practice_uid', operator: 'eq', value: parseInt(chartConfig.practiceUid) }] : []),
            ...(chartConfig.startDate ? [{ field: 'date_index', operator: 'gte', value: chartConfig.startDate }] : []),
            ...(chartConfig.endDate ? [{ field: 'date_index', operator: 'lte', value: chartConfig.endDate }] : [])
          ],
          advancedFilters: chartConfig.advancedFilters,
          groupBy: [chartConfig.groupBy, 'period_end'],
          orderBy: [{ field: 'period_end', direction: 'ASC' }]
        }
      };

      console.log(`💾 ${isEditMode ? 'Updating' : 'Creating'} chart definition:`, chartDefinition);

      const url = isEditMode 
        ? `/api/admin/analytics/charts/${editingChart?.chart_definition_id}`
        : '/api/admin/analytics/charts';
      
      const result = isEditMode 
        ? await apiClient.patch(url, chartDefinition)
        : await apiClient.post(url, chartDefinition);
      console.log(`✅ Chart ${isEditMode ? 'updated' : 'saved'} successfully:`, result);
      
      setToastMessage(`Chart "${chartConfig.chartName}" ${isEditMode ? 'updated' : 'saved'} successfully!`);
      setToastType('success');
      setShowToast(true);
      
      // Call success callback or reset form
      if (onSaveSuccess) {
        onSaveSuccess();
      } else if (onCancel) {
        onCancel();
      } else {
        setCurrentStep('configure');
      }
      
    } catch (error) {
      console.error(`❌ Failed to ${isEditMode ? 'update' : 'save'} chart:`, error);
      setToastMessage(`Failed to ${isEditMode ? 'update' : 'save'} chart: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingSchema) {
    return <ChartBuilderSkeleton />;
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
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {isEditMode ? 'Edit Chart Definition' : 'Chart Definition'}
          </h2>
          
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              ← Back to Charts
            </button>
          )}
        </div>
      </div>

      {/* Step Navigation */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex space-x-6">
          {[
            { key: 'configure', label: 'Configure' },
            { key: 'preview', label: 'Preview' }
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
              key={isEditMode ? `edit-${editingChart?.chart_definition_id}` : 'create'}
              schemaInfo={schemaInfo}
              chartConfig={chartConfig}
              updateConfig={updateConfig}
              handleDateRangeChange={handleDatePresetChange}
              selectedDatePreset={selectedDatePreset}
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
            onSave={handleSave}
            isSaving={isSaving}
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
