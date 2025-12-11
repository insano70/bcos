/**
 * Dashboard Rendering Service - Public API
 *
 * Barrel exports and factory function for the dashboard rendering service.
 *
 * Usage:
 * ```typescript
 * import { createDashboardRenderingService } from '@/lib/services/dashboard-rendering';
 *
 * const service = createDashboardRenderingService(userContext);
 * const result = await service.renderDashboard(dashboardId, filters);
 * ```
 */

import type { UserContext } from '@/lib/types/rbac';
import { DashboardRenderingService } from './dashboard-rendering-service';

// Export main service
export { DashboardRenderingService } from './dashboard-rendering-service';

// Export types
export type {
  DashboardUniversalFilters,
  ChartRenderResult,
  DashboardRenderResponse,
  ResolvedFilters,
  ChartExecutionConfig,
  ExecutionResult,
  DashboardWithCharts,
  ChartDefinition,
} from './types';

// Export specialized services (for testing/advanced usage)
export { DashboardLoaderService } from './dashboard-loader';
export { FilterService } from './filter-service';
export { ChartConfigBuilderService } from './chart-config-builder';
export { BatchExecutorService } from './batch-executor';

// Export chart config services (for testing/advanced usage)
export { chartExecutionConfigCache } from './chart-config-cache';
export { ChartConfigValidator } from './chart-config-validator';
export { ChartFilterBuilder } from './chart-filter-builder';
export { ChartConfigNormalizer } from './chart-config-normalizer';

// Export mappers (for testing)
export {
  mapDashboardRenderResponse,
  buildEmptyDashboardResponse,
  getAppliedFilterNames,
} from './mappers';

/**
 * Factory function to create dashboard rendering service
 *
 * @param userContext - User context for RBAC
 * @returns Dashboard rendering service instance
 */
export function createDashboardRenderingService(
  userContext: UserContext
): DashboardRenderingService {
  return new DashboardRenderingService(userContext);
}
