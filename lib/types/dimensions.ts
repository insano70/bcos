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
}

/**
 * Multi-dimension expansion request
 *
 * Extends single-dimension expansion to support cartesian product
 * of multiple dimension values (e.g., Location × Line of Business)
 */
export interface MultiDimensionExpansionRequest {
  finalChartConfig: Record<string, unknown>;
  runtimeFilters: Record<string, unknown>;
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
