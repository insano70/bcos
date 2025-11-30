/**
 * MeasureAccessor - Type-safe accessor for dynamic measure fields
 *
 * Relocated from lib/types/analytics.ts to separate runtime code from type definitions.
 *
 * Use this instead of direct property access to support multiple data sources
 * with different column names.
 *
 * @example
 * ```typescript
 * const mapping = await columnMappingService.getMapping(dataSourceId);
 * const accessor = new MeasureAccessor(row, mapping);
 *
 * // ✅ Dynamic access based on config
 * const date = accessor.getDate();
 * const value = accessor.getMeasureValue();
 *
 * // ❌ Don't do this (hardcoded)
 * const date = row.date_index;
 * const value = row.measure_value;
 * ```
 */

import type { AggAppMeasure, DataSourceColumnMapping } from '@/lib/types/analytics';

export class MeasureAccessor {
  constructor(
    private readonly row: AggAppMeasure,
    private readonly mapping: DataSourceColumnMapping
  ) {}

  /**
   * Get the date value from the row
   * Column name determined by mapping.dateField
   */
  getDate(): string {
    const value = this.row[this.mapping.dateField];
    if (typeof value !== 'string') {
      throw new Error(`Date field "${this.mapping.dateField}" is not a string`);
    }
    return value;
  }

  /**
   * Get the measure value from the row
   * Column name determined by mapping.measureField
   */
  getMeasureValue(): number {
    const value = this.row[this.mapping.measureField];
    if (typeof value === 'string') {
      return parseFloat(value);
    }
    if (typeof value !== 'number') {
      throw new Error(`Measure field "${this.mapping.measureField}" is not a number`);
    }
    return value;
  }

  /**
   * Get the measure type from the row (e.g., "currency", "count", "percentage")
   * Column name determined by mapping.measureTypeField
   */
  getMeasureType(): string {
    const value = this.row[this.mapping.measureTypeField];
    if (typeof value !== 'string') {
      return 'number'; // Default fallback
    }
    return value;
  }

  /**
   * Get the time period/frequency from the row (e.g., "Monthly", "Weekly")
   * Column name determined by mapping.timePeriodField
   */
  getTimePeriod(): string | undefined {
    const value = this.row[this.mapping.timePeriodField];
    return typeof value === 'string' ? value : undefined;
  }

  /**
   * Get the practice UID from the row
   * Column name determined by mapping.practiceField or defaults to "practice_uid"
   */
  getPracticeUid(): number | undefined {
    const fieldName = this.mapping.practiceField || 'practice_uid';
    const value = this.row[fieldName];
    if (typeof value === 'string') {
      return parseInt(value, 10);
    }
    return typeof value === 'number' ? value : undefined;
  }

  /**
   * Get the provider UID from the row
   * Column name determined by mapping.providerField or defaults to "provider_uid"
   */
  getProviderUid(): number | undefined {
    const fieldName = this.mapping.providerField || 'provider_uid';
    const value = this.row[fieldName];
    if (typeof value === 'string') {
      return parseInt(value, 10);
    }
    return typeof value === 'number' ? value : undefined;
  }

  /**
   * Generic accessor for any field in the row
   * Use this for grouping fields or other dynamic columns
   */
  get(fieldName: string): string | number | boolean | null | undefined {
    return this.row[fieldName];
  }

  /**
   * Get the underlying row data
   * Use sparingly - prefer typed accessors above
   */
  getRaw(): AggAppMeasure {
    return this.row;
  }
}

