/**
 * Analytics Query Service
 *
 * Modular analytics query system with cache integration and security-first design.
 *
 * UNIFIED CACHE ARCHITECTURE:
 * - All queries use Redis cache with in-memory RBAC filtering
 * - Supports nocache flag for previews (bypasses cache but uses same path)
 * - All charts must have data_source_id
 *
 * MODULES:
 * - QueryOrchestrator: Main entry point, handles all queries via cache path
 * - QueryValidator: Security validation (table/field/operator validation)
 * - QuerySanitizer: Value sanitization (SQL injection prevention)
 * - QueryBuilder: SQL query construction (WHERE clause building)
 * - query-types: Shared types and constants
 *
 * USAGE:
 * ```typescript
 * import { analyticsQueryBuilder } from '@/lib/services/analytics';
 *
 * // Standard query (uses cache)
 * const result = await analyticsQueryBuilder.queryMeasures(params, userContext);
 *
 * // Preview query (nocache=true)
 * const result = await analyticsQueryBuilder.queryMeasures({ ...params, nocache: true }, userContext);
 * ```
 *
 * BACKWARD COMPATIBILITY:
 * - Exports `analyticsQueryBuilder` singleton for existing code
 * - Preserves queryMeasures() API signature
 * - NOW REQUIRES UserContext (ChartRenderContext no longer supported)
 */

// ===== Module Exports =====

export { QueryBuilder } from './query-builder';
export { QueryOrchestrator } from './query-orchestrator';
export { QuerySanitizer } from './query-sanitizer';
export { QueryValidator } from './query-validator';

// ===== Type Exports =====

export type { ColumnMappings, QueryBuilderConfig } from './query-types';
export { ALLOWED_OPERATORS } from './query-types';

// ===== Singleton Exports (for backward compatibility) =====

import { queryBuilder } from './query-builder';
import { queryOrchestrator } from './query-orchestrator';
import { querySanitizer } from './query-sanitizer';
import { queryValidator } from './query-validator';

// Export individual singletons
export { queryValidator, querySanitizer, queryBuilder, queryOrchestrator };

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
