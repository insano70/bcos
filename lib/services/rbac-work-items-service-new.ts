/**
 * RBAC Work Items Service (Phase 1 - Core CRUD)
 *
 * Manages work items CRUD operations with automatic permission checking.
 * Following hybrid pattern with comprehensive observability.
 *
 * **Phase 1 Status**: 2/6 methods migrated (getWorkItemById, getWorkItemCount)
 * **Next Phase**: Migrate remaining CRUD methods (getWorkItems, createWorkItem, updateWorkItem, deleteWorkItem)
 */

import { and, asc, count, desc, eq, inArray, isNull, like, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  work_items,
  work_item_statuses,
  work_item_field_values,
  work_item_status_transitions,
} from '@/lib/db/schema';
import { log, logTemplates, SLOW_THRESHOLDS, calculateChanges } from '@/lib/logger';
import { NotFoundError, AuthorizationError, ValidationError } from '@/lib/api/responses/error';
import type { UserContext } from '@/lib/types/rbac';
import type {
  WorkItemWithDetails,
  WorkItemQueryOptions,
  CreateWorkItemData,
  UpdateWorkItemData,
} from '@/lib/types/work-items';
import { getWorkItemQueryBuilder, type WorkItemQueryResult } from './work-items/query-builder';

/**
 * Work Items Service Interface (Phase 2 - Complete)
 *
 * Implements all core CRUD operations:
 * - getWorkItemById (read single)
 * - getWorkItemCount (count with filters)
 * - getWorkItems (list with filters)
 * - createWorkItem (create new work item)
 * - updateWorkItem (update existing work item)
 * - deleteWorkItem (soft delete work item)
 */
export interface WorkItemsServiceInterface {
  getWorkItemById(workItemId: string): Promise<WorkItemWithDetails | null>;
  getWorkItemCount(options?: WorkItemQueryOptions): Promise<number>;
  getWorkItems(options?: WorkItemQueryOptions): Promise<WorkItemWithDetails[]>;
  createWorkItem(workItemData: CreateWorkItemData): Promise<WorkItemWithDetails>;
  updateWorkItem(workItemId: string, updateData: UpdateWorkItemData): Promise<WorkItemWithDetails>;
  deleteWorkItem(workItemId: string): Promise<void>;
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
  private readonly canManageAll: boolean;
  private readonly canManageOwn: boolean;
  private readonly canManageOrg: boolean;
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

    if (options.priority) {
      conditions.push(eq(work_items.priority, options.priority));
    }

    if (options.assigned_to) {
      conditions.push(eq(work_items.assigned_to, options.assigned_to));
    }

    if (options.created_by) {
      conditions.push(eq(work_items.created_by, options.created_by));
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

  /**
   * Get work items list with optional filters and pagination
   *
   * @param options - Query filter and pagination options
   * @returns Array of work items user has access to
   */
  async getWorkItems(options: WorkItemQueryOptions = {}): Promise<WorkItemWithDetails[]> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canReadAll && !this.canReadOrg && !this.canReadOwn) {
        const template = logTemplates.crud.list('work_items', {
          userId: this.userContext.user_id,
          filters: {
            work_item_type_id: options.work_item_type_id,
            organization_id: options.organization_id,
            status_id: options.status_id,
          },
          results: { returned: 0, total: 0, page: 1 },
          duration: Date.now() - startTime,
          metadata: { noPermission: true },
        });

        log.info(template.message, template.context);
        return [];
      }

      // Build where conditions with RBAC filtering
      const whereConditions = this.buildWorkItemWhereConditions(options);

      // Add status_category filter if provided
      if (options.status_category) {
        whereConditions.push(eq(work_item_statuses.status_category, options.status_category));
      }

      // Add search filter if provided
      if (options.search) {
        const searchCondition = or(
          like(work_items.subject, `%${options.search}%`),
          like(work_items.description, `%${options.search}%`)
        );
        if (searchCondition) {
          whereConditions.push(searchCondition);
        }
      }

