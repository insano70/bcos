/**
 * Cache Services - Unified Exports
 *
 * Central export point for all cache services. Import cache services from here.
 *
 * USAGE:
 * ```typescript
 * import { authCache, rbacCache, analyticsCache } from '@/lib/cache';
 *
 * // Check if token is blacklisted
 * const isBlacklisted = await authCache.isTokenBlacklisted(jti);
 *
 * // Get user context
 * const context = await rbacCache.getUserContext(userId);
 *
 * // Get data source columns
 * const columns = await analyticsCache.getDataSourceColumns(1);
 * ```
 *
 * ARCHITECTURE:
 * - All cache services extend CacheService base class
 * - Consistent key naming: {namespace}:{identifier}[:{subresource}]
 * - Automatic fallback to database on cache miss
 * - Fire-and-forget cache updates
 * - Graceful degradation when Redis unavailable
 */

// Cache service instances
export { authCache } from './auth-cache';
export { rbacCache } from './rbac-cache';
export { analyticsCache } from './analytics-cache';
export { rateLimitCache } from './rate-limit-cache';
export { chartConfigCache } from './chart-config-cache';
export { dataSourceCache } from './data-source-cache';

// Base class (for extending with custom cache services)
export { CacheService } from './base';

// Utilities
export { buildChartRenderContext } from '@/lib/utils/chart-context';

// Types
export type {
  CacheOptions,
  CacheStats,
  CacheKey,
  InvalidateOptions,
} from './types';

// Re-export specific types from cache services
export type { CachedRolePermissions } from './rbac-cache';
export type {
  DataSourceColumn,
  Dashboard,
  ChartDefinition,
} from './analytics-cache';
export type { RateLimitResult } from './rate-limit-cache';
export type {
  CachedDataSourceConfig,
  CachedColumnConfig,
  CachedDisplayConfig,
  CachedColorPalette,
} from './chart-config-cache';
export type {
  CacheKeyComponents,
  CacheQueryParams,
} from './data-source-cache';
