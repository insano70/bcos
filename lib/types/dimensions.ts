/**
 * Dimension Expansion Types
 *
 * Types for the metadata-driven dimension expansion system.
 * Enables side-by-side chart comparisons across dimension values
 * (e.g., location, line of business) discovered from data source metadata.
 */

// Chart render result from batch API
export interface ChartRenderResult {
  chartData: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string | string[];
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  rawData: Record<string, unknown>[];
  metadata: {
    chartType: string;
    dataSourceId: number;
    transformedAt: string;
    queryTimeMs: number;
    cacheHit: boolean;
    recordCount: number;
    transformDuration: number;
  };
}

/**
 * Expansion dimension discovered from data source column metadata
 */
export interface ExpansionDimension {
  columnName: string; // Column name in data source (e.g., "location")
  displayName: string; // Display name for UI (e.g., "Location")
  dataType: 'string' | 'integer' | 'boolean'; // Data type of dimension column
  valueCount?: number; // Number of unique values (populated when values fetched)
  dataSourceId: number; // Parent data source ID
}

/**
 * Single value within an expansion dimension
 */
export interface DimensionValue {
  value: string | number; // Actual value from data (e.g., "downtown_clinic" or 100)
  label: string; // Display label for UI (e.g., "Downtown Clinic")
  recordCount?: number; // Number of records with this value (optional, for UI display)
  isOther?: boolean; // True if this is the aggregated "Other" category (remaining values beyond top N)
}

/**
 * Combination of multiple dimension values (cartesian product)
 *
 * Example: { location: "downtown_clinic", line_of_business: "physical_therapy" }
 * Display: "Downtown Clinic - Physical Therapy"
 */
export interface DimensionValueCombination {
  values: Record<string, string | number>; // Map of columnName to value
  label: string; // Display label composed from all dimension labels
  recordCount?: number; // Optional record count (populated after query)
  isOther?: boolean; // True if any dimension in this combination is "Other"
  otherDimensions?: string[]; // Dimension columns where value is "Other"
  excludeValues?: Record<string, Array<string | number>>; // Values to exclude for "Other" (NOT IN filter)
}

/**
 * Error information for failed dimension chart
 */
export interface DimensionChartError {
  message: string; // User-friendly error message
  code: string; // Error code for logging/debugging
  details?: string | undefined; // Optional technical details (development only)
}

/**
 * Chart data for a dimension value combination
 */
export interface DimensionExpandedChart {
  dimensionValue: DimensionValueCombination; // Always a combination (even for single dim)
  chartData: import('@/lib/services/dashboard-rendering/mappers').BatchChartData | null; // Transformed chart data (null if error)
  error?: DimensionChartError; // Error information if chart failed to render
  metadata: {
    recordCount: number; // Total records in this dimension (0 if error)
    queryTimeMs: number; // Query execution time
    cacheHit: boolean; // Whether data came from cache
    transformDuration: number; // Data transformation time
  };
}

/**
 * Available dimensions for a chart (from data source configuration)
 */
export interface AvailableDimensionsResponse {
  dimensions: ExpansionDimension[];
  chartDefinitionId: string;
  dataSourceId: number;
}

/**
 * Dimension values response
 */
export interface DimensionValuesResponse {
  values: DimensionValue[];
  dimension: ExpansionDimension;
  totalValues: number; // Total unique values (may be > values.length if limited)
  filtered: boolean; // Whether values are filtered by user's RBAC
  hasMore?: boolean; // Whether there are more values beyond the returned set
  otherRecordCount?: number; // Record count for remaining values not in top N (for "Other" category)
}

/**
 * Chart configuration for dimension expansion
 * Contains the chart's data source and rendering configuration
 * 
 * Note: Properties are optional to maintain backward compatibility
 * with existing code passing Record<string, unknown>
 */
export interface DimensionExpansionChartConfig {
  /** Data source ID for the chart */
  dataSourceId?: number;
  /** Chart type (bar, line, pie, etc.) */
  chartType?: string;
  /** Optional group by column */
  groupBy?: string;
  /** Color palette name */
  colorPalette?: string;
  /** Stacking mode for bar/area charts */
  stackingMode?: 'normal' | 'stacked' | 'percentage';
  /** Allow additional properties for flexibility */
  [key: string]: unknown;
}

/**
 * Runtime filters for dimension expansion
 * Contains the current filter state for the chart
 */
export interface DimensionExpansionFilters {
  /** Start date for date range filter (ISO format) */
  startDate?: string;
  /** End date for date range filter (ISO format) */
  endDate?: string;
  /** Practice UIDs for filtering */
  practiceUids?: number[];
  /** Measure for measure-based data sources */
  measure?: string;
  /** Frequency/time period for measure-based data sources */
  frequency?: string;
  /** Advanced filters (field-level filtering) */
  advancedFilters?: import('./analytics').ChartFilter[];
  /** Allow additional properties for flexibility */
  [key: string]: unknown;
}

/**
 * Multi-dimension expansion request
 *
 * Extends single-dimension expansion to support cartesian product
 * of multiple dimension values (e.g., Location × Line of Business)
 */
export interface MultiDimensionExpansionRequest {
  finalChartConfig: DimensionExpansionChartConfig;
  runtimeFilters: DimensionExpansionFilters;
  dimensionColumns: string[]; // Array of dimension column names
  limit?: number;
  offset?: number; // Pagination offset (default: 0)
}

