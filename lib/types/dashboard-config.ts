/**
 * Dashboard Configuration Types
 *
 * Specific types for dashboard layout and chart positioning.
 * Replaces generic Record<string, unknown> patterns.
 */

// =============================================================================
// Chart Position Types
// =============================================================================

/**
 * Chart position within dashboard grid
 * Uses react-grid-layout compatible structure
 */
export interface ChartPosition {
  /** Unique chart identifier (chart_definition_id) */
  i: string;
  /** X coordinate in grid units */
  x: number;
  /** Y coordinate in grid units */
  y: number;
  /** Width in grid units */
  w: number;
  /** Height in grid units */
  h: number;
  /** Minimum width (optional) */
  minW?: number;
  /** Minimum height (optional) */
  minH?: number;
  /** Maximum width (optional) */
  maxW?: number;
  /** Maximum height (optional) */
  maxH?: number;
  /** Whether the item is static (not draggable/resizable) */
  static?: boolean;
  /** Whether dragging is disabled */
  isDraggable?: boolean;
  /** Whether resizing is disabled */
  isResizable?: boolean;
}

/**
 * Chart position from database (simplified version)
 * Used when retrieving positions from dashboard_charts table
 */
export interface StoredChartPosition {
  /** X coordinate in grid units */
  x: number;
  /** Y coordinate in grid units */
  y: number;
  /** Width in grid units */
  w: number;
  /** Height in grid units */
  h: number;
}

// =============================================================================
// Dashboard Filter Configuration
// =============================================================================

/**
 * Dashboard filter bar configuration
 */
export interface DashboardFilterConfig {
  /** Whether filter bar is enabled (default: true) */
  enabled?: boolean;
  /** Show date range filter (default: true) */
  showDateRange?: boolean;
  /** Show organization filter (default: true) */
  showOrganization?: boolean;
  /** Show practice filter (default: false) */
  showPractice?: boolean;
  /** Show provider filter (default: false) */
  showProvider?: boolean;
  /** Default filter values */
  defaultFilters?: {
    /** Default date range preset */
    dateRangePreset?: string;
    /** Default organization ID */
    organizationId?: string;
  };
}

// =============================================================================
// Dashboard Layout Configuration
// =============================================================================

/**
 * Complete dashboard layout configuration
 */
export interface DashboardLayout {
  /** Number of columns in the grid */
  columns: number;
  /** Height of each row in pixels */
  rowHeight: number;
  /** Margin between grid items [horizontal, vertical] or single value */
  margin: number | [number, number];
  /** Container padding [horizontal, vertical] or single value */
  containerPadding?: number | [number, number] | undefined;
  /** Filter bar configuration */
  filterConfig?: DashboardFilterConfig | undefined;
  /** Enable batch rendering for better performance (default: true) */
  useBatchRendering?: boolean | undefined;
  /** Compact type for grid layout */
  compactType?: 'vertical' | 'horizontal' | null | undefined;
  /** Prevent collision when dragging */
  preventCollision?: boolean | undefined;
  /** Enable vertical compacting */
  verticalCompact?: boolean | undefined;
}

// =============================================================================
// Dashboard with Charts (Complete)
// =============================================================================

/**
 * Chart entry in dashboard with position
 */
export interface DashboardChartEntry {
  /** Chart definition ID */
  chart_definition_id: string;
  /** Chart name */
  chart_name: string;
  /** Chart description */
  chart_description: string | null;
  /** Chart type */
  chart_type: string;
  /** Position configuration */
  position_config: StoredChartPosition;
}

/**
 * Complete dashboard with all chart entries
 */
export interface DashboardWithChartsComplete {
  dashboard_id: string;
  dashboard_name: string;
  dashboard_description: string | null;
  layout_config: DashboardLayout;
  dashboard_category_id: number | null;
  organization_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  is_published: boolean;
  is_default: boolean;
  chart_count: number;
  category: {
    chart_category_id: number;
    category_name: string;
    category_description: string | null;
  } | null;
  creator: {
    user_id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  charts: DashboardChartEntry[];
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for ChartPosition
 */
export function isChartPosition(value: unknown): value is ChartPosition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'i' in value &&
    'x' in value &&
    'y' in value &&
    'w' in value &&
    'h' in value &&
    typeof (value as ChartPosition).i === 'string' &&
    typeof (value as ChartPosition).x === 'number' &&
    typeof (value as ChartPosition).y === 'number' &&
    typeof (value as ChartPosition).w === 'number' &&
    typeof (value as ChartPosition).h === 'number'
  );
}

/**
 * Type guard for StoredChartPosition
 */
export function isStoredChartPosition(value: unknown): value is StoredChartPosition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    'w' in value &&
    'h' in value &&
    typeof (value as StoredChartPosition).x === 'number' &&
    typeof (value as StoredChartPosition).y === 'number' &&
    typeof (value as StoredChartPosition).w === 'number' &&
    typeof (value as StoredChartPosition).h === 'number'
  );
}

/**
 * Type guard for DashboardLayout
 */
export function isDashboardLayout(value: unknown): value is DashboardLayout {
  return (
    typeof value === 'object' &&
    value !== null &&
    'columns' in value &&
    'rowHeight' in value &&
    'margin' in value &&
    typeof (value as DashboardLayout).columns === 'number' &&
    typeof (value as DashboardLayout).rowHeight === 'number'
  );
}

/**
 * Type guard for DashboardFilterConfig
 */
export function isDashboardFilterConfig(value: unknown): value is DashboardFilterConfig {
  if (typeof value !== 'object' || value === null) return false;
  const config = value as DashboardFilterConfig;
  // All fields are optional, so we just check types if present
  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') return false;
  if (config.showDateRange !== undefined && typeof config.showDateRange !== 'boolean') return false;
  if (config.showOrganization !== undefined && typeof config.showOrganization !== 'boolean') return false;
  if (config.showPractice !== undefined && typeof config.showPractice !== 'boolean') return false;
  if (config.showProvider !== undefined && typeof config.showProvider !== 'boolean') return false;
  return true;
}

// =============================================================================
// Conversion Utilities
// =============================================================================

/**
 * Convert ChartPosition array to react-grid-layout compatible format
 */
export function toGridLayout(positions: ChartPosition[]): ChartPosition[] {
  return positions.map((pos) => ({
    i: pos.i,
    x: pos.x,
    y: pos.y,
    w: pos.w,
    h: pos.h,
    ...(pos.minW !== undefined && { minW: pos.minW }),
    ...(pos.minH !== undefined && { minH: pos.minH }),
    ...(pos.maxW !== undefined && { maxW: pos.maxW }),
    ...(pos.maxH !== undefined && { maxH: pos.maxH }),
    ...(pos.static !== undefined && { static: pos.static }),
  }));
}

/**
 * Convert StoredChartPosition to ChartPosition
 */
export function toChartPosition(chartId: string, stored: StoredChartPosition): ChartPosition {
  return {
    i: chartId,
    x: stored.x,
    y: stored.y,
    w: stored.w,
    h: stored.h,
  };
}