      // Execute count query first
      const countStart = Date.now();
      const [countResult] = await db
        .select({ count: count() })
        .from(work_items)
        .leftJoin(work_item_statuses, eq(work_items.status_id, work_item_statuses.work_item_status_id))
        .where(and(...whereConditions));
      const countDuration = Date.now() - countStart;
      const totalCount = countResult?.count || 0;

      // Build sorting
      const sortBy = options.sortBy || 'created_at';
      const sortOrder = options.sortOrder || 'desc';
      const sortColumn = (() => {
        switch (sortBy) {
          case 'subject':
            return work_items.subject;
          case 'priority':
            return work_items.priority;
          case 'due_date':
            return work_items.due_date;
          case 'status_id':
            return work_items.status_id;
          case 'assigned_to':
            return work_items.assigned_to;
          case 'updated_at':
            return work_items.updated_at;
          default:
            return work_items.created_at;
        }
      })();
      const orderByClause = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

      // Execute list query with joins
      const queryStart = Date.now();
      const results = await getWorkItemQueryBuilder()
        .leftJoin(work_item_statuses, eq(work_items.status_id, work_item_statuses.work_item_status_id))
        .where(and(...whereConditions))
        .orderBy(orderByClause)
        .limit(options.limit || 50)
        .offset(options.offset || 0);
      const queryDuration = Date.now() - queryStart;

      // Fetch custom field values for all work items
      const workItemIds = results.map((r) => r.work_item_id);
      const customFieldsStart = Date.now();
      const customFieldsMap = await this.getCustomFieldValues(workItemIds);
      const customFieldsDuration = Date.now() - customFieldsStart;

      // Map results to WorkItemWithDetails
      const workItems = results.map((result) =>
        this.mapWorkItemResult(result, customFieldsMap.get(result.work_item_id))
      );

      const duration = Date.now() - startTime;

      // Log using logTemplates.crud.list
      const template = logTemplates.crud.list('work_items', {
        userId: this.userContext.user_id,
        filters: {
          work_item_type_id: options.work_item_type_id,
          organization_id: options.organization_id,
          status_id: options.status_id,
          status_category: options.status_category,
          priority: options.priority,
          assigned_to: options.assigned_to,
          created_by: options.created_by,
          search: options.search,
        },
        results: {
          returned: workItems.length,
          total: totalCount,
          page: Math.floor((options.offset || 0) / (options.limit || 50)) + 1,
        },
        duration,
        metadata: {
          countDuration,
          queryDuration,
          customFieldsDuration,
          slowCount: countDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowQuery: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowCustomFields: customFieldsDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.canReadAll ? 'all' : this.canReadOrg ? 'organization' : 'own',
          limit: options.limit || 50,
          offset: options.offset || 0,
          sortBy,
          sortOrder,
        },
      });

      log.info(template.message, template.context);