/**
 * Multi-dimension expanded chart data
 *
 * Result from expanding by multiple dimensions simultaneously.
 * Charts array contains one chart per combination of dimension values.
 */
export interface MultiDimensionExpandedChartData {
  dimensions: ExpansionDimension[]; // All dimensions used for expansion
  charts: DimensionExpandedChart[]; // One chart per dimension value combination
  metadata: {
    totalQueryTime: number; // Total time for all queries
    parallelExecution: boolean; // Whether queries ran in parallel
    totalCharts: number; // Number of charts rendered
    dimensionCounts: Record<string, number>; // Value count per dimension (e.g., { location: 2, line_of_business: 3 })
    totalCombinations?: number; // Total possible combinations (before pagination)
    offset?: number; // Current pagination offset
    limit?: number; // Current page size
    hasMore?: boolean; // Whether more charts available
  };
}

// Type aliases for backward compatibility (optional, but helps with refactoring steps)
// export type DimensionExpansionRequest = MultiDimensionExpansionRequest; 
// export type DimensionExpandedChartData = MultiDimensionExpandedChartData;

// =============================================================================
// Phase 1: Value-Level Selection Types
// =============================================================================

/**
 * Value-level dimension selection
 * 
 * Allows users to select specific values within a dimension rather than
 * expanding by all values. This prevents combinatorial explosion.
 * 
 * Example: Instead of expanding by ALL 10 locations, user selects only
 * "Downtown Clinic" and "Uptown Clinic" (2 values).
 */
export interface DimensionValueSelection {
  /** Column name of the dimension (e.g., "location") */
  columnName: string;
  /** Specific values to include in expansion */
  selectedValues: (string | number)[];
  /** Display name of the dimension (for UI) */
  displayName?: string;
}

/**
 * Request with specific value selections (Phase 1)
 * 
 * Replaces the all-or-nothing MultiDimensionExpansionRequest with
 * fine-grained value selection per dimension.
 * 
 * Example:
 * - Old: dimensionColumns: ["location", "line_of_business"]
 *   Result: 10 locations × 5 LOBs = 50 charts
 * 
 * - New: selections: [
 *     { columnName: "location", selectedValues: ["downtown", "uptown"] },
 *     { columnName: "line_of_business", selectedValues: ["pt", "ot"] }
 *   ]
 *   Result: 2 × 2 = 4 charts (user-controlled)
 */
export interface ValueLevelExpansionRequest {
  /** Chart configuration (data source, chart type, etc.) */
  finalChartConfig: DimensionExpansionChartConfig;
  /** Runtime filters (date range, practice, etc.) */
  runtimeFilters: DimensionExpansionFilters;
  /** Dimension selections with specific values */
  selections: DimensionValueSelection[];
  /** Maximum charts to return (pagination) */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

/**
 * Dimension with its available values for selection UI
 * 
 * Used by DimensionValueSelector component to render expandable
 * dimension groups with checkboxes for each value.
 */
export interface DimensionWithValues {
  /** Dimension metadata */
  dimension: ExpansionDimension;
  /** Available values for selection */
  values: DimensionValue[];
  /** Whether values are currently loading */
  isLoading?: boolean;
  /** Error message if value fetch failed */
  error?: string;
}

/**
 * State for value-level selection UI
 * 
 * Tracks which values are selected for each dimension.
 * Key: columnName, Value: set of selected values
 */
export type ValueSelectionState = Record<string, Set<string | number>>;

/**
 * Serializable version of ValueSelectionState for API/storage
 * 
 * Sets are not JSON-serializable, so we convert to arrays for
 * API requests and localStorage persistence.
 */
export type SerializedValueSelection = Record<string, (string | number)[]>;

/**
 * Convert ValueSelectionState to DimensionValueSelection array
 * for API requests
 */
export function toSelectionArray(
  state: ValueSelectionState,
  dimensions: ExpansionDimension[]
): DimensionValueSelection[] {
  return Object.entries(state)
    .filter(([_, values]) => values.size > 0)
    .map(([columnName, values]) => {
      const dimension = dimensions.find(d => d.columnName === columnName);
      const selection: DimensionValueSelection = {
        columnName,
        selectedValues: Array.from(values),
      };
      // Only add displayName if it exists (exactOptionalPropertyTypes compliance)
      if (dimension?.displayName) {
        selection.displayName = dimension.displayName;
      }
      return selection;
    });
}

/**
 * Convert DimensionValueSelection array to ValueSelectionState
 * for state management
 */
export function toSelectionState(
  selections: DimensionValueSelection[]
): ValueSelectionState {
  const state: ValueSelectionState = {};
  for (const selection of selections) {
    state[selection.columnName] = new Set(selection.selectedValues);
  }
  return state;
}

/**
 * Calculate the number of chart combinations from selections
 * 
 * @param state - Current value selection state
 * @returns Product of selected values per dimension (cartesian product size)
 */
export function calculateCombinationCount(state: ValueSelectionState): number {
  const counts = Object.values(state).map(set => set.size);
  if (counts.length === 0) return 0;
  return counts.reduce((product, count) => product * (count || 1), 1);
}
