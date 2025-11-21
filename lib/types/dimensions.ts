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
 * Error information for failed dimension chart
 */
export interface DimensionChartError {
  message: string; // User-friendly error message
  code: string; // Error code for logging/debugging
  details?: string | undefined; // Optional technical details (development only)
}

/**
 * Chart data for a single dimension value
 */
export interface DimensionExpandedChart {
  dimensionValue: DimensionValue; // Which dimension value this chart represents
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
 * Complete dimension expansion result for a chart
 */
export interface DimensionExpandedChartData {
  dimension: ExpansionDimension; // Which dimension was expanded
  charts: DimensionExpandedChart[]; // One chart per dimension value
  metadata: {
    totalQueryTime: number; // Total time for all queries
    parallelExecution: boolean; // Whether queries ran in parallel
    totalCharts: number; // Number of charts rendered
  };
}

/**
 * Request payload for dimension expansion
 * 
 * SIMPLE APPROACH: Reuse the configs from the base chart render
 * - finalChartConfig: The exact config used to render the base chart (has seriesConfigs, dualAxisConfig, everything!)
 * - runtimeFilters: The exact filters used to render the base chart (resolved dates, practices, everything!)
 * - Just add dimension filter and re-render
 * 
 * No reconstruction, no fetching, just reuse what works!
 */
export interface DimensionExpansionRequest {
  // SIMPLE: Configs from the base chart render (preferred)
  finalChartConfig?: Record<string, unknown>;
  runtimeFilters?: Record<string, unknown>;
  
  // FALLBACK: Chart definition ID (triggers full metadata fetch)
  chartDefinitionId?: string;
  
  // Required
  dimensionColumn: string;
  
  // Fallback filters (only if configs not provided)
  baseFilters?: Record<string, unknown>;
  limit?: number;
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

