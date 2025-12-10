/**
 * Work Item Hierarchy Service
 *
 * Manages work item hierarchy operations including moving items within the tree structure.
 * Handles depth calculation, path updates, and descendant synchronization.
 *
 * **Pattern**: Hybrid pattern with internal class + factory function
 * **Observability**: Full logTemplates integration with SLOW_THRESHOLDS
 * **RBAC**: Organization and ownership-level access control
 */

import { eq, like } from 'drizzle-orm';
import { AuthorizationError, NotFoundError, ValidationError } from '@/lib/api/responses/error';
import { db, type DbContext } from '@/lib/db';
import { work_items } from '@/lib/db/schema';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import type { WorkItemWithDetails } from '@/lib/types/work-items';
import { createRBACWorkItemsService } from './work-items';

/**
 * Work Item Hierarchy Service Interface
 *
 * Provides hierarchy manipulation operations:
 * - moveWorkItem: Move a work item to a new parent (or root level)
 */
export interface WorkItemHierarchyServiceInterface {
  moveWorkItem(workItemId: string, newParentId: string | null): Promise<WorkItemWithDetails>;
}

/**
 * Internal Work Item Hierarchy Service Implementation
 *
 * Uses hybrid pattern: internal class with factory function.
 * Provides hierarchy operations with automatic RBAC enforcement.
 */
class WorkItemHierarchyService implements WorkItemHierarchyServiceInterface {
  private readonly canManageAll: boolean;
  private readonly canManageOwn: boolean;
  private readonly canManageOrg: boolean;
  private readonly accessibleOrgIds: string[];

  constructor(private readonly userContext: UserContext) {
    // Cache permission checks once in constructor
    this.canManageAll =
      userContext.is_super_admin ||
      userContext.all_permissions?.some((p) => p.name === 'work-items:manage:all') ||
      false;

    this.canManageOwn =
      userContext.all_permissions?.some((p) => p.name === 'work-items:manage:own') || false;

    this.canManageOrg =
      userContext.all_permissions?.some((p) => p.name === 'work-items:manage:organization') ||
      false;

    // Cache accessible organization IDs
    this.accessibleOrgIds = userContext.organizations?.map((org) => org.organization_id) || [];
  }

