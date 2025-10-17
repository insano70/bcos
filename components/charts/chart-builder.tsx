'use client';

import { useEffect, useState } from 'react';
import Toast from '@/components/toast';
import { FormSkeleton, Skeleton } from '@/components/ui/loading-skeleton';
import { apiClient } from '@/lib/api/client';
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

export default function FunctionalChartBuilder({
  editingChart,
  onCancel,
  onSaveSuccess,
}: ChartBuilderProps = {}) {
  const [schemaInfo, setSchemaInfo] = useState<SchemaInfo | null>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [currentStep, setCurrentStep] = useState<'configure' | 'preview'>('configure');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [isEditMode, _setIsEditMode] = useState(!!editingChart);

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
  });

  const [selectedDatePreset, setSelectedDatePreset] = useState<string>('custom');

  const [previewKey, setPreviewKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Helper function to find data source from saved chart
  const findDataSourceFromChart = async (
    tableReference?: string,
    dataSourceId?: number
  ): Promise<DataSource | null> => {
    try {
      // First try to get all data sources to find the correct one
      const response = await apiClient.get<{ dataSources: DataSource[] }>(
        '/api/admin/analytics/data-sources'
      );
      const dataSources = response.dataSources || [];

      // If we have a dataSourceId, use that first
      if (dataSourceId) {
        const found = dataSources.find((ds) => ds.id === dataSourceId);
        if (found) return found;
      }

      // Otherwise, try to match by table reference
      if (tableReference) {
        // Handle both "schema.table" and "table" formats
        const parts = tableReference.split('.');
        let schemaName: string;
        let tableName: string;

        if (parts.length === 2) {
          schemaName = parts[0]!;
          tableName = parts[1]!;
        } else if (parts.length === 1) {
          // Default schema to 'ih' if not specified
          schemaName = 'ih';
          tableName = parts[0]!;
        } else {
          console.warn('Invalid table reference format:', tableReference);
          return null;
        }

        const found = dataSources.find(
          (ds) => ds.schemaName === schemaName && ds.tableName === tableName
        );
        if (found) return found;
      }

      return null;
    } catch (error) {
      console.error('Failed to find data source for editing:', error);
      return null;
    }
  };

  // Load schema information when data source is selected
  useEffect(() => {
    if (chartConfig.selectedDataSource) {
      setIsLoadingSchema(true);
      loadSchemaInfo(chartConfig.selectedDataSource);
    }
  }, [chartConfig.selectedDataSource?.id]); // Track by ID to avoid object reference issues

  // Populate form when editing
  useEffect(() => {
    if (editingChart && schemaInfo) {
      const populateEditForm = async () => {
        // Extract data from chart definition
        const dataSource = editingChart.data_source as {
          table?: string;
          filters?: ChartFilter[];
          advancedFilters?: ChartFilter[];
        };
        const chartConfigData =
          (editingChart.chart_config as {
            calculatedField?: string;
            seriesConfigs?: MultipleSeriesConfig[];
            dateRangePreset?: string;
            series?: { groupBy?: string };
            dataSourceId?: number;
            colorPalette?: string;
            stackingMode?: 'normal' | 'percentage';
            periodComparison?: PeriodComparisonConfig;
            dualAxisConfig?: DualAxisConfig;
            frequency?: string; // For dual-axis charts, frequency is stored here
          }) || {};

        // Try to find the selected data source by matching table reference or dataSourceId
        const savedDataSource = await findDataSourceFromChart(
          dataSource.table,
          chartConfigData.dataSourceId
        );

        // Find filters from saved chart
        const measureFilter = dataSource.filters?.find((f: ChartFilter) => f.field === 'measure');
        const frequencyFilter = dataSource.filters?.find(
          (f: ChartFilter) => f.field === 'frequency'
        );
        const startDateFilter = dataSource.filters?.find(
          (f: ChartFilter) => f.field === 'date_index' && f.operator === 'gte'
        );
        const endDateFilter = dataSource.filters?.find(
          (f: ChartFilter) => f.field === 'date_index' && f.operator === 'lte'
        );

        // Extract advanced configuration
        const calculatedField = chartConfigData.calculatedField || undefined;
        const advancedFilters = dataSource.advancedFilters || [];
        const useAdvancedFiltering = Array.isArray(advancedFilters) && advancedFilters.length > 0;
        const seriesConfigs = chartConfigData.seriesConfigs || [];
        const useMultipleSeries = Array.isArray(seriesConfigs) && seriesConfigs.length > 0;
        const selectedPreset = chartConfigData.dateRangePreset || 'custom';

        const newConfig: ChartConfig = {
          chartName: editingChart.chart_name || '',
          chartType:
            (editingChart.chart_type === 'pie' || editingChart.chart_type === 'area'
              ? 'bar'
              : editingChart.chart_type) || 'bar',
          measure: String(measureFilter?.value || ''),
          // For dual-axis charts, frequency is in chart_config; for others, it's in filters
          frequency: String(chartConfigData.frequency || frequencyFilter?.value || ''),
          startDate: String(startDateFilter?.value || '2024-01-01'),
          endDate: String(endDateFilter?.value || '2025-12-31'),
          groupBy: chartConfigData.series?.groupBy || 'provider_name',
          calculatedField,
          advancedFilters,
          useAdvancedFiltering,
          useMultipleSeries,
          seriesConfigs,
          selectedDataSource: savedDataSource,
          ...(chartConfigData.colorPalette && { colorPalette: chartConfigData.colorPalette }),
          ...(chartConfigData.stackingMode && { stackingMode: chartConfigData.stackingMode }),
          ...(chartConfigData.periodComparison && {
            periodComparison: chartConfigData.periodComparison,
          }),
          ...(chartConfigData.dualAxisConfig && { dualAxisConfig: chartConfigData.dualAxisConfig }),
        };

        setSelectedDatePreset(selectedPreset);
        setChartConfig(newConfig);
      };

      populateEditForm();
    }
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
    // If data source is changing, reset related fields
    if (key === 'selectedDataSource' && value !== chartConfig.selectedDataSource) {
      console.log('🔄 Data source changed...');

      // Reset fields that depend on the data source
      // Note: Schema will be loaded by the useEffect hook that watches selectedDataSource
      if (!isEditMode) {
        setChartConfig((prev) => ({
          ...prev,
          selectedDataSource: value as DataSource | null,
          measure: '',
          frequency: '',
          advancedFilters: [],
          seriesConfigs: [],
        }));
      } else {
        setChartConfig((prev) => ({ ...prev, selectedDataSource: value as DataSource | null }));
      }
    } else if (key === 'chartType' && value === 'stacked-bar') {
      // Smart default: When switching to stacked-bar, auto-set groupBy to provider_name if currently none
      setChartConfig((prev) => ({
        ...prev,
        [key]: value,
        groupBy: prev.groupBy === 'none' ? 'provider_name' : prev.groupBy,
        stackingMode: prev.stackingMode || 'normal',
        colorPalette: prev.colorPalette || 'blue', // Auto-select blue palette for stacked bars
      }));
    } else if (key === 'chartType' && value === 'horizontal-bar') {
      // Smart default: When switching to horizontal-bar, require groupBy and set color palette
      setChartConfig((prev) => ({
        ...prev,
        [key]: value,
        // Set groupBy to first available field if currently none, otherwise keep current
        groupBy:
          prev.groupBy === 'none'
            ? schemaInfo?.availableGroupByFields?.[0]?.columnName || 'practice_primary'
            : prev.groupBy,
        colorPalette: prev.colorPalette || 'blue', // Auto-select blue palette
      }));
    } else if (key === 'chartType' && value === 'dual-axis') {
      // Initialize dual-axis configuration when dual-axis chart type is selected
      // Clear measure and frequency since dual-axis uses dualAxisConfig instead
      setChartConfig((prev) => ({
        ...prev,
        [key]: value,
        measure: '', // Clear single measure field
        frequency: '', // Clear frequency field
        dualAxisConfig: prev.dualAxisConfig || {
          enabled: true,
          primary: {
            measure: '',
            chartType: 'bar' as const,
            axisPosition: 'left' as const,
          },
          secondary: {
            measure: '',
            chartType: 'line' as const,
            axisPosition: 'right' as const,
          },
        },
      }));
    } else {
      // Handle all other config updates normally
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
    setSelectedDatePreset(presetId);
    setChartConfig((prev) => ({ ...prev, startDate, endDate }));
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
      setToastMessage('Chart name is required');
      setToastType('error');
      setShowToast(true);
      return;
    }

    // For dual-axis charts, validate dual-axis configuration
    if (chartConfig.chartType === 'dual-axis') {
      if (!chartConfig.dualAxisConfig) {
        setToastMessage('Dual-axis configuration is required');
        setToastType('error');
        setShowToast(true);
        return;
      }
      if (!chartConfig.dualAxisConfig.primary.measure) {
        setToastMessage('Primary measure is required for dual-axis charts');
        setToastType('error');
        setShowToast(true);
        return;
      }
      if (!chartConfig.dualAxisConfig.secondary.measure) {
        setToastMessage('Secondary measure is required for dual-axis charts');
        setToastType('error');
        setShowToast(true);
        return;
      }
    }
    // Measure is not required for table charts or dual-axis (validated above)
    else if (chartConfig.chartType !== 'table' && !chartConfig.measure) {
      setToastMessage('Measure selection is required');
      setToastType('error');
      setShowToast(true);
      return;
    }

    setPreviewKey((prev) => prev + 1); // Force re-render of preview chart
    setCurrentStep('preview');
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      // Validate data source selection
      if (!chartConfig.selectedDataSource) {
        setToastMessage('Data source selection is required');
        setToastType('error');
        setShowToast(true);
        setIsSaving(false);
        return;
      }

      // Build table reference from selected data source
      const tableReference = `${chartConfig.selectedDataSource.schemaName}.${chartConfig.selectedDataSource.tableName}`;

      // Build filters based on chart type
      const filters = [];

      // Table charts, dual-axis charts, and multi-series charts don't need measure/frequency filters
      // - Dual-axis charts store measures in dualAxisConfig instead
      // - Multi-series charts store measures in seriesConfigs instead
      if (
        chartConfig.chartType !== 'table' &&
        chartConfig.chartType !== 'dual-axis' &&
        !chartConfig.useMultipleSeries
      ) {
        filters.push(
          { field: 'measure', operator: 'eq', value: chartConfig.measure },
          { field: 'frequency', operator: 'eq', value: chartConfig.frequency }
        );
      }

      // Add date range filters
      if (chartConfig.startDate) {
        filters.push({ field: 'date_index', operator: 'gte', value: chartConfig.startDate });
      }
      if (chartConfig.endDate) {
        filters.push({ field: 'date_index', operator: 'lte', value: chartConfig.endDate });
      }

      // Create chart definition matching the expected schema
      const chartDefinition = {
        chart_name: chartConfig.chartName,
        chart_description:
          chartConfig.chartType === 'table'
            ? `Table view of ${chartConfig.selectedDataSource?.name || 'data'}`
            : chartConfig.chartType === 'dual-axis'
              ? `Dual-axis chart showing ${chartConfig.dualAxisConfig?.primary.measure} and ${chartConfig.dualAxisConfig?.secondary.measure}`
              : chartConfig.useMultipleSeries
                ? `${chartConfig.chartType} chart showing ${chartConfig.seriesConfigs.length} series by ${chartConfig.groupBy}`
                : `${chartConfig.chartType} chart showing ${chartConfig.measure} by ${chartConfig.groupBy}`,
        chart_type: chartConfig.chartType,
        chart_category_id: null, // No category by default
        chart_config: {
          x_axis: { field: 'period_end', label: 'Date', format: 'date' },
          y_axis: { field: 'measure_value', label: 'Amount', format: 'currency' },
          series:
            chartConfig.chartType !== 'table'
              ? {
                  groupBy: chartConfig.groupBy,
                  colorPalette: chartConfig.colorPalette || 'default',
                }
              : undefined,
          options: { responsive: true, showLegend: true, showTooltips: true, animation: true },
          // Save additional configuration
          calculatedField: chartConfig.calculatedField,
          dateRangePreset: selectedDatePreset,
          seriesConfigs: chartConfig.seriesConfigs,
          dataSourceId: chartConfig.selectedDataSource.id, // Store data source reference
          stackingMode: chartConfig.stackingMode, // Save stacking mode for stacked-bar charts
          colorPalette: chartConfig.colorPalette, // Save color palette at root level too for easier access
          periodComparison: chartConfig.periodComparison, // Save period comparison config
          dualAxisConfig: chartConfig.dualAxisConfig, // Save dual-axis configuration
          // For dual-axis charts, save frequency in chart_config since it's not in filters
          ...(chartConfig.chartType === 'dual-axis' &&
            chartConfig.frequency && { frequency: chartConfig.frequency }),
        },
        // Save advanced filters in data_source
        data_source: {
          table: tableReference,
          filters,
          advancedFilters: chartConfig.advancedFilters,
          groupBy: chartConfig.chartType !== 'table' ? [chartConfig.groupBy, 'period_end'] : [],
          orderBy: [{ field: 'period_end', direction: 'ASC' }],
        },
      };

      console.log(`💾 ${isEditMode ? 'Updating' : 'Creating'} chart definition:`, chartDefinition);

      const url = isEditMode
        ? `/api/admin/analytics/charts/${editingChart?.chart_definition_id}`
        : '/api/admin/analytics/charts';

      const result = isEditMode
        ? await apiClient.patch(url, chartDefinition)
        : await apiClient.post(url, chartDefinition);
      console.log(`✅ Chart ${isEditMode ? 'updated' : 'saved'} successfully:`, result);

      setToastMessage(
        `Chart "${chartConfig.chartName}" ${isEditMode ? 'updated' : 'saved'} successfully!`
      );
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
      setToastMessage(
        `Failed to ${isEditMode ? 'update' : 'save'} chart: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      setToastType('error');
      setShowToast(true);
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
            { key: 'configure' as const, label: 'Configure' },
            { key: 'preview' as const, label: 'Preview' },
          ].map(({ key, label }) => (
            <button
              key={key}
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
                <button
                  onClick={handlePreview}
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
