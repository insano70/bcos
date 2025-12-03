'use client';

/**
 * ChartBuilderDrillDown Component
 *
 * Configuration section for drill-down settings in the chart builder.
 * Allows users to:
 * - Enable/disable drill-down
 * - Select drill-down type (filter, navigate, swap)
 * - Choose target chart (for navigate/swap)
 * - Customize button label
 *
 * Single Responsibility: Drill-down configuration UI
 *
 * @module components/charts/chart-builder-drill-down
 */

import { useCallback, useMemo } from 'react';
import { Info } from 'lucide-react';
import type { DrillDownType } from '@/lib/types/drill-down';
import DrillDownChartSelector from './drill-down-chart-selector';

/**
 * Drill-down configuration state
 */
export interface DrillDownConfig {
  drill_down_enabled: boolean;
  drill_down_type: DrillDownType | null;
  drill_down_target_chart_id: string | null;
  drill_down_button_label: string;
}

/**
 * Props for ChartBuilderDrillDown
 */
interface ChartBuilderDrillDownProps {
  /** Current chart definition ID (for finding compatible targets) */
  chartDefinitionId: string | undefined;
  /** Current drill-down configuration */
  config: DrillDownConfig;
  /** Callback when configuration changes */
  onChange: (config: Partial<DrillDownConfig>) => void;
  /** Whether the chart has been saved (needed for target selection) */
  isSaved: boolean;
}

/**
 * Drill-down type options with descriptions
 */
const DRILL_DOWN_TYPES: Array<{
  value: DrillDownType;
  label: string;
  description: string;
}> = [
  {
    value: 'filter',
    label: 'Filter Current Chart',
    description: 'Clicking an element filters this chart to show only that value',
  },
  {
    value: 'navigate',
    label: 'Navigate to Chart',
    description: 'Opens a different chart in a modal, filtered to the clicked value',
  },
  {
    value: 'swap',
    label: 'Swap Chart',
    description: 'Replaces this chart with a different chart (no filter applied)',
  },
];

/**
 * Configuration section for drill-down settings
 */
export default function ChartBuilderDrillDown({
  chartDefinitionId,
  config,
  onChange,
  isSaved,
}: ChartBuilderDrillDownProps) {
  // Check if target selection is needed
  const needsTargetChart = config.drill_down_type === 'navigate' || config.drill_down_type === 'swap';

  // Handle enable toggle
  const handleEnableChange = useCallback(
    (enabled: boolean) => {
      onChange({
        drill_down_enabled: enabled,
        // Reset type and target when disabling
        ...(enabled ? {} : { drill_down_type: null, drill_down_target_chart_id: null }),
      });
    },
    [onChange]
  );

  // Handle type change
  const handleTypeChange = useCallback(
    (type: DrillDownType) => {
      onChange({
        drill_down_type: type,
        // Clear target chart if switching to filter type
        drill_down_target_chart_id: type === 'filter' ? null : config.drill_down_target_chart_id,
      });
    },
    [onChange, config.drill_down_target_chart_id]
  );

  // Handle target chart change
  const handleTargetChange = useCallback(
    (chartId: string | null) => {
      onChange({ drill_down_target_chart_id: chartId });
    },
    [onChange]
  );

  // Handle button label change
  const handleLabelChange = useCallback(
    (label: string) => {
      onChange({ drill_down_button_label: label });
    },
    [onChange]
  );

  // Compute validation state
  const validationError = useMemo(() => {
    if (!config.drill_down_enabled) return null;
    if (!config.drill_down_type) return 'Select a drill-down type';
    if (needsTargetChart && !config.drill_down_target_chart_id) {
      return 'Select a target chart';
    }
    return null;
  }, [config, needsTargetChart]);

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
        Drill-Down Configuration
      </h3>

      {/* Enable toggle */}
      <div className="mb-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.drill_down_enabled}
            onChange={(e) => handleEnableChange(e.target.checked)}
            className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
          />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Enable Drill-Down
          </span>
        </label>
        <p className="mt-1 ml-6 text-xs text-gray-500 dark:text-gray-400">
          Allow users to click chart elements for deeper data exploration
        </p>
      </div>

      {/* Configuration options (only when enabled) */}
      {config.drill_down_enabled && (
        <div className="space-y-6 pl-6 border-l-2 border-violet-200 dark:border-violet-800">
          {/* Drill-down type selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Drill-Down Action
            </label>
            <div className="space-y-2">
              {DRILL_DOWN_TYPES.map((type) => (
                <label
                  key={type.value}
                  className={`
                    flex items-start gap-3 p-3 rounded-lg border cursor-pointer
                    transition-all duration-150
                    ${
                      config.drill_down_type === type.value
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="drill_down_type"
                    value={type.value}
                    checked={config.drill_down_type === type.value}
                    onChange={() => handleTypeChange(type.value)}
                    className="mt-0.5 w-4 h-4 text-violet-600 border-gray-300 focus:ring-violet-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {type.label}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {type.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Target chart selector (for navigate/swap) */}
          {needsTargetChart && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Target Chart
              </label>

              {!isSaved ? (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Save this chart first to select a target chart. Target charts must share
                    the same data source for filter compatibility.
                  </p>
                </div>
              ) : chartDefinitionId ? (
                <DrillDownChartSelector
                  sourceChartId={chartDefinitionId}
                  selectedChartId={config.drill_down_target_chart_id}
                  onSelect={handleTargetChange}
                  placeholder="Select a chart..."
                />
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Chart ID not available
                </p>
              )}
            </div>
          )}

          {/* Button label input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Button Label
            </label>
            <input
              type="text"
              value={config.drill_down_button_label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="Drill Down"
              maxLength={50}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-violet-500 focus:border-violet-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Text shown on the drill-down button tooltip (max 50 characters)
            </p>
          </div>

          {/* Validation error */}
          {validationError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <Info className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{validationError}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

