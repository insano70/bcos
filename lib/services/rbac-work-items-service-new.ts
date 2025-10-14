/**
 * RBAC Work Items Service (Phase 1 - Core CRUD)
 *
 * Manages work items CRUD operations with automatic permission checking.
 * Following hybrid pattern with comprehensive observability.
 *
 * **Phase 1 Status**: 2/6 methods migrated (getWorkItemById, getWorkItemCount)
 * **Next Phase**: Migrate remaining CRUD methods (getWorkItems, createWorkItem, updateWorkItem, deleteWorkItem)
 */

import { and, count, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { work_items } from '@/lib/db/schema';
import { log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';
import { NotFoundError, AuthorizationError } from '@/lib/api/responses/error';
import type { UserContext } from '@/lib/types/rbac';
import type { WorkItemWithDetails, WorkItemQueryOptions } from '@/lib/types/work-items';
import { getWorkItemQueryBuilder, type WorkItemQueryResult } from './work-items/query-builder';

/**
 * Work Items Service Interface (Phase 1 - Partial)
 *
 * Currently implements:
 * - getWorkItemById (read single)
 * - getWorkItemCount (count with filters)
 *
 * To be added in Phase 2:
 * - getWorkItems (list with filters)
 * - createWorkItem
 * - updateWorkItem
 * - deleteWorkItem
 */
export interface WorkItemsServiceInterface {
  getWorkItemById(workItemId: string): Promise<WorkItemWithDetails | null>;
  getWorkItemCount(options?: WorkItemQueryOptions): Promise<number>;
  // Phase 2: Add remaining methods
}

/**
 * Internal Work Items Service Implementation
 *
 * Uses hybrid pattern: internal class with factory function.
 * Provides CRUD operations for work items with automatic RBAC enforcement.
 */
class WorkItemsService implements WorkItemsServiceInterface {
  private readonly canReadAll: boolean;
  private readonly canReadOwn: boolean;
  private readonly canReadOrg: boolean;
  private readonly accessibleOrgIds: string[];

  constructor(private readonly userContext: UserContext) {
    // Cache permission checks once in constructor
    this.canReadAll =
      userContext.is_super_admin ||
      userContext.all_permissions?.some((p) => p.name === 'work-items:read:all') ||
      false;

    this.canReadOwn =
      userContext.all_permissions?.some((p) => p.name === 'work-items:read:own') || false;

    this.canReadOrg =
      userContext.all_permissions?.some((p) => p.name === 'work-items:read:organization') || false;

    // Cache accessible organization IDs
    this.accessibleOrgIds = userContext.organizations?.map((org) => org.organization_id) || [];
  }

  /**
   * Build where conditions for work item queries
   * Applies RBAC filtering based on user permissions
   *
   * @param options - Query filter options
   * @returns Array of SQL where conditions
   */
  private buildWorkItemWhereConditions(options: WorkItemQueryOptions = {}): SQL[] {
    const conditions: SQL[] = [isNull(work_items.deleted_at)];

    // Apply RBAC filtering
    if (!this.canReadAll) {
      if (this.canReadOrg) {
        if (this.accessibleOrgIds.length > 0) {
          conditions.push(inArray(work_items.organization_id, this.accessibleOrgIds));
        } else {
          // No organizations accessible - return impossible condition
          conditions.push(eq(work_items.work_item_id, 'impossible-id'));
        }
      } else if (this.canReadOwn) {
        conditions.push(eq(work_items.created_by, this.userContext.user_id));
      } else {
        // No read permission - return impossible condition
        conditions.push(eq(work_items.work_item_id, 'impossible-id'));
      }
    }

    // Apply filters
    if (options.work_item_type_id) {
      conditions.push(eq(work_items.work_item_type_id, options.work_item_type_id));
    }

    if (options.organization_id) {
      conditions.push(eq(work_items.organization_id, options.organization_id));
    }

    if (options.status_id) {
      conditions.push(eq(work_items.status_id, options.status_id));
    }

    return conditions;
  }

  /**
   * Map database query result to WorkItemWithDetails
   * Handles name concatenation and default values
   *
   * @param result - Raw database result
   * @param customFields - Optional custom field values
   * @returns Mapped work item with details
   */
  private mapWorkItemResult(
    result: WorkItemQueryResult,
    customFields?: Record<string, unknown>
  ): WorkItemWithDetails {
    return {
      work_item_id: result.work_item_id,
      work_item_type_id: result.work_item_type_id,
      work_item_type_name: result.work_item_type_name || '',
      organization_id: result.organization_id,
      organization_name: result.organization_name || '',
      subject: result.subject,
      description: result.description,
      status_id: result.status_id,
      status_name: result.status_name || '',
      status_category: result.status_category || '',
      priority: result.priority || 'medium',
      assigned_to: result.assigned_to,
      assigned_to_name:
        result.assigned_to_first_name && result.assigned_to_last_name
          ? `${result.assigned_to_first_name} ${result.assigned_to_last_name}`
          : null,
      due_date: result.due_date,
      started_at: result.started_at,
      completed_at: result.completed_at,
      parent_work_item_id: result.parent_work_item_id,
      root_work_item_id: result.root_work_item_id,
      depth: result.depth,
      path: result.path,
      created_by: result.created_by,
      created_by_name:
        result.created_by_first_name && result.created_by_last_name
          ? `${result.created_by_first_name} ${result.created_by_last_name}`
          : '',
      created_at: result.created_at,
      updated_at: result.updated_at,
      custom_fields: customFields,
    };
  }

  /**
   * Get work item by ID with RBAC enforcement
   *
   * @param workItemId - UUID of work item
   * @returns Work item with details or null if not found/no access
   * @throws AuthorizationError if no read permission
   */
  async getWorkItemById(workItemId: string): Promise<WorkItemWithDetails | null> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canReadAll && !this.canReadOrg && !this.canReadOwn) {
        throw AuthorizationError('You do not have permission to read work items');
      }

      // Execute query with performance tracking
      const queryStart = Date.now();
      const [result] = await getWorkItemQueryBuilder()
        .where(and(eq(work_items.work_item_id, workItemId), isNull(work_items.deleted_at)))
        .limit(1);
      const queryDuration = Date.now() - queryStart;

      if (!result) {
        const duration = Date.now() - startTime;
        const template = logTemplates.crud.read('work_item', {
          resourceId: workItemId,
          userId: this.userContext.user_id,
          found: false,
          duration,
          metadata: {
            queryDuration,
            slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          },
        });

        log.info(template.message, template.context);
        return null;
      }

      // Additional RBAC check after fetch
      if (!this.canReadAll) {
        if (this.canReadOrg) {
          if (!this.accessibleOrgIds.includes(result.organization_id)) {
            throw AuthorizationError(
              'You do not have permission to access work items in this organization'
            );
          }
        } else if (this.canReadOwn) {
          if (result.created_by !== this.userContext.user_id) {
            throw AuthorizationError('You can only access your own work items');
          }
        }
      }

      // Map result to WorkItemWithDetails
      const workItem = this.mapWorkItemResult(result);
      const duration = Date.now() - startTime;

      // Log successful read using logTemplates
      const template = logTemplates.crud.read('work_item', {
        resourceId: workItemId,
        resourceName: workItem.subject,
        userId: this.userContext.user_id,
        found: true,
        duration,
        metadata: {
          workItemType: workItem.work_item_type_name,
          status: workItem.status_name,
          organizationId: workItem.organization_id,
          queryDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.canReadAll ? 'all' : this.canReadOrg ? 'organization' : 'own',
        },
      });

      log.info(template.message, template.context);

      return workItem;
    } catch (error) {
      log.error('work item read failed', error, {
        operation: 'read_work_item',
        workItemId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });

      throw error;
    }
  }

  /**
   * Get count of work items with optional filters
   *
   * @param options - Query filter options
   * @returns Count of work items user has access to
   */
  async getWorkItemCount(options: WorkItemQueryOptions = {}): Promise<number> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canReadAll && !this.canReadOrg && !this.canReadOwn) {
        log.info('work item count - no permission', {
          operation: 'count_work_items',
          userId: this.userContext.user_id,
          duration: Date.now() - startTime,
          component: 'service',
          metadata: { noPermission: true, count: 0 },
        });
        return 0;
      }

      // Build where conditions
      const whereConditions = this.buildWorkItemWhereConditions(options);

      // Execute count query with performance tracking
      const queryStart = Date.now();
      const [result] = await db
        .select({ count: count() })
        .from(work_items)
        .where(and(...whereConditions));
      const queryDuration = Date.now() - queryStart;

      const totalCount = result?.count || 0;
      const duration = Date.now() - startTime;

      // Log count operation
      log.info('work item count completed', {
        operation: 'count_work_items',
        userId: this.userContext.user_id,
        filters: {
          work_item_type_id: options.work_item_type_id,
          organization_id: options.organization_id,
          status_id: options.status_id,
        },
        count: totalCount,
        duration,
        component: 'service',
        metadata: {
          queryDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.canReadAll ? 'all' : this.canReadOrg ? 'organization' : 'own',
        },
      });

      return totalCount;
    } catch (error) {
      log.error('work item count failed', error, {
        operation: 'count_work_items',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });

      throw error;
    }
  }
}

