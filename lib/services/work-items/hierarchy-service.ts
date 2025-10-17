// 1. Drizzle ORM
import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';

// 2. Database
import { work_items } from '@/lib/db/schema';

// 3. Logging
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

// 4. Errors
import { NotFoundError } from '@/lib/api/responses/error';

// 5. Types
import type { UserContext } from '@/lib/types/rbac';
import type { WorkItemWithDetails } from '@/lib/types/work-items';

// 6. Internal services and utilities
import { BaseWorkItemsService } from './base-service';
import { getWorkItemQueryBuilder } from './query-builder';

/**
 * Work Items Hierarchy Service
 *
 * Handles hierarchical operations for work items:
 * - getWorkItemChildren (direct children of a work item)
 * - getWorkItemAncestors (breadcrumb trail from root to work item)
 *
 * Extracted from monolithic rbac-work-items-service.ts (1,219 lines)
 * to separate hierarchy concerns from core CRUD operations.
 *
 * Uses helper methods from BaseWorkItemsService for:
 * - RBAC filtering
 * - Result mapping
 * - Permission checks
 *
 * @internal - Use factory function instead
 */
class WorkItemHierarchyService extends BaseWorkItemsService {
  /**
   * Get child work items for a parent
   *
   * Returns direct children only (not recursive descendants).
   * Verifies parent exists and user has access to it first.
   * Applies RBAC filtering to children.
   *
   * @param workItemId - Parent work item ID
   * @returns Array of child work items with full details
   * @throws NotFoundError if parent work item not found
   */
  async getWorkItemChildren(workItemId: string): Promise<WorkItemWithDetails[]> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canReadAll && !this.canReadOrg && !this.canReadOwn) {
        log.info('work item children list - no permission', {
          operation: 'list_work_item_children',
          parentWorkItemId: workItemId,
          userId: this.userContext.user_id,
          duration: Date.now() - startTime,
          component: 'hierarchy_service',
        });
        return [];
      }

      // Verify parent exists and user has access to it
      // We need to use core service for this, but since we're in a separate service,
      // we'll do a direct query with RBAC checks
      const [parent] = await getWorkItemQueryBuilder()
        .where(and(eq(work_items.work_item_id, workItemId), ...this.buildBaseRBACWhereConditions()))
        .limit(1);

      if (!parent) {
        throw NotFoundError('Parent work item not found');
      }

      // Build where conditions for children
      const whereConditions: SQL[] = [
        isNull(work_items.deleted_at),
        eq(work_items.parent_work_item_id, workItemId),
      ];

      // Apply RBAC filtering
      if (!this.canReadAll) {
        if (this.canReadOrg) {
          if (this.accessibleOrgIds.length > 0) {
            whereConditions.push(inArray(work_items.organization_id, this.accessibleOrgIds));
          } else {
            whereConditions.push(eq(work_items.work_item_id, 'impossible-id'));
          }
        } else if (this.canReadOwn) {
          whereConditions.push(eq(work_items.created_by, this.userContext.user_id));
        }
      }

      // Execute query
      const queryStart = Date.now();
      const results = await getWorkItemQueryBuilder()
        .where(and(...whereConditions))
        .orderBy(asc(work_items.created_at));
      const queryDuration = Date.now() - queryStart;

      // Map results to WorkItemWithDetails
      const children = results.map((result) => this.mapWorkItemResult(result));

      const duration = Date.now() - startTime;

      // Log using custom format
      log.info('work item children listed', {
        operation: 'list_work_item_children',
        parentWorkItemId: workItemId,
        userId: this.userContext.user_id,
        count: children.length,
        duration,
        component: 'hierarchy_service',
        metadata: {
          queryDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.getRBACScope(),
        },
      });

      return children;
    } catch (error) {
      log.error('work item children list failed', error, {
        operation: 'list_work_item_children',
        parentWorkItemId: workItemId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'hierarchy_service',
      });

      throw error;
    }
  }

  /**
   * Get ancestor work items (breadcrumb trail from root to this item)
   *
   * Extracts ancestor IDs from the work item's path field.
   * Returns ancestors ordered from root to immediate parent.
   * Applies RBAC filtering to ancestors.
   *
   * Path format: /root-id/parent-id/work-item-id
   *
   * @param workItemId - Work item ID to get ancestors for
   * @returns Array of ancestor work items ordered from root to parent
   * @throws NotFoundError if work item not found
   */
  async getWorkItemAncestors(workItemId: string): Promise<WorkItemWithDetails[]> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canReadAll && !this.canReadOrg && !this.canReadOwn) {
        log.info('work item ancestors list - no permission', {
          operation: 'list_work_item_ancestors',
          workItemId,
          userId: this.userContext.user_id,
          duration: Date.now() - startTime,
          component: 'hierarchy_service',
        });
        return [];
      }

      // Get the work item to extract its path
      const [workItem] = await getWorkItemQueryBuilder()
        .where(and(eq(work_items.work_item_id, workItemId), ...this.buildBaseRBACWhereConditions()))
        .limit(1);

      if (!workItem) {
        throw NotFoundError('Work item not found');
      }

      // If no path or no parent, return empty array
      if (!workItem.path || !workItem.parent_work_item_id) {
        log.info('work item ancestors listed - no ancestors', {
          operation: 'list_work_item_ancestors',
          workItemId,
          userId: this.userContext.user_id,
          count: 0,
          duration: Date.now() - startTime,
          component: 'hierarchy_service',
        });
        return [];
      }

      // Extract ancestor IDs from path (excluding the work item itself)
      // Path format: /root-id/parent-id/work-item-id
      const pathSegments = workItem.path.split('/').filter((id) => id && id !== workItemId);

      if (pathSegments.length === 0) {
        return [];
      }

      // Build where conditions for ancestors
      const whereConditions: SQL[] = [
        isNull(work_items.deleted_at),
        inArray(work_items.work_item_id, pathSegments),
      ];

      // Apply RBAC filtering
      if (!this.canReadAll) {
        if (this.canReadOrg) {
          if (this.accessibleOrgIds.length > 0) {
            whereConditions.push(inArray(work_items.organization_id, this.accessibleOrgIds));
          } else {
            whereConditions.push(eq(work_items.work_item_id, 'impossible-id'));
          }
        } else if (this.canReadOwn) {
          whereConditions.push(eq(work_items.created_by, this.userContext.user_id));
        }
      }

      // Execute query
      const queryStart = Date.now();
      const results = await getWorkItemQueryBuilder()
        .where(and(...whereConditions))
        .orderBy(asc(work_items.depth));
      const queryDuration = Date.now() - queryStart;

      // Map results to WorkItemWithDetails
      const ancestors = results.map((result) => this.mapWorkItemResult(result));

      const duration = Date.now() - startTime;

      // Log using custom format
      log.info('work item ancestors listed', {
        operation: 'list_work_item_ancestors',
        workItemId,
        userId: this.userContext.user_id,
        count: ancestors.length,
        duration,
        component: 'hierarchy_service',
        metadata: {
          queryDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.getRBACScope(),
          depth: workItem.depth,
        },
      });

      return ancestors;
    } catch (error) {
      log.error('work item ancestors list failed', error, {
        operation: 'list_work_item_ancestors',
        workItemId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'hierarchy_service',
      });

      throw error;
    }
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create Work Item Hierarchy Service
 *
 * Factory function to create a new work item hierarchy service instance
 * with automatic RBAC enforcement.
 *
 * Provides hierarchical operations:
 * - getWorkItemChildren: Get direct children of a work item
 * - getWorkItemAncestors: Get breadcrumb trail from root to work item
 *
 * @param userContext - User context with RBAC permissions
 * @returns Hierarchy service instance
 *
 * @example
 * ```typescript
 * const service = createWorkItemHierarchyService(userContext);
 *
 * // Get children
 * const children = await service.getWorkItemChildren('parent-uuid');
 *
 * // Get breadcrumb trail
 * const ancestors = await service.getWorkItemAncestors('work-item-uuid');
 * ```
 */
export function createWorkItemHierarchyService(
  userContext: UserContext
): WorkItemHierarchyService {
  return new WorkItemHierarchyService(userContext);
}

