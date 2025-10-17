// 1. Types
import type { UserContext } from '@/lib/types/rbac';
import type {
  CreateWorkItemData,
  UpdateWorkItemData,
  WorkItemQueryOptions,
  WorkItemWithDetails,
} from '@/lib/types/work-items';

// 2. Internal services
import { createWorkItemCoreService } from './core-service';
import { createWorkItemHierarchyService } from './hierarchy-service';

/**
 * Work Items Service Interface
 *
 * Complete interface for work items operations:
 * - CRUD: create, read, update, delete
 * - Hierarchy: children, ancestors
 *
 * Maintains backward compatibility with original monolithic service.
 */
export interface WorkItemsServiceInterface {
  // Core CRUD operations
  getWorkItemById(workItemId: string): Promise<WorkItemWithDetails | null>;
  getWorkItemCount(options?: WorkItemQueryOptions): Promise<number>;
  getWorkItems(options?: WorkItemQueryOptions): Promise<WorkItemWithDetails[]>;
  createWorkItem(workItemData: CreateWorkItemData): Promise<WorkItemWithDetails>;
  updateWorkItem(workItemId: string, updateData: UpdateWorkItemData): Promise<WorkItemWithDetails>;
  deleteWorkItem(workItemId: string): Promise<void>;

  // Hierarchy operations
  getWorkItemChildren(workItemId: string): Promise<WorkItemWithDetails[]>;
  getWorkItemAncestors(workItemId: string): Promise<WorkItemWithDetails[]>;
}

/**
 * Work Items Service (Composite)
 *
 * Main service that delegates to specialized sub-services.
 * Maintains backward compatibility while providing cleaner architecture.
 *
 * Replaces monolithic rbac-work-items-service.ts (1,219 lines) by
 * delegating to specialized services:
 * - core-service.ts: CRUD operations (~700 lines)
 * - hierarchy-service.ts: Tree operations (~200 lines)
 *
 * Benefits:
 * - Better separation of concerns
 * - Zero permission checking duplication
 * - Single Responsibility Principle
 * - Maintains same public interface (backward compatible)
 *
 * @internal - Use factory function instead
 */
class WorkItemsService implements WorkItemsServiceInterface {
  private coreService: ReturnType<typeof createWorkItemCoreService>;
  private hierarchyService: ReturnType<typeof createWorkItemHierarchyService>;

  constructor(userContext: UserContext) {
    this.coreService = createWorkItemCoreService(userContext);
    this.hierarchyService = createWorkItemHierarchyService(userContext);
  }

  // ============================================================
  // CORE CRUD - Delegate to core-service
  // ============================================================

  async getWorkItemById(workItemId: string): Promise<WorkItemWithDetails | null> {
    return this.coreService.getWorkItemById(workItemId);
  }

  async getWorkItemCount(options?: WorkItemQueryOptions): Promise<number> {
    return this.coreService.getWorkItemCount(options);
  }

  async getWorkItems(options?: WorkItemQueryOptions): Promise<WorkItemWithDetails[]> {
    return this.coreService.getWorkItems(options);
  }

  async createWorkItem(workItemData: CreateWorkItemData): Promise<WorkItemWithDetails> {
    return this.coreService.createWorkItem(workItemData);
  }

  async updateWorkItem(
    workItemId: string,
    updateData: UpdateWorkItemData
  ): Promise<WorkItemWithDetails> {
    return this.coreService.updateWorkItem(workItemId, updateData);
  }

  async deleteWorkItem(workItemId: string): Promise<void> {
    return this.coreService.deleteWorkItem(workItemId);
  }

  // ============================================================
  // HIERARCHY - Delegate to hierarchy-service
  // ============================================================

  async getWorkItemChildren(workItemId: string): Promise<WorkItemWithDetails[]> {
    return this.hierarchyService.getWorkItemChildren(workItemId);
  }

  async getWorkItemAncestors(workItemId: string): Promise<WorkItemWithDetails[]> {
    return this.hierarchyService.getWorkItemAncestors(workItemId);
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create RBAC Work Items Service
 *
 * Factory function to create a new work items service instance
 * with automatic RBAC enforcement.
 *
 * This facade maintains backward compatibility with the original
 * monolithic service while delegating to specialized sub-services.
 *
 * @param userContext - User context with RBAC permissions
 * @returns Service interface
 *
 * @example
 * ```typescript
 * const service = createRBACWorkItemsService(userContext);
 *
 * // Get single work item
 * const workItem = await service.getWorkItemById('work-item-uuid');
 *
 * // List work items
 * const items = await service.getWorkItems({ status_id: 'in-progress' });
 *
 * // Create work item
 * const newItem = await service.createWorkItem({
 *   work_item_type_id: 'type-uuid',
 *   organization_id: 'org-uuid',
 *   subject: 'New task',
 *   priority: 'high'
 * });
 *
 * // Get hierarchy
 * const children = await service.getWorkItemChildren('parent-uuid');
 * const ancestors = await service.getWorkItemAncestors('work-item-uuid');
 * ```
 *
 * **Permissions Required**:
 * - Read: work-items:read:all OR work-items:read:organization OR work-items:read:own
 * - Manage: work-items:manage:all OR work-items:manage:organization OR work-items:manage:own
 *
 * **RBAC Scopes**:
 * - `all`: Super admins can see/manage all work items
 * - `organization`: Users can see/manage work items in their organizations
 * - `own`: Users can only see/manage work items they created
 */
export function createRBACWorkItemsService(
  userContext: UserContext
): WorkItemsServiceInterface {
  return new WorkItemsService(userContext);
}