  /**
   * Move work item to a new parent (or root level)
   *
   * Validates permissions, prevents circular references, enforces max depth,
   * and recursively updates all descendant paths.
   *
   * @param workItemId - Work item ID to move
   * @param newParentId - New parent ID (null for root level)
   * @returns Updated work item with new hierarchy position
   * @throws AuthorizationError if no update permission
   * @throws ValidationError if circular reference or max depth exceeded
   * @throws NotFoundError if work item or parent not found
   */
  async moveWorkItem(workItemId: string, newParentId: string | null): Promise<WorkItemWithDetails> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canManageAll && !this.canManageOrg && !this.canManageOwn) {
        throw AuthorizationError('You do not have permission to move work items');
      }

      // Get work items service to fetch work item details
      const workItemsService = createRBACWorkItemsService(this.userContext);

      // Get the work item being moved
      const fetchStart = Date.now();
      const workItem = await workItemsService.getWorkItemById(workItemId);
      const fetchDuration = Date.now() - fetchStart;

      if (!workItem) {
        throw NotFoundError('Work item not found');
      }

      // Check permission on this specific work item
      if (!this.canManageAll) {
        if (this.canManageOrg) {
          if (!this.accessibleOrgIds.includes(workItem.organization_id)) {
            throw AuthorizationError(
              'You do not have permission to move work items in this organization'
            );
          }
        } else if (this.canManageOwn) {
          if (workItem.created_by !== this.userContext.user_id) {
            throw AuthorizationError('You can only move your own work items');
          }
        }
      }

      // Calculate new hierarchy values
      let newDepth = 0;
      let newRootId = workItemId;
      let newPath = `/${workItemId}`;
      let newParent: WorkItemWithDetails | null = null;

      if (newParentId) {
        // Validate new parent exists
        const parentFetchStart = Date.now();
        newParent = await workItemsService.getWorkItemById(newParentId);
        const parentFetchDuration = Date.now() - parentFetchStart;

        if (!newParent) {
          throw NotFoundError('Parent work item not found');
        }

        // Prevent circular references - check if new parent is a descendant
        const circularCheckStart = Date.now();
        const [parentPathResult] = await db
          .select({ path: work_items.path })
          .from(work_items)
          .where(eq(work_items.work_item_id, newParentId))
          .limit(1);
        const circularCheckDuration = Date.now() - circularCheckStart;

        if (parentPathResult?.path?.includes(`/${workItemId}/`)) {
          throw ValidationError(
            'Cannot move work item to its own descendant',
            'This would create a circular reference in the hierarchy'
          );
        }

        // Get parent hierarchy info to calculate new values
        const hierarchyStart = Date.now();
        const [parentHierarchy] = await db
          .select({
            depth: work_items.depth,
            root_work_item_id: work_items.root_work_item_id,
            path: work_items.path,
          })
          .from(work_items)
          .where(eq(work_items.work_item_id, newParentId))
          .limit(1);
        const hierarchyDuration = Date.now() - hierarchyStart;

        newDepth = (parentHierarchy?.depth || 0) + 1;
        newRootId = parentHierarchy?.root_work_item_id || newParentId;
        newPath = `${parentHierarchy?.path || ''}/${workItemId}`;

        // Validate max depth (10 levels)
        if (newDepth > 10) {
          throw ValidationError(
            'Maximum nesting depth of 10 levels exceeded',
            `Moving to depth ${newDepth} exceeds the maximum allowed depth`
          );
        }

        log.debug('hierarchy calculated for move', {
          workItemId,
          newParentId,
          newDepth,
          newRootId,
          fetchDuration,
          parentFetchDuration,
          circularCheckDuration,
          hierarchyDuration,
        });
      }

      // Update the work item and all descendants in a transaction for atomicity
      const { updateDuration, descendantsUpdated, descendantsDuration } = await db.transaction(
        async (tx) => {
          // Update the work item with new hierarchy values
          const txUpdateStart = Date.now();
          await tx
            .update(work_items)
            .set({
              parent_work_item_id: newParentId,
              root_work_item_id: newRootId,
              depth: newDepth,
              path: newPath,
              updated_at: new Date(),
            })
            .where(eq(work_items.work_item_id, workItemId));
          const txUpdateDuration = Date.now() - txUpdateStart;

          // Update all descendants in parallel within transaction
          const txDescendantsStart = Date.now();
          const txDescendantsUpdated = await this.updateDescendantPaths(
            tx,
            workItemId,
            newPath,
            newRootId
          );
          const txDescendantsDuration = Date.now() - txDescendantsStart;

          return {
            updateDuration: txUpdateDuration,
            descendantsUpdated: txDescendantsUpdated,
            descendantsDuration: txDescendantsDuration,
          };
        }
      );

      // Fetch the updated work item
      const updatedWorkItem = await workItemsService.getWorkItemById(workItemId);
      if (!updatedWorkItem) {
        throw NotFoundError('Failed to retrieve moved work item');
      }

      const duration = Date.now() - startTime;

      // Log using custom format (no direct logTemplate for move)
      log.info('work item moved - hierarchy updated', {
        operation: 'move_work_item',
        workItemId,
        workItemName: updatedWorkItem.subject,
        userId: this.userContext.user_id,
        organizationId: workItem.organization_id,
        changes: {
          oldParentId: workItem.parent_work_item_id,
          newParentId,
          oldDepth: workItem.depth,
          newDepth,
          oldRootId: workItem.root_work_item_id,
          newRootId,
        },
        descendants: {
          updated: descendantsUpdated,
          duration: descendantsDuration,
          slow: descendantsDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
        duration,
        component: 'service',
        metadata: {
          fetchDuration,
          updateDuration,
          totalQueries: newParentId ? 5 : 2,
          slowUpdate: updateDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.canManageAll ? 'all' : this.canManageOrg ? 'organization' : 'own',
        },
      });

      return updatedWorkItem;
    } catch (error) {
      log.error('work item move failed', error, {
        operation: 'move_work_item',
        workItemId,
        newParentId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });

      throw error;
    }
  }

  /**
   * Update descendant paths when a work item is moved
   *
   * Finds all descendants by path pattern and updates their path, depth, and root.
   * Uses parallel updates within the transaction for performance (eliminates N+1).
   *
   * @param tx - Database transaction context
   * @param workItemId - Work item that was moved
   * @param newParentPath - New path of the moved work item
   * @param newRootId - New root ID for all descendants
   * @returns Number of descendants updated
   */
  private async updateDescendantPaths(
    tx: DbContext,
    workItemId: string,
    newParentPath: string,
    newRootId: string
  ): Promise<number> {
    try {
      // Get all descendants using path pattern matching
      const descendants = await tx
        .select({
          work_item_id: work_items.work_item_id,
          path: work_items.path,
          depth: work_items.depth,
        })
        .from(work_items)
        .where(like(work_items.path, `${newParentPath}/${workItemId}/%`));

      if (descendants.length === 0) {
        log.debug('no descendants to update', {
          workItemId,
          newParentPath,
        });
        return 0;
      }

      // Calculate all updates upfront
      const updates = descendants.map((descendant) => {
        const oldPath = descendant.path || '';
        // Extract the relative path after this work item
        const relativePath = oldPath.replace(new RegExp(`^.*/${workItemId}/`), '');
        const updatedPath = `${newParentPath}/${workItemId}/${relativePath}`;
        // Calculate new depth by counting path segments
        const updatedDepth = updatedPath.split('/').filter((id) => id).length - 1;

        return {
          work_item_id: descendant.work_item_id,
          path: updatedPath,
          depth: updatedDepth,
        };
      });

      // Execute all updates in parallel within the transaction (eliminates N+1)
      const updatedAt = new Date();
      await Promise.all(
        updates.map((update) =>
          tx
            .update(work_items)
            .set({
              path: update.path,
              depth: update.depth,
              root_work_item_id: newRootId,
              updated_at: updatedAt,
            })
            .where(eq(work_items.work_item_id, update.work_item_id))
        )
      );

      log.debug('descendants updated successfully', {
        workItemId,
        descendantsCount: descendants.length,
        newRootId,
      });

      return descendants.length;
    } catch (error) {
      log.error('failed to update descendant paths', error, {
        workItemId,
        newParentPath,
        newRootId,
      });

      // Re-throw to fail the move operation (transaction will rollback)
      throw error;
    }
  }
}

