'use client';

import { useEffect, useReducer } from 'react';
import { useToast } from '@/components/toast';
import { FormSkeleton, Skeleton } from '@/components/ui/loading-skeleton';
import { apiClient } from '@/lib/api/client';
import { clientDebugLog, clientErrorLog } from '@/lib/utils/debug-client';
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
import ChartBuilderDrillDown, { type DrillDownConfig } from './chart-builder-drill-down';
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

// ============================================================================
// Chart Builder State Reducer
// ============================================================================

type CurrentStep = 'configure' | 'preview';

interface BuilderState {
  chartConfig: ChartConfig;
  schemaInfo: SchemaInfo | null;
  isLoadingSchema: boolean;
  currentStep: CurrentStep;
  isSaving: boolean;
  previewKey: number;
  drillDownConfig: DrillDownConfig;
}

type BuilderAction =
  | { type: 'SET_CHART_CONFIG'; config: ChartConfig }
  | { type: 'UPDATE_CHART_CONFIG'; updates: Partial<ChartConfig> }
  | { type: 'SET_SCHEMA_INFO'; schemaInfo: SchemaInfo }
  | { type: 'SET_LOADING_SCHEMA'; isLoading: boolean }
  | { type: 'SET_CURRENT_STEP'; step: CurrentStep }
  | { type: 'SET_SAVING'; isSaving: boolean }
  | { type: 'INCREMENT_PREVIEW_KEY' }
  | { type: 'SET_DRILL_DOWN_CONFIG'; config: DrillDownConfig }
  | { type: 'UPDATE_DRILL_DOWN_CONFIG'; updates: Partial<DrillDownConfig> }
  | { type: 'ADD_SERIES'; series: MultipleSeriesConfig }
  | { type: 'UPDATE_SERIES'; seriesId: string; updates: Partial<MultipleSeriesConfig> }
  | { type: 'REMOVE_SERIES'; seriesId: string };

const defaultChartConfig: ChartConfig = {
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
};

const defaultDrillDownConfig: DrillDownConfig = {
  drill_down_enabled: false,
  drill_down_type: null,
  drill_down_target_chart_id: null,
  drill_down_button_label: 'Drill Down',
};

const builderInitialState: BuilderState = {
  chartConfig: defaultChartConfig,
  schemaInfo: null,
  isLoadingSchema: false,
  currentStep: 'configure',
  isSaving: false,
  previewKey: 0,
  drillDownConfig: defaultDrillDownConfig,
};

