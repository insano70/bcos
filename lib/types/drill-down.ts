/**
 * Drill-Down Configuration Types
 *
 * Types for interactive chart drill-down functionality.
 * Enables users to click chart elements and filter/navigate/swap charts.
 *
 * @module lib/types/drill-down
 */

/**
 * Types of drill-down actions available
 * - filter: Apply filter to current chart (show only clicked value)
 * - navigate: Open target chart in modal with filter applied
 * - swap: Replace current chart with target chart (no filter)
 */
export type DrillDownType = 'filter' | 'navigate' | 'swap';

/**
 * Single filter field/value pair
 */
export interface DrillDownFilter {
  field: string;
  value: string | number;
}

/**
 * Context captured from a user clicking a chart element.
 * Provides all information needed to determine drill-down behavior.
 * 
 * For multi-series charts (e.g., Revenue by Provider over Time):
 * - fieldName/fieldValue = primary dimension (x-axis, e.g., 'date' = 'January')
 * - seriesFieldName/seriesFieldValue = series dimension (e.g., 'provider_name' = 'Dr. Smith')
 */
export interface ChartClickContext {
  /** The primary field (x-axis or groupBy) */
  fieldName: string;

  /** The primary value clicked */
  fieldValue: string | number;

  /** For multi-series: the field used for series grouping (e.g., 'provider_name') */
  seriesFieldName?: string;

  /** For multi-series: the value of the clicked series (e.g., 'Dr. Smith') */
  seriesFieldValue?: string;

  /** Dataset label for multi-series charts (kept for compatibility) */
  datasetLabel?: string;

  /** Screen coordinates where the click occurred (for icon positioning) */
  clickPosition: { x: number; y: number };

  /** Index of the data point in the chart data array */
  dataIndex: number;

  /** Index of the dataset (for multi-series charts) */
  datasetIndex: number;
}

/**
 * Drill-down configuration from chart definition.
 * Derived from chart_definitions table columns.
 */
export interface DrillDownConfig {
  /** Whether drill-down is enabled for this chart */
  enabled: boolean;

  /** Type of drill-down action */
  type: DrillDownType | null;

  /** Target chart ID for navigate/swap types (null for filter type) */
  targetChartId: string | null;

  /** Custom label for drill-down button/tooltip */
  buttonLabel: string;
}

/**
 * Result of executing a drill-down action.
 * Used by UI to determine what action to take.
 * 
 * Supports multiple filters for multi-series charts where both
 * the primary dimension and series dimension should be filtered.
 */
export interface DrillDownResult {
  /** Type of action to perform */
  type: DrillDownType;

  /** For 'filter': filters to apply to current chart (supports multi-series) */
  filters?: DrillDownFilter[];

  /** For 'navigate'/'swap': the target chart ID to display */
  targetChartId?: string;

  /** For 'navigate': filters to apply to target chart (supports multi-series) */
  targetFilters?: DrillDownFilter[];
}

/**
 * Props for drill-down icon component
 */
export interface DrillDownIconProps {
  /** Whether the icon should be visible */
  isVisible: boolean;

  /** Position to render the icon */
  position: { x: number; y: number } | null;

  /** Label shown in tooltip */
  label: string;

  /** Handler when icon is clicked */
  onClick: () => void;

  /** Handler to dismiss the icon */
  onDismiss: () => void;
}

/**
 * Props for drill-down modal component
 */
export interface DrillDownModalProps {
  /** Whether the modal is open */
  isOpen: boolean;

  /** Handler to close the modal */
  onClose: () => void;

  /** Name of the source chart (for breadcrumb display) */
  sourceChartName: string;

  /** Target chart ID to display */
  targetChartId: string;

  /** Filters applied from source chart click (supports multi-series) */
  appliedFilters?: DrillDownFilter[];
}

/**
 * Return type from useChartDrillDown hook
 */
export interface UseChartDrillDownReturn {
  /** Handler to call when a chart element is clicked */
  handleElementClick: (context: ChartClickContext) => void;

  /** Whether the drill-down icon should be visible */
  showDrillDownIcon: boolean;

  /** Position for the drill-down icon */
  iconPosition: { x: number; y: number } | null;

  /** The captured click context */
  clickContext: ChartClickContext | null;

  /** Execute the drill-down action and return result */
  executeDrillDown: () => DrillDownResult | null;

  /** Dismiss the drill-down icon without acting */
  dismissIcon: () => void;
}

/**
 * Chart summary for target selection dropdown
 */
export interface DrillDownTargetChart {
  /** Chart ID */
  chartDefinitionId: string;

  /** Chart display name */
  chartName: string;

  /** Chart type (bar, line, pie, etc.) */
  chartType: string;

  /** Data source ID (for compatibility filtering) */
  dataSourceId: number;
}