      return workItems;
    } catch (error) {
      log.error('work items list failed', error, {
        operation: 'list_work_items',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });

      throw error;
    }
  }

  /**
   * Get custom field values for multiple work items
   * Helper method to fetch and organize custom field values
   *
   * @param workItemIds - Array of work item IDs
   * @returns Map of work item ID to custom field values
   */
  private async getCustomFieldValues(
    workItemIds: string[]
  ): Promise<Map<string, Record<string, unknown>>> {
    if (workItemIds.length === 0) {
      return new Map();
    }

    const fieldValues = await db
      .select()
      .from(work_item_field_values)
      .where(inArray(work_item_field_values.work_item_id, workItemIds));

    const customFieldsMap = new Map<string, Record<string, unknown>>();

    for (const fieldValue of fieldValues) {
      if (!customFieldsMap.has(fieldValue.work_item_id)) {
        customFieldsMap.set(fieldValue.work_item_id, {});
      }
      const workItemFields = customFieldsMap.get(fieldValue.work_item_id);
      if (workItemFields) {
        workItemFields[fieldValue.work_item_field_id] = fieldValue.field_value;
      }
    }

    return customFieldsMap;
  }

  /**
   * Create new work item with RBAC enforcement
   *
   * @param workItemData - Work item creation data
   * @returns Created work item with full details
   * @throws AuthorizationError if no create permission in target organization
   */
  async createWorkItem(workItemData: CreateWorkItemData): Promise<WorkItemWithDetails> {
    const startTime = Date.now();

    try {
      // Check organization access
      if (!this.canManageAll) {
        if (this.canManageOrg) {
          if (!this.accessibleOrgIds.includes(workItemData.organization_id)) {
            throw AuthorizationError(
              'You do not have permission to create work items in this organization'
            );
          }
        } else {
          throw AuthorizationError('You do not have permission to create work items');
        }
      }

      // Get initial status for this work item type
      const statusStart = Date.now();
      const [initialStatus] = await db
        .select()
        .from(work_item_statuses)
        .where(
          and(
            eq(work_item_statuses.work_item_type_id, workItemData.work_item_type_id),
            eq(work_item_statuses.is_initial, true)
          )
        )
        .limit(1);
      const statusDuration = Date.now() - statusStart;

      if (!initialStatus) {
        throw NotFoundError('No initial status found for this work item type');
      }

      // Calculate hierarchy fields if parent exists
      let depth = 0;
      let rootId: string | null = null;
      let parentPath: string | null = null;

      if (workItemData.parent_work_item_id) {
        const hierarchyStart = Date.now();
        const [parentInfo] = await db
          .select({
            depth: work_items.depth,
            root_work_item_id: work_items.root_work_item_id,
            path: work_items.path,
          })
          .from(work_items)
          .where(eq(work_items.work_item_id, workItemData.parent_work_item_id))
          .limit(1);
        const hierarchyDuration = Date.now() - hierarchyStart;

        if (!parentInfo) {
          throw NotFoundError('Parent work item not found');
        }

        depth = (parentInfo.depth || 0) + 1;
        if (depth > 10) {
          throw AuthorizationError('Maximum nesting depth of 10 levels exceeded');
        }

        rootId = parentInfo.root_work_item_id || workItemData.parent_work_item_id;
        parentPath = parentInfo.path;

        log.debug('hierarchy fields calculated', {
          parentId: workItemData.parent_work_item_id,
          depth,
          rootId,
          hierarchyDuration,
        });
      }

      // Create work item
      const insertStart = Date.now();
      const [newWorkItem] = await db
        .insert(work_items)
        .values({
          work_item_type_id: workItemData.work_item_type_id,
          organization_id: workItemData.organization_id,
          subject: workItemData.subject,
          description: workItemData.description || null,
          status_id: initialStatus.work_item_status_id,
          priority: workItemData.priority || 'medium',
          assigned_to: workItemData.assigned_to || null,
          due_date: workItemData.due_date || null,
          parent_work_item_id: workItemData.parent_work_item_id || null,
          root_work_item_id: rootId,
          depth,
          created_by: this.userContext.user_id,
        })
        .returning();
      const insertDuration = Date.now() - insertStart;

      if (!newWorkItem) {
        throw NotFoundError('Failed to create work item');
      }

      // Update path now that we have the work item ID
      let path: string;
      if (workItemData.parent_work_item_id && parentPath) {
        path = `${parentPath}/${newWorkItem.work_item_id}`;
      } else {
        // Root level work item
        path = `/${newWorkItem.work_item_id}`;
        rootId = newWorkItem.work_item_id;
      }

      const updateStart = Date.now();
      await db
        .update(work_items)
        .set({ path, root_work_item_id: rootId })
        .where(eq(work_items.work_item_id, newWorkItem.work_item_id));
      const updateDuration = Date.now() - updateStart;

      // Fetch the created work item with full details
      const workItemWithDetails = await this.getWorkItemById(newWorkItem.work_item_id);
      if (!workItemWithDetails) {
        throw NotFoundError('Failed to retrieve created work item');
      }

      const duration = Date.now() - startTime;

      // Log using logTemplates.crud.create
      const template = logTemplates.crud.create('work_item', {
        resourceId: newWorkItem.work_item_id,
        resourceName: newWorkItem.subject,
        userId: this.userContext.user_id,
        organizationId: workItemData.organization_id,
        duration,
        metadata: {
          workItemType: workItemData.work_item_type_id,
          priority: workItemData.priority || 'medium',
          hasParent: !!workItemData.parent_work_item_id,
          depth,
          statusDuration,
          insertDuration,
          updateDuration,
          slowStatus: statusDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowInsert: insertDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowUpdate: updateDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.canManageAll ? 'all' : 'organization',
        },
      });

      log.info(template.message, template.context);

      return workItemWithDetails;
    } catch (error) {
      log.error('work item create failed', error, {
        operation: 'create_work_item',
        organizationId: workItemData.organization_id,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });

      throw error;
    }
  }

  /**
   * Update work item with RBAC enforcement
   *
   * @param workItemId - Work item ID to update
   * @param updateData - Fields to update
   * @returns Updated work item with full details
   * @throws AuthorizationError if no update permission
   * @throws ValidationError if status transition is not allowed
   */
  async updateWorkItem(
    workItemId: string,
    updateData: UpdateWorkItemData
  ): Promise<WorkItemWithDetails> {
    const startTime = Date.now();

    try {
      // Get current work item to check permissions
      const targetWorkItem = await this.getWorkItemById(workItemId);
      if (!targetWorkItem) {
        throw NotFoundError('Work item not found');
      }

      // Check update permission
      if (!this.canManageAll) {
        if (this.canManageOrg) {
          if (!this.accessibleOrgIds.includes(targetWorkItem.organization_id)) {
            throw AuthorizationError(
              'You do not have permission to update work items in this organization'
            );
          }
        } else if (this.canManageOwn) {
          if (targetWorkItem.created_by !== this.userContext.user_id) {
            throw AuthorizationError('You can only update your own work items');
          }
        } else {
          throw AuthorizationError('You do not have permission to update work items');
        }
      }

      // Validate status transition if status is being changed
      if (updateData.status_id && updateData.status_id !== targetWorkItem.status_id) {
        await this.validateStatusTransition(
          targetWorkItem.work_item_type_id,
          targetWorkItem.status_id,
          updateData.status_id
        );
      }

      // Calculate changes for audit logging
      const changes = calculateChanges(
        targetWorkItem as unknown as Record<string, unknown>,
        updateData as unknown as Record<string, unknown>
      );

      // Update work item
      const updateStart = Date.now();
      const [updatedWorkItem] = await db
        .update(work_items)
        .set({
          ...updateData,
          updated_at: new Date(),
        })
        .where(eq(work_items.work_item_id, workItemId))
        .returning();
      const updateDuration = Date.now() - updateStart;

      if (!updatedWorkItem) {
        throw NotFoundError('Failed to update work item');
      }

      // Fetch the updated work item with full details
      const workItemWithDetails = await this.getWorkItemById(workItemId);
      if (!workItemWithDetails) {
        throw NotFoundError('Failed to retrieve updated work item');
      }

      const duration = Date.now() - startTime;

      // Log using logTemplates.crud.update with calculateChanges
      const template = logTemplates.crud.update('work_item', {
        resourceId: workItemId,
        resourceName: workItemWithDetails.subject,
        userId: this.userContext.user_id,
        changes,
        duration,
        metadata: {
          fieldsChanged: Object.keys(changes).length,
          statusChanged: !!updateData.status_id,
          assigneeChanged: !!updateData.assigned_to,
          updateDuration,
          slowUpdate: updateDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.canManageAll ? 'all' : this.canManageOrg ? 'organization' : 'own',
        },
      });

      log.info(template.message, template.context);

      return workItemWithDetails;
    } catch (error) {
      log.error('work item update failed', error, {
        operation: 'update_work_item',
        workItemId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });

      throw error;
    }
  }

  /**
   * Delete work item (soft delete) with RBAC enforcement
   *
   * @param workItemId - Work item ID to delete
   * @throws AuthorizationError if no delete permission
   */
  async deleteWorkItem(workItemId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Get current work item to check permissions
      const targetWorkItem = await this.getWorkItemById(workItemId);
      if (!targetWorkItem) {
        throw NotFoundError('Work item not found');
      }

      // Check delete permission
      if (!this.canManageAll) {
        if (this.canManageOrg) {
          if (!this.accessibleOrgIds.includes(targetWorkItem.organization_id)) {
            throw AuthorizationError(
              'You do not have permission to delete work items in this organization'
            );
          }
        } else if (this.canManageOwn) {
          if (targetWorkItem.created_by !== this.userContext.user_id) {
            throw AuthorizationError('You can only delete your own work items');
          }
        } else {
          throw AuthorizationError('You do not have permission to delete work items');
        }
      }

      // Soft delete
      const deleteStart = Date.now();
      await db
        .update(work_items)
        .set({
          deleted_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(work_items.work_item_id, workItemId));
      const deleteDuration = Date.now() - deleteStart;

      const duration = Date.now() - startTime;

      // Log using logTemplates.crud.delete
      const template = logTemplates.crud.delete('work_item', {
        resourceId: workItemId,
        resourceName: targetWorkItem.subject,
        userId: this.userContext.user_id,
        organizationId: targetWorkItem.organization_id,
        soft: true,
        duration,
        metadata: {
          deleteDuration,
          slowDelete: deleteDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.canManageAll ? 'all' : this.canManageOrg ? 'organization' : 'own',
        },
      });

      log.info(template.message, template.context);
    } catch (error) {
      log.error('work item delete failed', error, {
        operation: 'delete_work_item',
        workItemId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });

      throw error;
    }
  }

  /**
   * Validate status transition is allowed
   * Helper method to check if status transition is permitted
   *
   * @param typeId - Work item type ID
   * @param fromStatusId - Current status ID
   * @param toStatusId - Desired status ID
   * @throws ValidationError if transition is not allowed
   */
  private async validateStatusTransition(
    typeId: string,
    fromStatusId: string,
    toStatusId: string
  ): Promise<void> {
    const queryStart = Date.now();

    try {
      // Check if a transition rule exists for this type and status pair
      const [transition] = await db
        .select({
          work_item_status_transition_id:
            work_item_status_transitions.work_item_status_transition_id,
          is_allowed: work_item_status_transitions.is_allowed,
        })
        .from(work_item_status_transitions)
        .where(
          and(
            eq(work_item_status_transitions.work_item_type_id, typeId),
            eq(work_item_status_transitions.from_status_id, fromStatusId),
            eq(work_item_status_transitions.to_status_id, toStatusId)
          )
        )
        .limit(1);
      const queryDuration = Date.now() - queryStart;

      // If no transition rule exists, allow the transition (permissive by default)
      if (!transition) {
        log.debug('no transition rule found, allowing status change', {
          typeId,
          fromStatusId,
          toStatusId,
          queryDuration,
        });
        return;
      }

      // If transition rule exists but is_allowed is false, reject the transition
      if (!transition.is_allowed) {
        log.warn('status transition not allowed', {
          typeId,
          fromStatusId,
          toStatusId,
          transitionId: transition.work_item_status_transition_id,
          userId: this.userContext.user_id,
          queryDuration,
        });

        throw ValidationError(
          'Status transition from current status to selected status is not allowed',
          `Cannot transition from status ${fromStatusId} to ${toStatusId}`
        );
      }

      log.debug('status transition validated successfully', {
        typeId,
        fromStatusId,
        toStatusId,
        transitionId: transition.work_item_status_transition_id,
        queryDuration,
      });
    } catch (error) {
      const duration = Date.now() - queryStart;
      log.error('status transition validation failed', error, {
        typeId,
        fromStatusId,
        toStatusId,
        duration,
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