function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'SET_CHART_CONFIG':
      return { ...state, chartConfig: action.config };
    case 'UPDATE_CHART_CONFIG':
      return { ...state, chartConfig: { ...state.chartConfig, ...action.updates } };
    case 'SET_SCHEMA_INFO':
      return { ...state, schemaInfo: action.schemaInfo, isLoadingSchema: false };
    case 'SET_LOADING_SCHEMA':
      return { ...state, isLoadingSchema: action.isLoading };
    case 'SET_CURRENT_STEP':
      return { ...state, currentStep: action.step };
    case 'SET_SAVING':
      return { ...state, isSaving: action.isSaving };
    case 'INCREMENT_PREVIEW_KEY':
      return { ...state, previewKey: state.previewKey + 1, currentStep: 'preview' };
    case 'SET_DRILL_DOWN_CONFIG':
      return { ...state, drillDownConfig: action.config };
    case 'UPDATE_DRILL_DOWN_CONFIG':
      return { ...state, drillDownConfig: { ...state.drillDownConfig, ...action.updates } };
    case 'ADD_SERIES':
      return {
        ...state,
        chartConfig: {
          ...state.chartConfig,
          seriesConfigs: [...state.chartConfig.seriesConfigs, action.series],
        },
      };
    case 'UPDATE_SERIES':
      return {
        ...state,
        chartConfig: {
          ...state.chartConfig,
          seriesConfigs: state.chartConfig.seriesConfigs.map((series) =>
            series.id === action.seriesId ? { ...series, ...action.updates } : series
          ),
        },
      };
    case 'REMOVE_SERIES':
      return {
        ...state,
        chartConfig: {
          ...state.chartConfig,
          seriesConfigs: state.chartConfig.seriesConfigs.filter((series) => series.id !== action.seriesId),
        },
      };
    default:
      return state;
  }
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
  // Consolidated state with reducer
  const [state, dispatch] = useReducer(builderReducer, builderInitialState);
  const { chartConfig, schemaInfo, isLoadingSchema, currentStep, isSaving, previewKey, drillDownConfig } = state;

  // Toast notifications
  const { showToast } = useToast();

  // Derived values
  const isEditMode = !!editingChart;
  const selectedDatePreset = chartConfig.dateRangePreset || 'custom';

  // Load schema information when data source is selected
  useEffect(() => {
    if (chartConfig.selectedDataSource) {
      dispatch({ type: 'SET_LOADING_SCHEMA', isLoading: true });
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

      dispatch({
        type: 'SET_CHART_CONFIG',
        config: {
          ...chartConfig,
          ...parsedConfig,
          selectedDataSource: savedDataSource,
        },
      });

      // Populate drill-down config if editing
      const editChart = editingChart as {
        drill_down_enabled?: boolean;
        drill_down_type?: string | null;
        drill_down_target_chart_id?: string | null;
        drill_down_button_label?: string;
      };
      dispatch({
        type: 'SET_DRILL_DOWN_CONFIG',
        config: {
          drill_down_enabled: editChart.drill_down_enabled ?? false,
          drill_down_type: (editChart.drill_down_type as 'filter' | 'navigate' | 'swap' | null) ?? null,
          drill_down_target_chart_id: editChart.drill_down_target_chart_id ?? null,
          drill_down_button_label: editChart.drill_down_button_label ?? 'Drill Down',
        },
      });
    };

    populateEditForm();
  }, [editingChart, schemaInfo]);

  const loadSchemaInfo = async (dataSource?: DataSource | null) => {
    try {
      clientDebugLog.api('Loading analytics schema information');

      // Use the provided data source, or fallback to selected data source, or default
      const sourceToUse = dataSource || chartConfig.selectedDataSource;

      let apiUrl = '/api/admin/analytics/schema';
      if (sourceToUse?.id) {
        // Use data source ID if available (new configurable system)
        apiUrl += `?data_source_id=${sourceToUse.id}`;
        clientDebugLog.api('Loading schema for data source', { dataSourceId: sourceToUse.id });
      } else {
        // Fallback to table/schema params (legacy system)
        const tableName = sourceToUse?.tableName || 'agg_app_measures';
        const schemaName = sourceToUse?.schemaName || 'ih';
        apiUrl += `?table=${tableName}&schema=${schemaName}`;
        clientDebugLog.api('Loading schema for table', { schemaName, tableName });
      }

      const result = await apiClient.get<SchemaInfo>(apiUrl);
      dispatch({ type: 'SET_SCHEMA_INFO', schemaInfo: result });

      // Set default values based on schema (only if not in edit mode)
      if (
        !isEditMode &&
        (result.availableMeasures?.length > 0 || result.availableFrequencies?.length > 0)
      ) {
        dispatch({
          type: 'UPDATE_CHART_CONFIG',
          updates: {
            ...(result.availableMeasures?.[0] && {
              measure: result.availableMeasures[0].measure as MeasureType,
            }),
            ...(result.availableFrequencies?.[0] && {
              frequency: result.availableFrequencies[0].frequency as FrequencyType,
            }),
          },
        });
      }

      clientDebugLog.api('Schema loaded', {
        fieldCount: result.fields ? Object.keys(result.fields).length : 0,
        measureCount: result.availableMeasures ? result.availableMeasures.length : 0,
        dataSourceId: sourceToUse?.id,
        tableName: sourceToUse?.tableName,
      });
    } catch (error) {
      clientErrorLog('Failed to load schema', error);
      dispatch({ type: 'SET_LOADING_SCHEMA', isLoading: false });
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
      dispatch({
        type: 'UPDATE_CHART_CONFIG',
        updates: { selectedDataSource: value as DataSource, ...resetFields },
      });
    } else if (key === 'chartType') {
      // Apply smart defaults for chart type
      const defaults = applyChartTypeDefaults(value as string, chartConfig, schemaInfo);
      dispatch({
        type: 'UPDATE_CHART_CONFIG',
        updates: { chartType: value as ChartConfig['chartType'], ...defaults },
      });
    } else {
      // Normal update
      dispatch({ type: 'UPDATE_CHART_CONFIG', updates: { [key]: value } });
    }
  };

  const handleAdvancedFiltersChange = (filters: ChartFilter[]) => {
    dispatch({ type: 'UPDATE_CHART_CONFIG', updates: { advancedFilters: filters } });
  };

  const _handleDateRangeChange = (startDate: string, endDate: string) => {
    dispatch({ type: 'UPDATE_CHART_CONFIG', updates: { startDate, endDate } });
  };

  const handleDatePresetChange = (presetId: string, startDate: string, endDate: string) => {
    dispatch({ type: 'UPDATE_CHART_CONFIG', updates: { startDate, endDate, dateRangePreset: presetId } });
  };

  const addSeries = () => {
    const newSeries: MultipleSeriesConfig = {
      id: `series_${Date.now()}`,
      measure: (schemaInfo?.availableMeasures[0]?.measure || 'Charges by Provider') as MeasureType,
      aggregation: 'sum',
      label: `Series ${chartConfig.seriesConfigs.length + 1}`,
    };
    dispatch({ type: 'ADD_SERIES', series: newSeries });
  };

  const updateSeries = (seriesId: string, updates: Partial<MultipleSeriesConfig>) => {
    dispatch({ type: 'UPDATE_SERIES', seriesId, updates });
  };

  const removeSeries = (seriesId: string) => {
    dispatch({ type: 'REMOVE_SERIES', seriesId });
  };

  const handlePreview = () => {
    if (!chartConfig.chartName.trim()) {
      showToast({ type: 'error', message: 'Chart name is required' });
      return;
    }

    // For dual-axis charts, validate dual-axis configuration
    if (chartConfig.chartType === 'dual-axis') {
      if (!chartConfig.dualAxisConfig) {
        showToast({ type: 'error', message: 'Dual-axis configuration is required' });
        return;
      }
      if (!chartConfig.dualAxisConfig.primary.measure) {
        showToast({ type: 'error', message: 'Primary measure is required for dual-axis charts' });
        return;
      }
      if (!chartConfig.dualAxisConfig.secondary.measure) {
        showToast({ type: 'error', message: 'Secondary measure is required for dual-axis charts' });
        return;
      }
    }
    // Measure is not required for table charts, dual-axis (validated above), or multi-series (uses seriesConfigs)
    else if (
      chartConfig.chartType !== 'table' &&
      !chartConfig.useMultipleSeries &&
      !chartConfig.measure
    ) {
      showToast({ type: 'error', message: 'Measure selection is required' });
      return;
    }

    // Force re-render of preview chart by incrementing key and switch to preview step
    dispatch({ type: 'INCREMENT_PREVIEW_KEY' });
  };

  const handleSave = async () => {
    if (!chartConfig.selectedDataSource) {
      showToast({ type: 'error', message: 'Data source selection is required' });
      return;
    }

    dispatch({ type: 'SET_SAVING', isSaving: true });
    try {
      const basePayload = buildChartPayload(
        chartConfig,
        chartConfig.selectedDataSource,
        selectedDatePreset
      );

      // Add drill-down configuration to payload
      const payload = {
        ...basePayload,
        drill_down_enabled: drillDownConfig.drill_down_enabled,
        drill_down_type: drillDownConfig.drill_down_type,
        drill_down_target_chart_id: drillDownConfig.drill_down_target_chart_id,
        drill_down_button_label: drillDownConfig.drill_down_button_label,
      };

      const url = isEditMode
        ? `/api/admin/analytics/charts/${editingChart?.chart_definition_id}`
        : '/api/admin/analytics/charts';

      await (isEditMode ? apiClient.patch(url, payload) : apiClient.post(url, payload));

      showToast({
        type: 'success',
        message: `Chart "${chartConfig.chartName}" ${isEditMode ? 'updated' : 'saved'} successfully!`,
      });

      // Call success callback or reset form
      if (onSaveSuccess) {
        onSaveSuccess();
      } else if (onCancel) {
        onCancel();
      } else {
        dispatch({ type: 'SET_CURRENT_STEP', step: 'configure' });
      }
    } catch (error) {
      showToast({
        type: 'error',
        message: `Failed to ${isEditMode ? 'update' : 'save'} chart: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      dispatch({ type: 'SET_SAVING', isSaving: false });
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
              onClick={() => dispatch({ type: 'SET_CURRENT_STEP', step: key })}
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

            {/* Drill-Down Configuration */}
            <ChartBuilderDrillDown
              chartDefinitionId={editingChart?.chart_definition_id}
              config={drillDownConfig}
              onChange={(updates) => dispatch({ type: 'UPDATE_DRILL_DOWN_CONFIG', updates })}
              isSaved={isEditMode}
            />

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
            onBackToConfigure={() => dispatch({ type: 'SET_CURRENT_STEP', step: 'configure' })}
            onSave={handleSave}
            isSaving={isSaving}
          />
        )}
      </div>

      {/* Schema Information Panel */}
      <ChartBuilderSchema schemaInfo={schemaInfo} />
    </div>
  );
}
