/**
 * Type Guard Utilities
 *
 * Runtime type checking functions that provide type-safe narrowing
 * without relying on type assertions.
 *
 * These guards validate values at runtime and inform TypeScript's
 * type system about the validated types.
 */

import type { FrequencyType, MeasureType } from '@/lib/types/analytics';

/**
 * Valid measure types from the analytics system
 */
const MEASURE_TYPES: readonly MeasureType[] = [
  'Charges by Provider',
  'Payments by Provider',
] as const;

/**
 * Valid frequency types for time-series data
 */
const FREQUENCY_TYPES: readonly FrequencyType[] = ['Monthly', 'Weekly', 'Quarterly'] as const;

/**
 * Valid filter operators for chart filters
 */
const FILTER_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'not_in',
  'like',
  'between',
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/**
 * Type guard for MeasureType
 *
 * @param value - Value to check
 * @returns True if value is a valid MeasureType
 *
 * @example
 * const measure = searchParams.get('measure');
 * if (isMeasureType(measure)) {
 *   // measure is now typed as MeasureType
 *   fetchData({ measure });
 * }
 */
export function isMeasureType(value: unknown): value is MeasureType {
  return typeof value === 'string' && MEASURE_TYPES.includes(value as MeasureType);
}

/**
 * Type guard for FrequencyType
 *
 * @param value - Value to check
 * @returns True if value is a valid FrequencyType
 *
 * @example
 * const frequency = formData.get('frequency');
 * if (isFrequencyType(frequency)) {
 *   // frequency is now typed as FrequencyType
 *   updateChart({ frequency });
 * }
 */
export function isFrequencyType(value: unknown): value is FrequencyType {
  return typeof value === 'string' && FREQUENCY_TYPES.includes(value as FrequencyType);
}

/**
 * Type guard for FilterOperator
 *
 * @param value - Value to check
 * @returns True if value is a valid FilterOperator
 *
 * @example
 * const operator = e.target.value;
 * if (isFilterOperator(operator)) {
 *   // operator is now typed as FilterOperator
 *   updateFilter({ operator });
 * }
 */
export function isFilterOperator(value: unknown): value is FilterOperator {
  return typeof value === 'string' && FILTER_OPERATORS.includes(value as FilterOperator);
}

/**
 * Asserts that a value is a MeasureType or throws an error
 *
 * @param value - Value to assert
 * @param context - Optional context for error message
 * @returns The value as MeasureType
 * @throws Error if value is not a valid MeasureType
 *
 * @example
 * const measure = assertMeasureType(
 *   searchParams.get('measure'),
 *   'URL query parameter'
 * );
 */
export function assertMeasureType(value: unknown, context?: string): MeasureType {
  if (!isMeasureType(value)) {
    const ctx = context ? ` in ${context}` : '';
    throw new Error(
      `Invalid measure type${ctx}: "${value}". Expected one of: ${MEASURE_TYPES.join(', ')}`
    );
  }
  return value;
}

/**
 * Asserts that a value is a FrequencyType or throws an error
 *
 * @param value - Value to assert
 * @param context - Optional context for error message
 * @returns The value as FrequencyType
 * @throws Error if value is not a valid FrequencyType
 *
 * @example
 * const frequency = assertFrequencyType(
 *   formData.get('frequency'),
 *   'form input'
 * );
 */
export function assertFrequencyType(value: unknown, context?: string): FrequencyType {
  if (!isFrequencyType(value)) {
    const ctx = context ? ` in ${context}` : '';
    throw new Error(
      `Invalid frequency type${ctx}: "${value}". Expected one of: ${FREQUENCY_TYPES.join(', ')}`
    );
  }
  return value;
}

/**
 * Asserts that a value is a FilterOperator or throws an error
 *
 * @param value - Value to assert
 * @param context - Optional context for error message
 * @returns The value as FilterOperator
 * @throws Error if value is not a valid FilterOperator
 *
 * @example
 * const operator = assertFilterOperator(
 *   e.target.value,
 *   'filter dropdown'
 * );
 */
export function assertFilterOperator(value: unknown, context?: string): FilterOperator {
  if (!isFilterOperator(value)) {
    const ctx = context ? ` in ${context}` : '';
    throw new Error(
      `Invalid filter operator${ctx}: "${value}". Expected one of: ${FILTER_OPERATORS.join(', ')}`
    );
  }
  return value;
}

/**
 * Safely converts a value to MeasureType with a fallback
 *
 * @param value - Value to convert
 * @param fallback - Fallback value if conversion fails
 * @returns MeasureType value or fallback
 *
 * @example
 * const measure = toMeasureType(
 *   searchParams.get('measure'),
 *   'Charges by Provider'
 * );
 */