/**
 * Factory function to create RBAC Work Items Service
 *
 * **Phase 1 Implementation**: Core read operations only
 * - getWorkItemById: Fetch single work item by ID
 * - getWorkItemCount: Count work items with filters
 *
 * **Phase 2 TODO**: Add remaining CRUD operations
 * - getWorkItems: List work items with pagination/filtering
 * - createWorkItem: Create new work item
 * - updateWorkItem: Update existing work item
 * - deleteWorkItem: Soft delete work item
 *
 * @param userContext - User context with RBAC permissions
 * @returns Work items service with RBAC enforcement
 *
 * @example
 * ```typescript
 * const workItemsService = createRBACWorkItemsService(userContext);
 *
 * // Get single work item
 * const workItem = await workItemsService.getWorkItemById('work-item-uuid');
 *
 * // Count work items
 * const count = await workItemsService.getWorkItemCount({ status_id: 'in-progress' });
 * ```
 *
 * **Permissions Required**:
 * - Read: work-items:read:all OR work-items:read:organization OR work-items:read:own
 *
 * **RBAC Scopes**:
 * - `all`: Super admins can see all work items
 * - `organization`: Users can see work items in their organizations
 * - `own`: Users can only see work items they created
 */
export function createRBACWorkItemsService(
  userContext: UserContext
): WorkItemsServiceInterface {
  return new WorkItemsService(userContext);
}
