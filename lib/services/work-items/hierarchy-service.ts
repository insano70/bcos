// 1. Drizzle ORM
import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';

// 2. Database
import { db } from '@/lib/db';
import { work_items } from '@/lib/db/schema';

// 3. Logging
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

// 4. Errors
import { NotFoundError, ValidationError } from '@/lib/api/responses/error';

// 5. Types
import type { UserContext } from '@/lib/types/rbac';
import type { WorkItemWithDetails } from '@/lib/types/work-items';

// 6. Internal services and utilities
import { BaseWorkItemsService } from './base-service';
import { WORK_ITEM_CONSTRAINTS } from './constants';
import { createWorkItemCustomFieldsService } from './custom-fields-service';
import { getWorkItemQueryBuilder } from './query-builder';

/**
 * Hierarchy calculation result
 */
export interface HierarchyFields {
  depth: number;
  rootId: string | null;
  parentPath: string | null;
}

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

      // Fetch custom field values for all child work items using dedicated service
      const workItemIds = results.map((r) => r.work_item_id);
      const customFieldsStart = Date.now();
      const customFieldsService = createWorkItemCustomFieldsService(this.userContext);
      const customFieldsMap = await customFieldsService.getCustomFieldValues(workItemIds);
      const customFieldsDuration = Date.now() - customFieldsStart;

      // Map results to WorkItemWithDetails with custom fields
      const children = results.map((result) =>
        this.mapWorkItemResult(result, customFieldsMap.get(result.work_item_id))
      );

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
          customFieldsDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowCustomFields: customFieldsDuration > SLOW_THRESHOLDS.DB_QUERY,
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

      // Fetch custom field values for all ancestor work items using dedicated service
      const workItemIds = results.map((r) => r.work_item_id);
      const customFieldsStart = Date.now();
      const customFieldsService = createWorkItemCustomFieldsService(this.userContext);
      const customFieldsMap = await customFieldsService.getCustomFieldValues(workItemIds);
      const customFieldsDuration = Date.now() - customFieldsStart;

      // Map results to WorkItemWithDetails with custom fields
      const ancestors = results.map((result) =>
        this.mapWorkItemResult(result, customFieldsMap.get(result.work_item_id))
      );

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
          customFieldsDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowCustomFields: customFieldsDuration > SLOW_THRESHOLDS.DB_QUERY,
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
// HIERARCHY CALCULATION HELPERS
// ============================================================

/**
 * Calculate hierarchy fields for a new work item
 *
 * Determines depth, root work item ID, and parent path for a work item
 * based on its parent. Used during work item creation.
 *
 * Validates:
 * - Parent exists
 * - Maximum depth not exceeded (10 levels)
 *
 * @param parentWorkItemId - Parent work item ID (null for root-level items)
 * @returns Hierarchy fields for new work item
 * @throws NotFoundError if parent work item not found
 * @throws ValidationError if maximum nesting depth exceeded
 */
export async function calculateHierarchyFields(
  parentWorkItemId: string | null
): Promise<HierarchyFields> {
  // Root-level work item (no parent)
  if (!parentWorkItemId) {
    return { depth: 0, rootId: null, parentPath: null };
  }

  const hierarchyStart = Date.now();
  const [parentInfo] = await db
    .select({
      depth: work_items.depth,
      root_work_item_id: work_items.root_work_item_id,
      path: work_items.path,
    })
    .from(work_items)
    .where(eq(work_items.work_item_id, parentWorkItemId))
    .limit(1);

  const hierarchyDuration = Date.now() - hierarchyStart;

  if (!parentInfo) {
    throw NotFoundError('Parent work item not found');
  }

  const depth = (parentInfo.depth || 0) + 1;

  // Enforce maximum depth limit
  if (depth > WORK_ITEM_CONSTRAINTS.MAX_HIERARCHY_DEPTH) {
    throw ValidationError(
      null,
      `Maximum nesting depth of ${WORK_ITEM_CONSTRAINTS.MAX_HIERARCHY_DEPTH} levels exceeded`
    );
  }

  const rootId = parentInfo.root_work_item_id || parentWorkItemId;
  const parentPath = parentInfo.path;

  log.debug('hierarchy fields calculated', {
    parentId: parentWorkItemId,
    depth,
    rootId,
    hierarchyDuration,
  });

  return { depth, rootId, parentPath };
}

/**
 * Build path for new work item
 *
 * Constructs the hierarchical path for a work item based on its parent's path.
 * Path format: /root-id/parent-id/work-item-id
 *
 * @param workItemId - New work item ID
 * @param parentPath - Parent's path (null for root-level items)
 * @returns Complete path for work item
 */
export function buildWorkItemPath(workItemId: string, parentPath: string | null): string {
  if (parentPath) {
    return `${parentPath}/${workItemId}`;
  }
  return `/${workItemId}`;
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