export function toMeasureType(value: unknown, fallback: MeasureType): MeasureType {
  return isMeasureType(value) ? value : fallback;
}

/**
 * Safely converts a value to FrequencyType with a fallback
 *
 * @param value - Value to convert
 * @param fallback - Fallback value if conversion fails
 * @returns FrequencyType value or fallback
 *
 * @example
 * const frequency = toFrequencyType(
 *   formData.get('frequency'),
 *   'Monthly'
 * );
 */
export function toFrequencyType(value: unknown, fallback: FrequencyType): FrequencyType {
  return isFrequencyType(value) ? value : fallback;
}

/**
 * Safely converts a value to FilterOperator with a fallback
 *
 * @param value - Value to convert
 * @param fallback - Fallback value if conversion fails
 * @returns FilterOperator value or fallback
 *
 * @example
 * const operator = toFilterOperator(
 *   e.target.value,
 *   'eq'
 * );
 */
export function toFilterOperator(value: unknown, fallback: FilterOperator): FilterOperator {
  return isFilterOperator(value) ? value : fallback;
}

/**
 * Gets all valid measure types
 *
 * @returns Readonly array of all MeasureType values
 */
export function getMeasureTypes(): readonly MeasureType[] {
  return MEASURE_TYPES;
}

/**
 * Gets all valid frequency types
 *
 * @returns Readonly array of all FrequencyType values
 */
export function getFrequencyTypes(): readonly FrequencyType[] {
  return FREQUENCY_TYPES;
}

/**
 * Gets all valid filter operators
 *
 * @returns Readonly array of all FilterOperator values
 */
export function getFilterOperators(): readonly FilterOperator[] {
  return FILTER_OPERATORS;
}

/**
 * Type guard to check if an object has a measureType property
 *
 * @param value - Value to check
 * @returns True if value is an object with measureType string property
 *
 * @example
 * if (hasMeasureType(chartData)) {
 *   const measureType = chartData.measureType;
 * }
 */
export function hasMeasureType(value: unknown): value is { measureType: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'measureType' in value &&
    typeof (value as Record<string, unknown>).measureType === 'string'
  );
}

/**
 * Safely extracts measureType from Chart.js data or dataset objects
 *
 * Chart.js types don't include our custom measureType property, so we need
 * runtime checking to safely access it.
 *
 * @param value - Chart data, dataset, or any object that might have measureType
 * @param fallback - Fallback value if measureType not found (default: 'number')
 * @returns The measureType string or fallback
 *
 * @example
 * // In Chart.js tooltip callback
 * const measureType = getMeasureTypeFromChart(context.dataset, 'number');
 * const formatted = formatValue(value, measureType);
 *
 * @example
 * // From chart data object
 * const measureType = getMeasureTypeFromChart(chartData, 'currency');
 */
export function getMeasureTypeFromChart(value: unknown, fallback: string = 'number'): string {
  if (hasMeasureType(value)) {
    return value.measureType;
  }
  return fallback;
}

/**
 * Type guard to check if a value is an array
 *
 * @param value - The value to check
 * @returns True if value is an array, false otherwise
 *
 * @example
 * ```typescript
 * const filterValue: unknown = jsonData.filters;
 * if (isUnknownArray(filterValue)) {
 *   // TypeScript now knows filterValue is unknown[]
 *   return filterValue.includes(searchValue);
 * }
 * ```
 */
export function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Assertion function that throws if value is not an array
 *
 * @param value - The value to check
 * @param context - Context string for error message
 * @throws TypeError if value is not an array
 *
 * @example
 * ```typescript
 * assertArray(filterValue, 'filter processing');
 * // If we reach here, TypeScript knows filterValue is unknown[]
 * ```
 */
export function assertArray(value: unknown, context: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected array in ${context}, got ${typeof value}`);
  }
}

/**
 * Type guard to check if a value is a string array
 *
 * @param value - The value to check
 * @returns True if value is a string array, false otherwise
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Type guard to check if a value is a number array
 *
 * @param value - The value to check
 * @returns True if value is a number array, false otherwise
 */
export function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number');
}

/**
 * Type guard to check if a value is a non-null object
 *
 * @param value - The value to check
 * @returns True if value is an object (and not null), false otherwise
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if a value is a string
 *
 * @param value - The value to check
 * @returns True if value is a string, false otherwise
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard to check if a value is a number
 *
 * @param value - The value to check
 * @returns True if value is a number, false otherwise
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Type guard to check if a value is a boolean
 *
 * @param value - The value to check
 * @returns True if value is a boolean, false otherwise
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}
