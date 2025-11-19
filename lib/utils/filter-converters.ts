/**
 * Filter Conversion Utilities
 *
 * Centralized utilities for converting between different filter formats
 * used across the analytics system.
 *
 * Single Responsibility: Convert dashboard/universal filters to chart filter formats
 *
 * Used by:
 * - Dashboard rendering system (batch execution)
 * - Dimension expansion system
 * - Chart query building
 */

import type { ChartFilter } from '@/lib/types/analytics';

/**
 * Base filter object structure from dashboard/universal filters
 */
export interface BaseFilters {
  startDate?: string;
  endDate?: string;
  practiceUids?: number[];
  organizationId?: string;
  providerName?: string;
  dateRangePreset?: string;
  advancedFilters?: ChartFilter[];
  [key: string]: unknown;
}

/**
 * Resolved filters with required practiceUids
 * Compatible with ResolvedFilters from dashboard-rendering/types
 */
export interface ResolvedBaseFilters {
  startDate?: string;
  endDate?: string;
  practiceUids: number[];
  organizationId?: string;
  providerName?: string;
  dateRangePreset?: string;
  advancedFilters?: ChartFilter[];
  [key: string]: unknown;
}

/**
 * Convert base filters object to ChartFilter array
 *
 * Transforms dashboard/universal filter format into the ChartFilter array
 * format used by query builders and services.
 *
 * Handles:
 * - Date range filters (startDate, endDate → date field with gte/lte operators)
 * - Practice UID filters (practiceUids array → practice_uid field with 'in' operator)
 * - Advanced filters (passed through directly)
 *
 * @param baseFilters - Base filters from dashboard or API request
 * @returns Array of ChartFilter objects ready for query building
 *
 * @example
 * ```typescript
 * const baseFilters = {
 *   startDate: '2024-01-01',
 *   endDate: '2024-12-31',
 *   practiceUids: [100, 101, 102],
 *   advancedFilters: [{ field: 'location', operator: 'eq', value: 'downtown' }]
 * };
 *
 * const chartFilters = convertBaseFiltersToChartFilters(baseFilters);
 * // Returns:
 * // [
 * //   { field: 'date', operator: 'gte', value: '2024-01-01' },
 * //   { field: 'date', operator: 'lte', value: '2024-12-31' },
 * //   { field: 'practice_uid', operator: 'in', value: [100, 101, 102] },
 * //   { field: 'location', operator: 'eq', value: 'downtown' }
 * // ]
 * ```
 */
export function convertBaseFiltersToChartFilters(
  baseFilters: BaseFilters | ResolvedBaseFilters
): ChartFilter[] {
  const filters: ChartFilter[] = [];

  // Handle advanced filters (pass through directly)
  if (Array.isArray(baseFilters.advancedFilters)) {
    filters.push(...baseFilters.advancedFilters);
  }

  // Handle measure (required for measure-based data sources)
  if (baseFilters.measure && typeof baseFilters.measure === 'string') {
    filters.push({
      field: 'measure',
      operator: 'eq',
      value: baseFilters.measure,
    });
  }

  // Handle frequency (required for measure-based data sources)
  if (baseFilters.frequency && typeof baseFilters.frequency === 'string') {
    filters.push({
      field: 'frequency',
      operator: 'eq',
      value: baseFilters.frequency,
    });
  }

  // Handle date range - start date
  if (baseFilters.startDate && typeof baseFilters.startDate === 'string') {
    filters.push({
      field: 'date',
      operator: 'gte',
      value: baseFilters.startDate,
    });
  }

  // Handle date range - end date
  if (baseFilters.endDate && typeof baseFilters.endDate === 'string') {
    filters.push({
      field: 'date',
      operator: 'lte',
      value: baseFilters.endDate,
    });
  }

  // Handle practice UIDs
  // SECURITY: Only include if array exists and has values
  if (Array.isArray(baseFilters.practiceUids) && baseFilters.practiceUids.length > 0) {
    filters.push({
      field: 'practice_uid',
      operator: 'in',
      value: baseFilters.practiceUids,
    });
  }

  return filters;
}

/**
 * Convert base filters to runtime filters object
 *
 * Transforms dashboard filters into the runtime filters format used by
 * chart orchestrator and handlers.
 *
 * This creates a flat object with filter parameters rather than a
 * structured ChartFilter array.
 *
 * @param baseFilters - Base filters from dashboard
 * @returns Runtime filters object for chart orchestrator
 *
 * @example
 * ```typescript
 * const baseFilters = {
 *   startDate: '2024-01-01',
 *   endDate: '2024-12-31',
 *   practiceUids: [100, 101],
 *   advancedFilters: [{ field: 'location', operator: 'eq', value: 'downtown' }]
 * };
 *
 * const runtimeFilters = convertBaseFiltersToRuntimeFilters(baseFilters);
 * // Returns:
 * // {
 * //   startDate: '2024-01-01',
 * //   endDate: '2024-12-31',
 * //   practiceUids: [100, 101],
 * //   advancedFilters: [{ field: 'location', operator: 'eq', value: 'downtown' }]
 * // }
 * ```
 */
export function convertBaseFiltersToRuntimeFilters(
  baseFilters: BaseFilters
): Record<string, unknown> {
  const runtimeFilters: Record<string, unknown> = {};

  // Date range
  if (baseFilters.startDate) {
    runtimeFilters.startDate = baseFilters.startDate;
  }
  if (baseFilters.endDate) {
    runtimeFilters.endDate = baseFilters.endDate;
  }

  // Practice UIDs
  // SECURITY-CRITICAL: Only pass through if array exists and has values
  // Empty arrays should NOT be passed (no filter applied = query all practices)
  if (baseFilters.practiceUids && baseFilters.practiceUids.length > 0) {
    runtimeFilters.practiceUids = baseFilters.practiceUids;
  }

  // Advanced filters
  if (Array.isArray(baseFilters.advancedFilters) && baseFilters.advancedFilters.length > 0) {
    runtimeFilters.advancedFilters = baseFilters.advancedFilters;
  }

  // Pass through other known filter fields
  if (baseFilters.organizationId) {
    runtimeFilters.organizationId = baseFilters.organizationId;
  }
  if (baseFilters.providerName) {
    runtimeFilters.providerName = baseFilters.providerName;
  }
  if (baseFilters.dateRangePreset) {
    runtimeFilters.dateRangePreset = baseFilters.dateRangePreset;
  }

  return runtimeFilters;
}

