'use client';

import { useEffect, useState } from 'react';
import Toast from '@/components/toast';
import { FormSkeleton, Skeleton } from '@/components/ui/loading-skeleton';
import { apiClient } from '@/lib/api/client';
import { useToast } from '@/lib/hooks/use-toast';
import type {
  ChartDefinition,
  ChartFilter,
  DualAxisConfig,
  FrequencyType,
  MeasureType,
  MultipleSeriesConfig,
  PeriodComparisonConfig,
} from '@/lib/types/analytics';
import ChartBuilderAdvanced from './chart-builder-advanced';
// Import the new focused components
import ChartBuilderCore, { type ChartConfig, type DataSource } from './chart-builder-core';
import ChartBuilderPreview from './chart-builder-preview';
import ChartBuilderSchema from './chart-builder-schema';
import {
  applyChartTypeDefaults,
  buildChartPayload,
  findDataSource,
  parseChartForEdit,
} from './chart-builder-utils';

interface FieldDefinition {
  name: string;
  type: string;
  description: string;
  example: string | number | boolean | null;
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
          {(() => {
            let counter = 0;
            return [...Array(3)].map(() => (
              <Skeleton key={`skeleton-${counter++}`} className="h-4 w-20" />
            ));
          })()}
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

export default function FunctionalChartBuilder({
  editingChart,
  onCancel,
  onSaveSuccess,
}: ChartBuilderProps = {}) {
  // Core state
  const [chartConfig, setChartConfig] = useState<ChartConfig>({
    chartName: '',
    chartType: 'bar',
    measure: '',
    frequency: '',
    startDate: '2024-01-01',
    endDate: '2025-12-31',
    groupBy: 'provider_name',
    calculatedField: undefined,
    advancedFilters: [],
    useAdvancedFiltering: false,
    useMultipleSeries: false,
    seriesConfigs: [],
    selectedDataSource: null,
    colorPalette: 'default',
  });
  const [schemaInfo, setSchemaInfo] = useState<SchemaInfo | null>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [currentStep, setCurrentStep] = useState<'configure' | 'preview'>('configure');
  const [isSaving, setIsSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  // Toast notifications
  const { toast, showToast, setToastOpen } = useToast();

  // Derived values
  const isEditMode = !!editingChart;
  const selectedDatePreset = chartConfig.dateRangePreset || 'custom';

  // Load schema information when data source is selected
  useEffect(() => {
    if (chartConfig.selectedDataSource) {
      setIsLoadingSchema(true);
      loadSchemaInfo(chartConfig.selectedDataSource);
    }
  }, [chartConfig.selectedDataSource?.id]); // Track by ID to avoid object reference issues

  // Populate form when editing
  useEffect(() => {
    if (!editingChart || !schemaInfo) return;

    const populateEditForm = async () => {
      const parsedConfig = parseChartForEdit(editingChart);
      const chartConfigData = editingChart.chart_config as { dataSourceId?: number };
      const dataSource = editingChart.data_source as { table?: string };

      const savedDataSource = await findDataSource(chartConfigData.dataSourceId, dataSource.table);

      setChartConfig((prev) => ({
        ...prev,
        ...parsedConfig,
        selectedDataSource: savedDataSource,
      }));
    };

    populateEditForm();
  }, [editingChart, schemaInfo]);

  const loadSchemaInfo = async (dataSource?: DataSource | null) => {
    try {
      console.log('🔍 Loading analytics schema information...');

      // Use the provided data source, or fallback to selected data source, or default
      const sourceToUse = dataSource || chartConfig.selectedDataSource;

      let apiUrl = '/api/admin/analytics/schema';
      if (sourceToUse?.id) {
        // Use data source ID if available (new configurable system)
        apiUrl += `?data_source_id=${sourceToUse.id}`;
        console.log(`🔍 Loading schema for data source ID: ${sourceToUse.id}`);
      } else {
        // Fallback to table/schema params (legacy system)
        const tableName = sourceToUse?.tableName || 'agg_app_measures';
        const schemaName = sourceToUse?.schemaName || 'ih';
        apiUrl += `?table=${tableName}&schema=${schemaName}`;
        console.log(`🔍 Loading schema for: ${schemaName}.${tableName}`);
      }

      const result = await apiClient.get<SchemaInfo>(apiUrl);
      setSchemaInfo(result);

      // Set default values based on schema (only if not in edit mode)
      // Batch updates to prevent multiple re-renders
      if (
        !isEditMode &&
        (result.availableMeasures?.length > 0 || result.availableFrequencies?.length > 0)
      ) {
        setChartConfig((prev) => ({
          ...prev,
          ...(result.availableMeasures?.[0] && {
            measure: result.availableMeasures[0].measure as MeasureType,
          }),
          ...(result.availableFrequencies?.[0] && {
            frequency: result.availableFrequencies[0].frequency as FrequencyType,
          }),
        }));
      }

      console.log('✅ Schema loaded:', {
        fieldCount: result.fields ? Object.keys(result.fields).length : 0,
        measureCount: result.availableMeasures ? result.availableMeasures.length : 0,
        dataSourceId: sourceToUse?.id,
        tableName: sourceToUse?.tableName,
      });
    } catch (error) {
      console.error('❌ Failed to load schema:', error);
    } finally {
      setIsLoadingSchema(false);
    }
  };

  const updateConfig = (
    key: keyof ChartConfig,
    value:
      | string
      | boolean
      | ChartFilter[]
      | DataSource
      | PeriodComparisonConfig
      | DualAxisConfig
      | null
      | undefined
  ) => {
    if (key === 'selectedDataSource' && value !== chartConfig.selectedDataSource) {
      // Data source changed - reset dependent fields
      const resetFields = isEditMode
        ? {}
        : {
            measure: '',
            frequency: '',
            advancedFilters: [],
            seriesConfigs: [],
          };
      setChartConfig((prev) => ({ ...prev, selectedDataSource: value as DataSource, ...resetFields }));
    } else if (key === 'chartType') {
      // Apply smart defaults for chart type
      const defaults = applyChartTypeDefaults(value as string, chartConfig, schemaInfo);
      setChartConfig((prev) => ({
        ...prev,
        chartType: value as ChartConfig['chartType'],
        ...defaults,
      }));
    } else {
      // Normal update
      setChartConfig((prev) => ({ ...prev, [key]: value }));
    }
  };

  const handleAdvancedFiltersChange = (filters: ChartFilter[]) => {
    setChartConfig((prev) => ({ ...prev, advancedFilters: filters }));
  };

  const _handleDateRangeChange = (startDate: string, endDate: string) => {
    setChartConfig((prev) => ({ ...prev, startDate, endDate }));
  };

  const handleDatePresetChange = (presetId: string, startDate: string, endDate: string) => {
    setChartConfig((prev) => ({ ...prev, startDate, endDate, dateRangePreset: presetId }));
  };

  const addSeries = () => {
    const newSeries: MultipleSeriesConfig = {
      id: `series_${Date.now()}`,
      measure: (schemaInfo?.availableMeasures[0]?.measure || 'Charges by Provider') as MeasureType,
      aggregation: 'sum',
      label: `Series ${chartConfig.seriesConfigs.length + 1}`,
    };
    setChartConfig((prev) => ({
      ...prev,
      seriesConfigs: [...prev.seriesConfigs, newSeries],
    }));
  };

  const updateSeries = (seriesId: string, updates: Partial<MultipleSeriesConfig>) => {
    setChartConfig((prev) => ({
      ...prev,
      seriesConfigs: prev.seriesConfigs.map((series) =>
        series.id === seriesId ? { ...series, ...updates } : series
      ),
    }));
  };

  const removeSeries = (seriesId: string) => {
    setChartConfig((prev) => ({
      ...prev,
      seriesConfigs: prev.seriesConfigs.filter((series) => series.id !== seriesId),
    }));
  };

  const handlePreview = () => {
    if (!chartConfig.chartName.trim()) {
      showToast('error', 'Chart name is required');
      return;
    }

    // For dual-axis charts, validate dual-axis configuration
    if (chartConfig.chartType === 'dual-axis') {
      if (!chartConfig.dualAxisConfig) {
        showToast('error', 'Dual-axis configuration is required');
        return;
      }
      if (!chartConfig.dualAxisConfig.primary.measure) {
        showToast('error', 'Primary measure is required for dual-axis charts');
        return;
      }
      if (!chartConfig.dualAxisConfig.secondary.measure) {
        showToast('error', 'Secondary measure is required for dual-axis charts');
        return;
      }
    }
    // Measure is not required for table charts or dual-axis (validated above)
    else if (chartConfig.chartType !== 'table' && !chartConfig.measure) {
      showToast('error', 'Measure selection is required');
      return;
    }

    // Force re-render of preview chart by incrementing key
    setPreviewKey((prev) => prev + 1);
    setCurrentStep('preview');
  };

  const handleSave = async () => {
    if (!chartConfig.selectedDataSource) {
      showToast('error', 'Data source selection is required');
      return;
    }

    setIsSaving(true);
    try {
      const payload = buildChartPayload(
        chartConfig,
        chartConfig.selectedDataSource,
        selectedDatePreset
      );
      const url = isEditMode
        ? `/api/admin/analytics/charts/${editingChart?.chart_definition_id}`
        : '/api/admin/analytics/charts';

      await (isEditMode ? apiClient.patch(url, payload) : apiClient.post(url, payload));

      showToast(
        'success',
        `Chart "${chartConfig.chartName}" ${isEditMode ? 'updated' : 'saved'} successfully!`
      );

      // Call success callback or reset form
      if (onSaveSuccess) {
        onSaveSuccess();
      } else if (onCancel) {
        onCancel();
      } else {
        setCurrentStep('configure');
      }
    } catch (error) {
      showToast(
        'error',
        `Failed to ${isEditMode ? 'update' : 'save'} chart: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingSchema) {
    return <ChartBuilderSkeleton />;
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
            <button type="button" onClick={onCancel}
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
            { key: 'configure' as const, label: 'Configure' },
            { key: 'preview' as const, label: 'Preview' },
          ].map(({ key, label }) => (
            <button type="button" key={key}
              onClick={() => setCurrentStep(key)}
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
              isLoadingSchema={isLoadingSchema}
            />

            {schemaInfo && (
              <ChartBuilderAdvanced
                schemaInfo={schemaInfo}
                chartConfig={chartConfig}
                updateConfig={updateConfig}
                handleAdvancedFiltersChange={handleAdvancedFiltersChange}
                addSeries={addSeries}
                updateSeries={updateSeries}
                removeSeries={removeSeries}
              />
            )}

            {schemaInfo && (
              <div className="flex justify-end">
                <button type="button" onClick={handlePreview}
                  className="px-6 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors"
                >
                  Preview Chart
                </button>
              </div>
            )}
          </div>
        )}

        {currentStep === 'preview' && (
          <ChartBuilderPreview
            chartConfig={chartConfig}
            dateRangePreset={selectedDatePreset}
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
        type={toast.type}
        open={toast.show}
        setOpen={setToastOpen}
        className="fixed bottom-4 right-4 z-50"
      >
        {toast.message}
      </Toast>
    </div>
  );
}
