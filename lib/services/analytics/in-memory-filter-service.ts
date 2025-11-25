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

    // If no date field exists (table-based sources), skip date filtering
    if (!dateField) {
      log.debug('No date field found, skipping date range filter', {
        component: 'in-memory-filter-service',
        dataSourceId,
      });
      return rows;
    }

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
    const inputRowCount = rows.length;

    const filtered = rows.filter((row) => {
      // All filters must pass (AND logic)
      for (const filter of filters) {
        if (!this.applyFilter(row, filter)) {
          return false;
        }
      }

      // All filters passed
      return true;
    });

    const outputRowCount = filtered.length;

    if (inputRowCount > 0 && outputRowCount === 0) {
      log.debug('Advanced filters eliminated ALL rows', {
        inputRows: inputRowCount,
        outputRows: outputRowCount,
        filterCount: filters.length,
        filters: filters.map((f) => ({
          field: f.field,
          operator: f.operator,
          value: f.value,
        })),
        sampleInputRow: rows[0],
        component: 'in-memory-filter-service',
      });
    } else if (filters.length > 0) {
      log.debug('Advanced filters applied', {
        inputRows: inputRowCount,
        outputRows: outputRowCount,
        filterCount: filters.length,
        percentageRemaining: inputRowCount > 0 ? Math.round((outputRowCount / inputRowCount) * 100) : 0,
        component: 'in-memory-filter-service',
      });
    }

    return filtered;
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