/**
 * Factory function to create Work Item Hierarchy Service
 *
 * **Phase 3 Implementation**: Hierarchy operations
 * - moveWorkItem: Move work item to new parent with descendant updates
 *
 * @param userContext - User context with RBAC permissions
 * @returns Work item hierarchy service with RBAC enforcement
 *
 * @example
 * ```typescript
 * const hierarchyService = createWorkItemHierarchyService(userContext);
 *
 * // Move work item to new parent
 * const movedItem = await hierarchyService.moveWorkItem('item-uuid', 'new-parent-uuid');
 *
 * // Move work item to root level
 * const rootItem = await hierarchyService.moveWorkItem('item-uuid', null);
 * ```
 *
 * **Permissions Required**:
 * - Move: work-items:manage:all OR work-items:manage:organization OR work-items:manage:own
 *
 * **RBAC Scopes**:
 * - `all`: Super admins can move any work items
 * - `organization`: Users can move work items in their organizations
 * - `own`: Users can only move work items they created
 *
 * **Features**:
 * - Circular reference prevention
 * - Max depth validation (10 levels)
 * - Recursive descendant path updates
 * - Comprehensive performance tracking
 * - Full error logging
 */
export function createWorkItemHierarchyService(
  userContext: UserContext
): WorkItemHierarchyServiceInterface {
  return new WorkItemHierarchyService(userContext);
}
