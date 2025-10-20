/**
 * In-Memory Filter Service
 *
 * Provides in-memory filtering for analytics data rows.
 * Used when serving from cache (where SQL filters cannot be applied).
 *
 * RESPONSIBILITIES:
 * - Date range filtering (startDate/endDate)
 * - Advanced filter application (dashboard universal filters)
 * - All filter operators: eq, neq, gt, gte, lt, lte, in, not_in, like
 *
 * ARCHITECTURE:
 * - Stateless service (no dependencies on RBAC or cache)
 * - Pure functions for easy testing
 * - Dynamic column name resolution
 */

import { log } from '@/lib/logger';
import type { ChartFilter } from '@/lib/types/analytics';
import { columnMappingService } from '@/lib/services/column-mapping-service';

/**
 * In-Memory Filter Service
 * Applies filters to data rows after fetching from cache or database
 */
export class InMemoryFilterService {
  /**
   * Apply date range filter to data rows
   * Uses dynamic column name from data source configuration
   *
   * @param rows - Data rows to filter
   * @param dataSourceId - Data source ID for column mapping
   * @param startDate - Start date (inclusive, ISO format)
   * @param endDate - End date (inclusive, ISO format)
   * @returns Filtered rows
   */
  async applyDateRangeFilter(
    rows: Record<string, unknown>[],
    dataSourceId: number,
    startDate?: string,
    endDate?: string
  ): Promise<Record<string, unknown>[]> {
    if (!startDate && !endDate) {
      return rows;
    }

    // Get column mapping for dynamic date field access
    const mapping = await columnMappingService.getMapping(dataSourceId);
    const dateField = mapping.dateField;

    return rows.filter((row) => {
      const dateValue = row[dateField] as string;

      if (!dateValue) {
        return false; // Filter out rows without date value
      }

      if (startDate && dateValue < startDate) {
        return false;
      }

      if (endDate && dateValue > endDate) {
        return false;
      }

      return true;
    });
  }

  /**
   * Apply advanced filters in-memory
   * Used when serving from cache (where SQL filters cannot be applied)
   *
   * @param rows - Data rows to filter
   * @param filters - Advanced filter definitions
   * @returns Filtered rows
   */
  applyAdvancedFilters(
    rows: Record<string, unknown>[],
    filters: ChartFilter[]
  ): Record<string, unknown>[] {
    return rows.filter((row) => {
      // All filters must pass (AND logic)
      for (const filter of filters) {
        if (!this.applyFilter(row, filter)) {
          return false;
        }
      }

      // All filters passed
      return true;
    });
  }

  /**
   * Apply single filter to a row
   *
   * @param row - Data row
   * @param filter - Filter definition
   * @returns True if row passes filter, false otherwise
   */
  private applyFilter(row: Record<string, unknown>, filter: ChartFilter): boolean {
    const fieldValue = row[filter.field];
    let filterValue = filter.value;
    const operator = filter.operator || 'eq';

    // Type coercion: Convert string numbers to actual numbers for comparison
    // This handles cases where UI sends "114" but database has 114
    if (typeof fieldValue === 'number' && typeof filterValue === 'string') {
      const numValue = Number(filterValue);
      if (!Number.isNaN(numValue)) {
        filterValue = numValue;
      }
    }

    switch (operator) {
      case 'eq':
        return fieldValue === filterValue;

      case 'neq':
        return fieldValue !== filterValue;

      case 'gt':
        return (
          typeof fieldValue === 'number' &&
          typeof filterValue === 'number' &&
          fieldValue > filterValue
        );

      case 'gte':
        return (
          typeof fieldValue === 'number' &&
          typeof filterValue === 'number' &&
          fieldValue >= filterValue
        );

      case 'lt':
        return (
          typeof fieldValue === 'number' &&
          typeof filterValue === 'number' &&
          fieldValue < filterValue
        );

      case 'lte':
        return (
          typeof fieldValue === 'number' &&
          typeof filterValue === 'number' &&
          fieldValue <= filterValue
        );

      case 'in':
        if (!Array.isArray(filterValue)) return false;
        // Type coercion for array values: convert string numbers to numbers if fieldValue is number
        if (typeof fieldValue === 'number') {
          const coercedArray = (filterValue as unknown[]).map(v => {
            if (typeof v === 'string') {
              const numValue = Number(v);
              return Number.isNaN(numValue) ? v : numValue;
            }
            return v;
          });
          return coercedArray.includes(fieldValue);
        }
        return (filterValue as unknown[]).includes(fieldValue);

      case 'not_in':
        if (!Array.isArray(filterValue)) return true; // If not array, pass
        // Type coercion for array values: convert string numbers to numbers if fieldValue is number
        if (typeof fieldValue === 'number') {
          const coercedArray = (filterValue as unknown[]).map(v => {
            if (typeof v === 'string') {
              const numValue = Number(v);
              return Number.isNaN(numValue) ? v : numValue;
            }
            return v;
          });
          return !coercedArray.includes(fieldValue);
        }
        return !(filterValue as unknown[]).includes(fieldValue);

      case 'like':
        if (typeof fieldValue !== 'string' || typeof filterValue !== 'string') {
          return false;
        }
        return fieldValue.toLowerCase().includes(filterValue.toLowerCase());

      default:
        log.warn('Unsupported in-memory filter operator', {
          operator,
          field: filter.field,
        });
        return false;
    }
  }
}

// Export singleton instance
export const inMemoryFilterService = new InMemoryFilterService();
