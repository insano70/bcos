/**
 * Analytics Query Service
 *
 * Modular analytics query system with cache integration and security-first design.
 *
 * DUAL-PATH ARCHITECTURE:
 * - Cache Path: UserContext + data_source_id → Redis cache with in-memory RBAC
 * - Legacy Path: ChartRenderContext OR missing data_source_id → Direct SQL with RBAC in WHERE
 *
 * MODULES:
 * - QueryOrchestrator: Main entry point, routes between cache and legacy paths
 * - QueryExecutor: Legacy path execution (direct database queries)
 * - QueryValidator: Security validation (table/field/operator validation)
 * - QuerySanitizer: Value sanitization (SQL injection prevention)
 * - QueryBuilder: SQL query construction (WHERE clause building)
 * - query-types: Shared types and constants
 *
 * USAGE:
 * ```typescript
 * import { analyticsQueryBuilder } from '@/lib/services/analytics';
 *
 * // Query with cache (UserContext + data_source_id)
 * const result = await analyticsQueryBuilder.queryMeasures(params, userContext);
 *
 * // Query without cache (ChartRenderContext)
 * const result = await analyticsQueryBuilder.queryMeasures(params, chartContext);
 * ```
 *
 * BACKWARD COMPATIBILITY:
 * - Exports `analyticsQueryBuilder` singleton for existing code
 * - Preserves queryMeasures() API signature
 * - Works with both UserContext and ChartRenderContext
 */

// ===== Module Exports =====

export { QueryOrchestrator } from './query-orchestrator';
export { QueryExecutor } from './query-executor';
export { QueryValidator } from './query-validator';
export { QuerySanitizer } from './query-sanitizer';
export { QueryBuilder } from './query-builder';

// ===== Type Exports =====

export type { ColumnMappings, QueryBuilderConfig } from './query-types';
export { ALLOWED_OPERATORS } from './query-types';

// ===== Singleton Exports (for backward compatibility) =====

import { queryValidator } from './query-validator';
import { querySanitizer } from './query-sanitizer';
import { queryBuilder } from './query-builder';
import { queryExecutor } from './query-executor';
import { queryOrchestrator } from './query-orchestrator';

// Export individual singletons
export { queryValidator, querySanitizer, queryBuilder, queryExecutor, queryOrchestrator };

/**
 * Main analytics query builder singleton
 * Preserves existing API for backward compatibility
 *
 * USAGE:
 * ```typescript
 * import { analyticsQueryBuilder } from '@/lib/services/analytics';
 *
 * const result = await analyticsQueryBuilder.queryMeasures(params, context);
 * ```
 */
export const analyticsQueryBuilder = queryOrchestrator;

/**
 * Type alias for the main query builder
 * Allows for type checking in existing code
 */
export type AnalyticsQueryBuilder = typeof queryOrchestrator;
