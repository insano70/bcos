/**
 * Shared Types and Constants for Analytics Query Services
 *
 * Central location for all type definitions and constants used across
 * query validation, sanitization, building, and execution modules.
 */

import type { ChartFilter, ChartRenderContext } from '@/lib/types/analytics';
import type { DataSourceConfig } from '@/lib/services/chart-config-service';

/**
 * Allowed operators for filters - prevents injection attacks
 * Whitelist approach for security
 */
export const ALLOWED_OPERATORS = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  in: 'IN',
  not_in: 'NOT IN',
  like: 'ILIKE',
  between: 'BETWEEN',
} as const;

/**
 * Column mappings for dynamic column access
 * Maps logical fields to actual database column names
 */
export interface ColumnMappings {
  dateField: string;
  timePeriodField: string;
  measureValueField: string;
  measureTypeField: string;
  allColumns: string[];
}

/**
 * Configuration for building queries
 */
export interface QueryBuilderConfig {
  tableName: string;
  schemaName: string;
  columnMappings: ColumnMappings;
  filters: ChartFilter[];
  context: ChartRenderContext;
  limit?: number;
  offset?: number;
  dataSourceConfig?: DataSourceConfig | null;
}

/**
 * Result from WHERE clause building
 */
export interface WhereClauseResult {
  clause: string;
  params: unknown[];
}

/**
 * Result from advanced filter clause building
 */
export interface AdvancedFilterClauseResult {
  clause: string;
  params: unknown[];
  nextIndex: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Type guard for operator validation
 */
export function isAllowedOperator(operator: string): operator is keyof typeof ALLOWED_OPERATORS {
  return operator in ALLOWED_OPERATORS;
}
