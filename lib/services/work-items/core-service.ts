// 1. Drizzle ORM
import { and, asc, count, desc, eq } from 'drizzle-orm';

// 2. Database
import { db } from '@/lib/db';
import { work_item_statuses, work_items } from '@/lib/db/schema';

// 3. Logging
import { calculateChanges, log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';

// 4. Errors
import { NotFoundError, ValidationError } from '@/lib/api/responses/error';

// 5. Types
import type { UserContext } from '@/lib/types/rbac';
import type {
  CreateWorkItemData,
  UpdateWorkItemData,
  WorkItemQueryOptions,
  WorkItemWithDetails,
} from '@/lib/types/work-items';

// 6. Internal services and utilities
import { BaseWorkItemsService } from './base-service';
import { WORK_ITEM_CONSTRAINTS } from './constants';
import { createWorkItemCustomFieldsService } from './custom-fields-service';
import { buildWorkItemPath, calculateHierarchyFields } from './hierarchy-service';
import { getWorkItemQueryBuilder } from './query-builder';
import { createWorkItemStatusService } from './status-service';
import {
  validateManagementPermission,
  validateOrganizationAccess,
  validateOwnership,
  validateReadPermission,
} from './validators';

// 7. Validation utilities
import { validatePagination, validateUUID } from '@/lib/utils/validators';

/**
 * Work Items Core Service
 *
 * Handles core CRUD operations for work items:
 * - getWorkItemById (single read with RBAC)
 * - getWorkItemCount (count with filters)
 * - getWorkItems (list with pagination)
 * - createWorkItem (create with hierarchy support)
 * - updateWorkItem (update with change tracking)
 * - deleteWorkItem (soft delete with validation)
 *
 * Extracted from monolithic rbac-work-items-service.ts (1,219 lines)
 * to separate CRUD concerns from hierarchy operations.
 *
 * Uses helper methods from BaseWorkItemsService for:
 * - RBAC filtering
 * - Result mapping
 * - Custom field retrieval
 *
 * @internal - Use factory function instead
 */
class WorkItemCoreService extends BaseWorkItemsService {
  /**
   * Get work item by ID with RBAC enforcement
   *
   * Verifies user has access to the work item based on permissions.
   * Returns null if work item not found or user lacks access.
   *
   * @param workItemId - UUID of work item
   * @returns Work item with details or null if not found/no access
   * @throws AuthorizationError if no read permission
   */
  async getWorkItemById(workItemId: string): Promise<WorkItemWithDetails | null> {
    const startTime = Date.now();

    try {
      // Validate UUID format
      validateUUID(workItemId, 'work item ID');

      // Check permission using validator
      validateReadPermission(this.canReadAll, this.canReadOrg, this.canReadOwn);

      // Execute query with performance tracking
      const queryStart = Date.now();
      const [result] = await getWorkItemQueryBuilder()
        .where(and(eq(work_items.work_item_id, workItemId), ...this.buildBaseRBACWhereConditions()))
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
            component: 'core_service',
          },
        });

        log.info(template.message, template.context);
        return null;
      }

      // Additional RBAC check after fetch using validators
      if (!this.canReadAll) {
        if (this.canReadOrg) {
          validateOrganizationAccess(
            this.userContext,
            result.organization_id,
            this.accessibleOrgIds,
            this.canReadAll,
            'access'
          );
        } else if (this.canReadOwn) {
          validateOwnership(this.userContext, result.created_by, 'work items');
        }
      }

      // Fetch custom field values for this work item
      const customFieldsStart = Date.now();
      const customFieldsService = createWorkItemCustomFieldsService(this.userContext);
      const customFieldsMap = await customFieldsService.getCustomFieldValues([workItemId]);
      const customFieldsDuration = Date.now() - customFieldsStart;

      // Map result to WorkItemWithDetails with custom fields
      const customFields = customFieldsMap.get(workItemId);
      const workItem = this.mapWorkItemResult(result, customFields);
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
          customFieldsDuration,
          customFieldCount: customFields ? Object.keys(customFields).length : 0,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.getRBACScope(),
          component: 'core_service',
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
        component: 'core_service',
      });

      throw error;
    }
  }

  /**
   * Get count of work items with optional filters
   *
   * Applies RBAC filtering automatically based on user permissions.
   * Returns 0 if user has no read permission.
   *
   * @param options - Query filter options
   * @returns Count of work items user has access to
   */
  async getWorkItemCount(options: WorkItemQueryOptions = {}): Promise<number> {
    const startTime = Date.now();

    try {
      // Check permission using validator (returns 0 if no permission instead of throwing)
      if (!this.canReadAll && !this.canReadOrg && !this.canReadOwn) {
        log.info('work item count - no permission', {
          operation: 'count_work_items',
          userId: this.userContext.user_id,
          duration: Date.now() - startTime,
          component: 'core_service',
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
        component: 'core_service',
        metadata: {
          queryDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.getRBACScope(),
        },
      });

      return totalCount;
    } catch (error) {
      log.error('work item count failed', error, {
        operation: 'count_work_items',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'core_service',
      });

      throw error;
    }
  }

  /**
   * Get work items list with optional filters and pagination
   *
   * Supports:
   * - RBAC filtering (automatic)
   * - Pagination (limit/offset)
   * - Sorting (any field, asc/desc)
   * - Search (subject/description)
   * - Custom field loading
   * - 3-way timing tracking (count + query + custom fields)
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
          metadata: { noPermission: true, component: 'core_service' },
        });

        log.info(template.message, template.context);
        return [];
      }

      // Build where conditions with RBAC filtering
      const whereConditions = this.buildWorkItemWhereConditions(options);

      // Execute count query first
      const countStart = Date.now();
      const [countResult] = await db
        .select({ count: count() })
        .from(work_items)
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

      // Validate and enforce pagination limits
      const { limit, offset } = validatePagination(
        options.limit,
        options.offset,
        WORK_ITEM_CONSTRAINTS.MAX_PAGE_LIMIT,
        WORK_ITEM_CONSTRAINTS.DEFAULT_PAGE_LIMIT
      );

      // Execute list query with joins
      const queryStart = Date.now();
      const results = await getWorkItemQueryBuilder()
        .where(and(...whereConditions))
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset);
      const queryDuration = Date.now() - queryStart;

      // Fetch custom field values for all work items using dedicated service
      const workItemIds = results.map((r) => r.work_item_id);
      const customFieldsStart = Date.now();
      const customFieldsService = createWorkItemCustomFieldsService(this.userContext);
      const customFieldsMap = await customFieldsService.getCustomFieldValues(workItemIds);
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
          page: Math.floor(offset / limit) + 1,
        },
        duration,
        metadata: {
          countDuration,
          queryDuration,
          customFieldsDuration,
          slowCount: countDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowQuery: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowCustomFields: customFieldsDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.getRBACScope(),
          limit,
          offset,
          sortBy,
          sortOrder,
          component: 'core_service',
        },
      });

      log.info(template.message, template.context);

      return workItems;
    } catch (error) {
      log.error('work items list failed', error, {
        operation: 'list_work_items',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'core_service',
      });

      throw error;
    }
  }

  /**
   * Get work items list with total count in a single operation
   *
   * Optimized version that avoids the double-query pattern by returning
   * both the paginated items and total count from internal queries.
   *
   * @param options - Query filter and pagination options
   * @returns Object with items array and total count
   */
  async getWorkItemsWithCount(
    options: WorkItemQueryOptions = {}
  ): Promise<{ items: WorkItemWithDetails[]; total: number }> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canReadAll && !this.canReadOrg && !this.canReadOwn) {
        log.info('work items list - no permission', {
          operation: 'list_work_items_with_count',
          userId: this.userContext.user_id,
          duration: Date.now() - startTime,
          component: 'core_service',
        });
        return { items: [], total: 0 };
      }

      // Build where conditions with RBAC filtering
      const whereConditions = this.buildWorkItemWhereConditions(options);

      // Execute count query
      const countStart = Date.now();
      const [countResult] = await db
        .select({ count: count() })
        .from(work_items)
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

      // Validate and enforce pagination limits
      const { limit, offset } = validatePagination(
        options.limit,
        options.offset,
        WORK_ITEM_CONSTRAINTS.MAX_PAGE_LIMIT,
        WORK_ITEM_CONSTRAINTS.DEFAULT_PAGE_LIMIT
      );

      // Execute list query with joins
      const queryStart = Date.now();
      const results = await getWorkItemQueryBuilder()
        .where(and(...whereConditions))
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset);
      const queryDuration = Date.now() - queryStart;

      // Fetch custom field values for all work items
      const workItemIds = results.map((r) => r.work_item_id);
      const customFieldsStart = Date.now();
      const customFieldsService = createWorkItemCustomFieldsService(this.userContext);
      const customFieldsMap = await customFieldsService.getCustomFieldValues(workItemIds);
      const customFieldsDuration = Date.now() - customFieldsStart;

      // Map results to WorkItemWithDetails
      const items = results.map((result) =>
        this.mapWorkItemResult(result, customFieldsMap.get(result.work_item_id))
      );

      const duration = Date.now() - startTime;

      log.info('work items list with count completed', {
        operation: 'list_work_items_with_count',
        userId: this.userContext.user_id,
        results: { returned: items.length, total: totalCount },
        duration,
        component: 'core_service',
        metadata: {
          countDuration,
          queryDuration,
          customFieldsDuration,
          slowCount: countDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowQuery: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.getRBACScope(),
        },
      });

      return { items, total: totalCount };
    } catch (error) {
      log.error('work items list with count failed', error, {
        operation: 'list_work_items_with_count',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'core_service',
      });

      throw error;
    }
  }

  /**
   * Create new work item with RBAC enforcement
   *
   * Features:
   * - Organization access verification
   * - Automatic initial status assignment
   * - Hierarchy support (parent/child relationships)
   * - Depth tracking (max 10 levels)
   * - Path calculation for tree queries
   *
   * @param workItemData - Work item creation data
   * @returns Created work item with full details
   * @throws AuthorizationError if no create permission in target organization
   * @throws NotFoundError if parent work item not found
   * @throws ValidationError if max depth exceeded
   */
  async createWorkItem(workItemData: CreateWorkItemData): Promise<WorkItemWithDetails> {
    const startTime = Date.now();

    try {
      // Check permissions using validators
      validateManagementPermission(this.canManageAll, this.canManageOrg, false, 'create');

      if (!this.canManageAll) {
        validateOrganizationAccess(
          this.userContext,
          workItemData.organization_id,
          this.accessibleOrgIds,
          this.canManageAll,
          'create'
        );
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

      // Calculate hierarchy fields using dedicated helper
      const { depth, rootId, parentPath } = await calculateHierarchyFields(
        workItemData.parent_work_item_id || null
      );

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

      // Build and update path using dedicated helper
      const path = buildWorkItemPath(newWorkItem.work_item_id, parentPath);
      const finalRootId = parentPath ? rootId : newWorkItem.work_item_id;

      const updateStart = Date.now();
      await db
        .update(work_items)
        .set({ path, root_work_item_id: finalRootId })
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
          rbacScope: this.getManagementRBACScope(),
          component: 'core_service',
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
        component: 'core_service',
      });

      throw error;
    }
  }

  /**
   * Update work item with RBAC enforcement
   *
   * Features:
   * - Organization/ownership verification
   * - Status transition validation
   * - Change tracking for audit trail
   * - Comprehensive performance logging
   *
   * @param workItemId - Work item ID to update
   * @param updateData - Fields to update
   * @returns Updated work item with full details
   * @throws AuthorizationError if no update permission
   * @throws NotFoundError if work item not found
   * @throws ValidationError if status transition is not allowed
   */
  async updateWorkItem(
    workItemId: string,
    updateData: UpdateWorkItemData
  ): Promise<WorkItemWithDetails> {
    const startTime = Date.now();

    try {
      // Validate UUID format
      validateUUID(workItemId, 'work item ID');

      // Get current work item to check permissions
      const targetWorkItem = await this.getWorkItemById(workItemId);
      if (!targetWorkItem) {
        throw NotFoundError('Work item not found');
      }

      // Check update permission using validators
      if (!this.canManageAll) {
        if (this.canManageOrg) {
          validateOrganizationAccess(
            this.userContext,
            targetWorkItem.organization_id,
            this.accessibleOrgIds,
            this.canManageAll,
            'update'
          );
        } else if (this.canManageOwn) {
          validateOwnership(this.userContext, targetWorkItem.created_by, 'work items');
        } else {
          validateManagementPermission(
            this.canManageAll,
            this.canManageOrg,
            this.canManageOwn,
            'update'
          );
        }
      }

      // Validate status transition if status is being changed using status service
      if (updateData.status_id && updateData.status_id !== targetWorkItem.status_id) {
        const statusService = createWorkItemStatusService(this.userContext);
        await statusService.validateStatusTransition(
          targetWorkItem.work_item_type_id,
          targetWorkItem.status_id,
          updateData.status_id
        );

        // Check if transitioning to completed status - validate required-to-complete fields
        const [newStatus] = await db
          .select({ status_category: work_item_statuses.status_category })
          .from(work_item_statuses)
          .where(eq(work_item_statuses.work_item_status_id, updateData.status_id))
          .limit(1);

        if (newStatus?.status_category === 'completed') {
          const { validateForCompletion } = await import('./field-completion-validator');
          const validationResult = await validateForCompletion(
            workItemId,
            targetWorkItem.work_item_type_id
          );

          if (!validationResult.isValid) {
            throw ValidationError(
              { missingFields: validationResult.missingFields },
              validationResult.errorMessage ||
                'Work item cannot be completed: required fields are missing'
            );
          }
        }
      }

      // Calculate changes for audit logging
      const changes = calculateChanges(targetWorkItem, updateData);

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
          rbacScope: this.getManagementRBACScope(),
          component: 'core_service',
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
        component: 'core_service',
      });

      throw error;
    }
  }

  /**
   * Delete work item (soft delete) with RBAC enforcement
   *
   * Performs soft delete by setting deleted_at timestamp.
   * Verifies organization/ownership access before deletion.
   *
   * @param workItemId - Work item ID to delete
   * @throws AuthorizationError if no delete permission
   * @throws NotFoundError if work item not found
   */
  async deleteWorkItem(workItemId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Validate UUID format
      validateUUID(workItemId, 'work item ID');

      // Get current work item to check permissions
      const targetWorkItem = await this.getWorkItemById(workItemId);
      if (!targetWorkItem) {
        throw NotFoundError('Work item not found');
      }

      // Check delete permission using validators
      if (!this.canManageAll) {
        if (this.canManageOrg) {
          validateOrganizationAccess(
            this.userContext,
            targetWorkItem.organization_id,
            this.accessibleOrgIds,
            this.canManageAll,
            'delete'
          );
        } else if (this.canManageOwn) {
          validateOwnership(this.userContext, targetWorkItem.created_by, 'work items');
        } else {
          validateManagementPermission(
            this.canManageAll,
            this.canManageOrg,
            this.canManageOwn,
            'delete'
          );
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
          rbacScope: this.getManagementRBACScope(),
          component: 'core_service',
        },
      });

      log.info(template.message, template.context);
    } catch (error) {
      log.error('work item delete failed', error, {
        operation: 'delete_work_item',
        workItemId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'core_service',
      });

      throw error;
    }
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create Work Item Core Service
 *
 * Factory function to create a new work item core service instance
 * with automatic RBAC enforcement.
 *
 * Provides all CRUD operations:
 * - Read: getWorkItemById, getWorkItems, getWorkItemCount
 * - Create: createWorkItem
 * - Update: updateWorkItem
 * - Delete: deleteWorkItem (soft delete)
 *
 * @param userContext - User context with RBAC permissions
 * @returns Core service instance
 *
 * @example
 * ```typescript
 * const service = createWorkItemCoreService(userContext);
 *
 * // Create work item
 * const workItem = await service.createWorkItem({
 *   work_item_type_id: 'type-uuid',
 *   organization_id: 'org-uuid',
 *   subject: 'New task',
 *   priority: 'high'
 * });
 *
 * // List with filters
 * const items = await service.getWorkItems({
 *   status_id: 'in-progress',
 *   limit: 50
 * });
 * ```
 */
export function createWorkItemCoreService(userContext: UserContext): WorkItemCoreService {
  return new WorkItemCoreService(userContext);
}

