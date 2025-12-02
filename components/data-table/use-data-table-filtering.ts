'use client';

import { useMemo, useState, useCallback } from 'react';

/**
 * Filter configuration for a single field.
 */
export interface ActiveFilter {
  /** The field name to filter on */
  field: string;
  /** The value to compare against */
  comparator: unknown;
  /** Optional label for display */
  label?: string;
}

/**
 * Date range for filtering.
 */
export interface DateRange {
  /** Start date (inclusive) */
  startDate: Date | null;
  /** End date (inclusive) */
  endDate: Date | null;
  /** Display label for the period */
  period: string;
}

interface UseDataTableFilteringOptions<T> {
  /** The source data array */
  data: T[];
  /** Field to use for date range filtering */
  dateField?: keyof T;
  /** Initial filter values */
  initialFilters?: ActiveFilter[];
  /** Initial date range */
  initialDateRange?: DateRange;
}

interface UseDataTableFilteringReturn<T> {
  /** Filtered data after applying all filters */
  filteredData: T[];
  /** Current active filters */
  activeFilters: ActiveFilter[];
  /** Current date range */
  dateRange: DateRange;
  /** Handler to update filters */
  setActiveFilters: (filters: ActiveFilter[]) => void;
  /** Handler to update date range */
  setDateRange: (range: DateRange) => void;
  /** Clear all filters and date range */
  clearAllFilters: () => void;
  /** Check if any filters are active */
  hasActiveFilters: boolean;
}

const DEFAULT_DATE_RANGE: DateRange = {
  startDate: null,
  endDate: null,
  period: 'All Time',
};

/**
 * Hook for managing data table filtering with field filters and date ranges.
 * 
 * Consolidates the common filtering pattern used across data table consumers.
 * Supports both field-based filters (exact match) and date range filters.
 * 
 * @example
 * ```tsx
 * const {
 *   filteredData,
 *   activeFilters,
 *   dateRange,
 *   setActiveFilters,
 *   setDateRange,
 * } = useDataTableFiltering({
 *   data: users,
 *   dateField: 'created_at',
 * });
 * 
 * // In JSX:
 * <FilterButton onFilterChange={setActiveFilters} />
 * <DateSelect onDateChange={setDateRange} />
 * <DataTable data={filteredData} ... />
 * ```
 */
export function useDataTableFiltering<T extends Record<string, unknown>>({
  data,
  dateField,
  initialFilters = [],
  initialDateRange = DEFAULT_DATE_RANGE,
}: UseDataTableFilteringOptions<T>): UseDataTableFilteringReturn<T> {
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>(initialFilters);
  const [dateRange, setDateRange] = useState<DateRange>(initialDateRange);

  const filteredData = useMemo(() => {
    if (!data) return [];

    return data.filter((item) => {
      // Apply field filters
      if (activeFilters.length > 0) {
        // Group filters by field for OR logic within fields, AND across fields
        const filtersByField = new Map<string, ActiveFilter[]>();
        for (const filter of activeFilters) {
          const existing = filtersByField.get(filter.field) ?? [];
          existing.push(filter);
          filtersByField.set(filter.field, existing);
        }

        // Check if item matches all field filters (AND between fields, OR within same field)
        const matchesFilters = Array.from(filtersByField.entries()).every(([field, filters]) => {
          return filters.some((filter) => {
            const itemValue = item[field];
            return itemValue === filter.comparator;
          });
        });

        if (!matchesFilters) {
          return false;
        }
      }

      // Apply date range filter
      if (dateField && (dateRange.startDate || dateRange.endDate)) {
        const dateValue = item[dateField as string];
        if (!dateValue) {
          return false;
        }

        const itemDate = new Date(dateValue as string | Date);
        if (Number.isNaN(itemDate.getTime())) {
          return false;
        }

        if (dateRange.startDate && itemDate < dateRange.startDate) {
          return false;
        }

        if (dateRange.endDate && itemDate > dateRange.endDate) {
          return false;
        }
      }

      return true;
    });
  }, [data, activeFilters, dateRange, dateField]);

  const clearAllFilters = useCallback(() => {
    setActiveFilters([]);
    setDateRange(DEFAULT_DATE_RANGE);
  }, []);

  const hasActiveFilters = activeFilters.length > 0 || 
    dateRange.startDate !== null || 
    dateRange.endDate !== null;

  return {
    filteredData,
    activeFilters,
    dateRange,
    setActiveFilters,
    setDateRange,
    clearAllFilters,
    hasActiveFilters,
  };
}

