/**
 * Work Items Services Barrel Exports
 *
 * Provides backward-compatible exports for work items services.
 * Main entry point should be createRBACWorkItemsService().
 *
 * Architecture:
 * - work-items-service.ts: Main composite (delegates to sub-services)
 * - core-service.ts: CRUD operations
 * - hierarchy-service.ts: Tree operations
 * - base-service.ts: Shared RBAC and helpers
 * - query-builder.ts: Reusable queries
 */

// Main service (backward compatible)
export { createRBACWorkItemsService, type WorkItemsServiceInterface } from './work-items-service';

// Sub-services (for advanced use cases)
export { createWorkItemCoreService } from './core-service';
export { createWorkItemHierarchyService } from './hierarchy-service';

// Query builder utility
export { getWorkItemQueryBuilder, getWorkItemSelectFields } from './query-builder';
export type { WorkItemQueryResult } from './query-builder';

// Re-export types from shared types file
export type {
  CreateWorkItemData,
  UpdateWorkItemData,
  WorkItemQueryOptions,
  WorkItemWithDetails,
} from '@/lib/types/work-items';

