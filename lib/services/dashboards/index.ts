/**
 * Dashboards Services Barrel Exports
 *
 * Provides backward-compatible exports for dashboard services.
 * Main entry point should be createRBACDashboardsService().
 *
 * Architecture:
 * - dashboards-service.ts: Main composite (delegates to sub-services)
 * - core-service.ts: CRUD operations
 * - chart-associations.ts: Chart linking logic
 * - default-handler.ts: Default dashboard handling
 * - base-service.ts: Shared RBAC and helpers
 * - mappers.ts: Result transformation utilities
 * - query-builder.ts: Reusable queries
 */

// Re-export types from shared types file
export type {
  CreateDashboardData,
  DashboardQueryOptions,
  DashboardWithCharts,
  UpdateDashboardData,
} from '@/lib/types/dashboards';
export { createDashboardChartAssociationsService } from './chart-associations';
// Sub-services (for advanced use cases)
export { createDashboardCoreService } from './core-service';
// Main service (backward compatible)
export {
  createRBACDashboardsService,
  type DashboardsServiceInterface,
} from './dashboards-service';
export { createDashboardDefaultHandlerService } from './default-handler';
// Mappers
export { type ChartDetail, mapDashboardList, mapDashboardResult } from './mappers';
export type { DashboardQueryResult } from './query-builder';
// Query builder utility
export {
  getDashboardChartDetails,
  getDashboardQueryBuilder,
  getDashboardSelectFields,
} from './query-builder';
