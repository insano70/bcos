import { and, asc, count, desc, eq, inArray, isNull, like, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  organizations,
  users,
  work_item_field_values,
  work_item_statuses,
  work_item_types,
  work_items,
} from '@/lib/db/schema';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { PermissionDeniedError } from '@/lib/types/rbac';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * Work Items Service with RBAC
 * Manages work items with automatic permission checking and scope-based filtering
 */

export interface CreateWorkItemData {
  work_item_type_id: string;
  organization_id: string;
  subject: string;
  description?: string | null | undefined;
  priority?: string | undefined;
  assigned_to?: string | null | undefined;
  due_date?: Date | null | undefined;
  parent_work_item_id?: string | null | undefined; // Phase 2: Hierarchy support
}

export interface UpdateWorkItemData {
  subject?: string | undefined;
  description?: string | null | undefined;
  status_id?: string | undefined;
  priority?: string | undefined;
  assigned_to?: string | null | undefined;
  due_date?: Date | null | undefined;
  started_at?: Date | null | undefined;
  completed_at?: Date | null | undefined;
}

export interface WorkItemQueryOptions {
  work_item_type_id?: string | undefined;
  organization_id?: string | undefined;
  status_id?: string | undefined;
  status_category?: string | undefined;
  priority?: string | undefined;
  assigned_to?: string | undefined;
  created_by?: string | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface WorkItemWithDetails {
  work_item_id: string;
  work_item_type_id: string;
  work_item_type_name: string;
  organization_id: string;
  organization_name: string;
  subject: string;
  description: string | null;
  status_id: string;
  status_name: string;
  status_category: string;
  priority: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_by: string;
  created_by_name: string;
  created_at: Date;
  updated_at: Date;
  custom_fields?: Record<string, unknown> | undefined; // Phase 3: Custom field values
}

export class RBACWorkItemsService extends BaseRBACService {
  /**
   * Get work items with automatic permission-based filtering
   */
  async getWorkItems(options: WorkItemQueryOptions = {}): Promise<WorkItemWithDetails[]> {
    const startTime = Date.now();
    const accessScope = this.getAccessScope('work-items', 'read');

    log.info('Work items query initiated', {
      requestingUserId: this.userContext.user_id,
      scope: accessScope.scope,
      options,
    });

    // Build where conditions
    const whereConditions = [isNull(work_items.deleted_at)];

    // Apply scope-based filtering
    switch (accessScope.scope) {
      case 'own':
        if (!this.userContext.user_id) {
          throw new Error('User ID required for own scope');
        }
        whereConditions.push(eq(work_items.created_by, this.userContext.user_id));
        break;

      case 'organization': {
        const accessibleOrgIds = accessScope.organizationIds || [];
        if (accessibleOrgIds.length > 0) {
          whereConditions.push(inArray(work_items.organization_id, accessibleOrgIds));
        } else {
          return [];
        }
        break;
      }

      case 'all':
        // Super admin can see all work items
        break;
    }

    // Apply additional filters
    if (options.work_item_type_id) {
      whereConditions.push(eq(work_items.work_item_type_id, options.work_item_type_id));
    }

    if (options.organization_id) {
      whereConditions.push(eq(work_items.organization_id, options.organization_id));
    }

    if (options.status_id) {
      whereConditions.push(eq(work_items.status_id, options.status_id));
    }

    if (options.status_category) {
      whereConditions.push(eq(work_item_statuses.status_category, options.status_category));
    }

    if (options.priority) {
      whereConditions.push(eq(work_items.priority, options.priority));
    }

    if (options.assigned_to) {
      whereConditions.push(eq(work_items.assigned_to, options.assigned_to));
    }

    if (options.created_by) {
      whereConditions.push(eq(work_items.created_by, options.created_by));
    }

    if (options.search) {
      const searchCondition = or(
        like(work_items.subject, `%${options.search}%`),
        like(work_items.description, `%${options.search}%`)
      );
      if (searchCondition) {
        whereConditions.push(searchCondition);
      }
    }

    // Build sorting
    const sortBy = options.sortBy || 'created_at';
    const sortOrder = options.sortOrder || 'desc';

    // Map sortBy to actual column - TypeScript-safe approach
    const sortColumn = (() => {
      switch (sortBy) {
        case 'subject': return work_items.subject;
        case 'priority': return work_items.priority;
        case 'due_date': return work_items.due_date;
        case 'status_id': return work_items.status_id;
        case 'assigned_to': return work_items.assigned_to;
        case 'updated_at': return work_items.updated_at;
        default: return work_items.created_at;
      }
    })();

    const orderByClause = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    // Execute query with joins
    const results = await db
      .select({
        work_item_id: work_items.work_item_id,
        work_item_type_id: work_items.work_item_type_id,
        work_item_type_name: work_item_types.name,
        organization_id: work_items.organization_id,
        organization_name: organizations.name,
        subject: work_items.subject,
        description: work_items.description,
        status_id: work_items.status_id,
        status_name: work_item_statuses.status_name,
        status_category: work_item_statuses.status_category,
        priority: work_items.priority,
        assigned_to: work_items.assigned_to,
        assigned_to_first_name: users.first_name,
        assigned_to_last_name: users.last_name,
        due_date: work_items.due_date,
        started_at: work_items.started_at,
        completed_at: work_items.completed_at,
        created_by: work_items.created_by,
        created_by_first_name: users.first_name,
        created_by_last_name: users.last_name,
        created_at: work_items.created_at,
        updated_at: work_items.updated_at,
      })
      .from(work_items)
      .leftJoin(work_item_types, eq(work_items.work_item_type_id, work_item_types.work_item_type_id))
      .leftJoin(organizations, eq(work_items.organization_id, organizations.organization_id))
      .leftJoin(work_item_statuses, eq(work_items.status_id, work_item_statuses.work_item_status_id))
      .leftJoin(users, eq(work_items.assigned_to, users.user_id))
      .where(and(...whereConditions))
      .orderBy(orderByClause)
      .limit(options.limit || 50)
      .offset(options.offset || 0);

    // Phase 3: Fetch custom field values for all work items
    const workItemIds = results.map((r) => r.work_item_id);
    const customFieldsMap = await this.getCustomFieldValues(workItemIds);

    const duration = Date.now() - startTime;
    log.info('Work items query completed', {
      requestingUserId: this.userContext.user_id,
      resultCount: results.length,
      duration,
    });

    // Map results to WorkItemWithDetails
    return results.map((result) => ({
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
      assigned_to_name: result.assigned_to_first_name && result.assigned_to_last_name
        ? `${result.assigned_to_first_name} ${result.assigned_to_last_name}`
        : null,
      due_date: result.due_date,
      started_at: result.started_at,
      completed_at: result.completed_at,
      created_by: result.created_by,
      created_by_name: result.created_by_first_name && result.created_by_last_name
        ? `${result.created_by_first_name} ${result.created_by_last_name}`
        : '',
      created_at: result.created_at || new Date(),
      updated_at: result.updated_at || new Date(),
      custom_fields: customFieldsMap.get(result.work_item_id), // Phase 3: Include custom field values
    }));
  }

  /**
   * Get single work item by ID with permission checking
   */
  async getWorkItemById(workItemId: string): Promise<WorkItemWithDetails | null> {
    const startTime = Date.now();

    log.info('Work item fetch by ID initiated', {
      workItemId,
      requestingUserId: this.userContext.user_id,
    });

    // Check read permission
    const canReadOwn = this.checker.hasPermission('work-items:read:own', workItemId);
    const canReadOrg = this.checker.hasPermission('work-items:read:organization');
    const canReadAll = this.checker.hasPermission('work-items:read:all');

    if (!canReadOwn && !canReadOrg && !canReadAll) {
      throw new PermissionDeniedError('work-items:read:*', workItemId);
    }

    // Fetch the work item with joins
    const result = await db
      .select({
        work_item_id: work_items.work_item_id,
        work_item_type_id: work_items.work_item_type_id,
        work_item_type_name: work_item_types.name,
        organization_id: work_items.organization_id,
        organization_name: organizations.name,
        subject: work_items.subject,
        description: work_items.description,
        status_id: work_items.status_id,
        status_name: work_item_statuses.status_name,
        status_category: work_item_statuses.status_category,
        priority: work_items.priority,
        assigned_to: work_items.assigned_to,
        assigned_to_first_name: users.first_name,
        assigned_to_last_name: users.last_name,
        due_date: work_items.due_date,
        started_at: work_items.started_at,
        completed_at: work_items.completed_at,
        created_by: work_items.created_by,
        created_at: work_items.created_at,
        updated_at: work_items.updated_at,
      })
      .from(work_items)
      .leftJoin(work_item_types, eq(work_items.work_item_type_id, work_item_types.work_item_type_id))
      .leftJoin(organizations, eq(work_items.organization_id, organizations.organization_id))
      .leftJoin(work_item_statuses, eq(work_items.status_id, work_item_statuses.work_item_status_id))
      .leftJoin(users, eq(work_items.assigned_to, users.user_id))
      .where(and(eq(work_items.work_item_id, workItemId), isNull(work_items.deleted_at)))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const workItem = result[0];
    if (!workItem) {
      return null;
    }

    // Additional permission check for organization scope
    if (canReadOrg && !canReadAll) {
      if (!this.canAccessOrganization(workItem.organization_id)) {
        throw new PermissionDeniedError('work-items:read:organization', workItemId);
      }
    }

    // Phase 3: Fetch custom field values
    const customFieldsMap = await this.getCustomFieldValues([workItemId]);
    const customFields = customFieldsMap.get(workItemId);

    const duration = Date.now() - startTime;
    log.info('Work item fetch completed', {
      workItemId,
      requestingUserId: this.userContext.user_id,
      duration,
    });

    return {
      work_item_id: workItem.work_item_id,
      work_item_type_id: workItem.work_item_type_id,
      work_item_type_name: workItem.work_item_type_name || '',
      organization_id: workItem.organization_id,
      organization_name: workItem.organization_name || '',
      subject: workItem.subject,
      description: workItem.description,
      status_id: workItem.status_id,
      status_name: workItem.status_name || '',
      status_category: workItem.status_category || '',
      priority: workItem.priority || 'medium',
      assigned_to: workItem.assigned_to,
      assigned_to_name: workItem.assigned_to_first_name && workItem.assigned_to_last_name
        ? `${workItem.assigned_to_first_name} ${workItem.assigned_to_last_name}`
        : null,
      due_date: workItem.due_date,
      started_at: workItem.started_at,
      completed_at: workItem.completed_at,
      created_by: workItem.created_by,
      created_by_name: '', // Need to join creator separately
      created_at: workItem.created_at || new Date(),
      updated_at: workItem.updated_at || new Date(),
      custom_fields: customFields, // Phase 3: Include custom field values
    };
  }

  /**
   * Create new work item
   */
  async createWorkItem(workItemData: CreateWorkItemData): Promise<WorkItemWithDetails> {
    const startTime = Date.now();

    log.info('Work item creation initiated', {
      requestingUserId: this.userContext.user_id,
      targetOrganizationId: workItemData.organization_id,
      operation: 'create_work_item',
    });

    // Permission already checked by rbacRoute - just verify organization access
    this.requireOrganizationAccess(workItemData.organization_id);

    // Get initial status for this work item type
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

    if (!initialStatus) {
      throw new Error('No initial status found for this work item type');
    }

    // Phase 2: Calculate hierarchy fields
    let depth = 0;
    let rootId: string | null = null;
    let path: string | null = null;

    if (workItemData.parent_work_item_id) {
      // Validate parent exists and depth is not exceeded
      const parentInfo = await db
        .select({
          depth: work_items.depth,
          root_work_item_id: work_items.root_work_item_id,
          path: work_items.path,
        })
        .from(work_items)
        .where(eq(work_items.work_item_id, workItemData.parent_work_item_id))
        .limit(1);

      if (!parentInfo[0]) {
        throw new Error('Parent work item not found');
      }

      depth = (parentInfo[0].depth || 0) + 1;
      if (depth > 10) {
        throw new Error('Maximum nesting depth of 10 levels exceeded');
      }

      rootId = parentInfo[0].root_work_item_id || workItemData.parent_work_item_id;
      // Path will be updated after insert with actual work item ID
    }

    // Create work item
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

    if (!newWorkItem) {
      throw new Error('Failed to create work item');
    }

    // Update path now that we have the work item ID
    if (workItemData.parent_work_item_id) {
      const parentInfo = await db
        .select({ path: work_items.path })
        .from(work_items)
        .where(eq(work_items.work_item_id, workItemData.parent_work_item_id))
        .limit(1);

      path = `${parentInfo[0]?.path || ''}/${newWorkItem.work_item_id}`;
    } else {
      // Root level work item
      path = `/${newWorkItem.work_item_id}`;
      rootId = newWorkItem.work_item_id;
    }

    await db
      .update(work_items)
      .set({ path, root_work_item_id: rootId })
      .where(eq(work_items.work_item_id, newWorkItem.work_item_id));

    log.info('Work item created successfully', {
      workItemId: newWorkItem.work_item_id,
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
    });

    await this.logPermissionCheck('work-items:create:organization', newWorkItem.work_item_id, workItemData.organization_id);

    // Fetch and return the created work item with full details
    const workItemWithDetails = await this.getWorkItemById(newWorkItem.work_item_id);
    if (!workItemWithDetails) {
      throw new Error('Failed to retrieve created work item');
    }

    return workItemWithDetails;
  }

  /**
   * Update work item
   */
  async updateWorkItem(workItemId: string, updateData: UpdateWorkItemData): Promise<WorkItemWithDetails> {
    const startTime = Date.now();

    log.info('Work item update initiated', {
      workItemId,
      requestingUserId: this.userContext.user_id,
    });

    // Check permission
    const canUpdateOwn = this.checker.hasPermission('work-items:update:own', workItemId);
    const canUpdateOrg = this.checker.hasPermission('work-items:update:organization');
    const canUpdateAll = this.checker.hasPermission('work-items:update:all');

    if (!canUpdateOwn && !canUpdateOrg && !canUpdateAll) {
      throw new PermissionDeniedError('work-items:update:*', workItemId);
    }

    // Verify organization access for org scope
    if (canUpdateOrg && !canUpdateAll) {
      const targetWorkItem = await this.getWorkItemById(workItemId);
      if (!targetWorkItem) {
        throw new Error('Work item not found');
      }
      if (!this.canAccessOrganization(targetWorkItem.organization_id)) {
        throw new PermissionDeniedError('work-items:update:organization', workItemId);
      }
    }

    // Update work item
    const [updatedWorkItem] = await db
      .update(work_items)
      .set({
        ...updateData,
        updated_at: new Date(),
      })
      .where(eq(work_items.work_item_id, workItemId))
      .returning();

    if (!updatedWorkItem) {
      throw new Error('Failed to update work item');
    }

    log.info('Work item updated successfully', {
      workItemId,
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
    });

    await this.logPermissionCheck('work-items:update', workItemId);

    // Fetch and return updated work item with full details
    const workItemWithDetails = await this.getWorkItemById(workItemId);
    if (!workItemWithDetails) {
      throw new Error('Failed to retrieve updated work item');
    }

    return workItemWithDetails;
  }

  /**
   * Delete work item (soft delete)
   */
  async deleteWorkItem(workItemId: string): Promise<void> {
    const startTime = Date.now();

    log.info('Work item deletion initiated', {
      workItemId,
      requestingUserId: this.userContext.user_id,
    });

    // Check permission
    const canDeleteOwn = this.checker.hasPermission('work-items:delete:own', workItemId);
    const canDeleteOrg = this.checker.hasPermission('work-items:delete:organization');
    const canDeleteAll = this.checker.hasPermission('work-items:delete:all');

    if (!canDeleteOwn && !canDeleteOrg && !canDeleteAll) {
      throw new PermissionDeniedError('work-items:delete:*', workItemId);
    }

    // Verify organization access for org scope
    if (canDeleteOrg && !canDeleteAll) {
      const targetWorkItem = await this.getWorkItemById(workItemId);
      if (!targetWorkItem) {
        throw new Error('Work item not found');
      }
      if (!this.canAccessOrganization(targetWorkItem.organization_id)) {
        throw new PermissionDeniedError('work-items:delete:organization', workItemId);
      }
    }

    // Soft delete
    await db
      .update(work_items)
      .set({
        deleted_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(work_items.work_item_id, workItemId));

    log.info('Work item deleted successfully', {
      workItemId,
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
    });

    await this.logPermissionCheck('work-items:delete', workItemId);
  }

  /**
   * Get work item count
   */
  async getWorkItemCount(options: WorkItemQueryOptions = {}): Promise<number> {
    const accessScope = this.getAccessScope('work-items', 'read');
    const whereConditions = [isNull(work_items.deleted_at)];

    // Apply scope-based filtering
    switch (accessScope.scope) {
      case 'own':
        whereConditions.push(eq(work_items.created_by, this.userContext.user_id));
        break;

      case 'organization': {
        const accessibleOrgIds = accessScope.organizationIds || [];
        if (accessibleOrgIds.length > 0) {
          whereConditions.push(inArray(work_items.organization_id, accessibleOrgIds));
        } else {
          return 0;
        }
        break;
      }

      case 'all':
        break;
    }

    // Apply filters
    if (options.work_item_type_id) {
      whereConditions.push(eq(work_items.work_item_type_id, options.work_item_type_id));
    }

    if (options.organization_id) {
      whereConditions.push(eq(work_items.organization_id, options.organization_id));
    }

    const result = await db
      .select({ count: count() })
      .from(work_items)
      .where(and(...whereConditions));

    return result[0]?.count || 0;
  }

  /**
   * Phase 2: Get children of a work item
   */
  async getWorkItemChildren(workItemId: string): Promise<WorkItemWithDetails[]> {
    const startTime = Date.now();

    log.info('Work item children fetch initiated', {
      workItemId,
      requestingUserId: this.userContext.user_id,
    });

    // Verify permission to read the work item
    await this.getWorkItemById(workItemId);

    const accessScope = this.getAccessScope('work-items', 'read');
    const whereConditions = [
      isNull(work_items.deleted_at),
      eq(work_items.parent_work_item_id, workItemId),
    ];

    // Apply scope-based filtering
    switch (accessScope.scope) {
      case 'own':
        whereConditions.push(eq(work_items.created_by, this.userContext.user_id));
        break;
      case 'organization': {
        const accessibleOrgIds = accessScope.organizationIds || [];
        if (accessibleOrgIds.length > 0) {
          whereConditions.push(inArray(work_items.organization_id, accessibleOrgIds));
        } else {
          return [];
        }
        break;
      }
      case 'all':
        break;
    }

    const results = await db
      .select({
        work_item_id: work_items.work_item_id,
        work_item_type_id: work_items.work_item_type_id,
        work_item_type_name: work_item_types.name,
        organization_id: work_items.organization_id,
        organization_name: organizations.name,
        subject: work_items.subject,
        description: work_items.description,
        status_id: work_items.status_id,
        status_name: work_item_statuses.status_name,
        status_category: work_item_statuses.status_category,
        priority: work_items.priority,
        assigned_to: work_items.assigned_to,
        assigned_to_first_name: users.first_name,
        assigned_to_last_name: users.last_name,
        due_date: work_items.due_date,
        started_at: work_items.started_at,
        completed_at: work_items.completed_at,
        created_by: work_items.created_by,
        created_by_first_name: users.first_name,
        created_by_last_name: users.last_name,
        created_at: work_items.created_at,
        updated_at: work_items.updated_at,
      })
      .from(work_items)
      .leftJoin(work_item_types, eq(work_items.work_item_type_id, work_item_types.work_item_type_id))
      .leftJoin(organizations, eq(work_items.organization_id, organizations.organization_id))
      .leftJoin(work_item_statuses, eq(work_items.status_id, work_item_statuses.work_item_status_id))
      .leftJoin(users, eq(work_items.assigned_to, users.user_id))
      .where(and(...whereConditions))
      .orderBy(asc(work_items.created_at));

    const duration = Date.now() - startTime;
    log.info('Work item children fetch completed', {
      workItemId,
      childCount: results.length,
      duration,
    });

    return results.map((result) => ({
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
      assigned_to_name: result.assigned_to_first_name && result.assigned_to_last_name
        ? `${result.assigned_to_first_name} ${result.assigned_to_last_name}`
        : null,
      due_date: result.due_date,
      started_at: result.started_at,
      completed_at: result.completed_at,
      created_by: result.created_by,
      created_by_name: result.created_by_first_name && result.created_by_last_name
        ? `${result.created_by_first_name} ${result.created_by_last_name}`
        : '',
      created_at: result.created_at || new Date(),
      updated_at: result.updated_at || new Date(),
    }));
  }

  /**
   * Phase 2: Get ancestors of a work item (breadcrumb trail)
   */
  async getWorkItemAncestors(workItemId: string): Promise<WorkItemWithDetails[]> {
    const startTime = Date.now();

    log.info('Work item ancestors fetch initiated', {
      workItemId,
      requestingUserId: this.userContext.user_id,
    });

    // Verify permission to read the work item
    const workItem = await this.getWorkItemById(workItemId);
    if (!workItem) {
      return [];
    }

    // Parse path to get ancestor IDs
    const [rawWorkItem] = await db
      .select({ path: work_items.path })
      .from(work_items)
      .where(eq(work_items.work_item_id, workItemId))
      .limit(1);

    if (!rawWorkItem?.path) {
      return [];
    }

    // Path format: '/root_id/parent_id/this_id' - extract ancestor IDs
    const ancestorIds = rawWorkItem.path
      .split('/')
      .filter((id) => id && id !== workItemId);

    if (ancestorIds.length === 0) {
      return [];
    }

    const accessScope = this.getAccessScope('work-items', 'read');
    const whereConditions = [
      isNull(work_items.deleted_at),
      inArray(work_items.work_item_id, ancestorIds),
    ];

    // Apply scope-based filtering
    switch (accessScope.scope) {
      case 'own':
        whereConditions.push(eq(work_items.created_by, this.userContext.user_id));
        break;
      case 'organization': {
        const accessibleOrgIds = accessScope.organizationIds || [];
        if (accessibleOrgIds.length > 0) {
          whereConditions.push(inArray(work_items.organization_id, accessibleOrgIds));
        } else {
          return [];
        }
        break;
      }
      case 'all':
        break;
    }

    const results = await db
      .select({
        work_item_id: work_items.work_item_id,
        work_item_type_id: work_items.work_item_type_id,
        work_item_type_name: work_item_types.name,
        organization_id: work_items.organization_id,
        organization_name: organizations.name,
        subject: work_items.subject,
        description: work_items.description,
        status_id: work_items.status_id,
        status_name: work_item_statuses.status_name,
        status_category: work_item_statuses.status_category,
        priority: work_items.priority,
        assigned_to: work_items.assigned_to,
        assigned_to_first_name: users.first_name,
        assigned_to_last_name: users.last_name,
        due_date: work_items.due_date,
        started_at: work_items.started_at,
        completed_at: work_items.completed_at,
        created_by: work_items.created_by,
        created_by_first_name: users.first_name,
        created_by_last_name: users.last_name,
        created_at: work_items.created_at,
        updated_at: work_items.updated_at,
        depth: work_items.depth,
      })
      .from(work_items)
      .leftJoin(work_item_types, eq(work_items.work_item_type_id, work_item_types.work_item_type_id))
      .leftJoin(organizations, eq(work_items.organization_id, organizations.organization_id))
      .leftJoin(work_item_statuses, eq(work_items.status_id, work_item_statuses.work_item_status_id))
      .leftJoin(users, eq(work_items.assigned_to, users.user_id))
      .where(and(...whereConditions))
      .orderBy(asc(work_items.depth));

    const duration = Date.now() - startTime;
    log.info('Work item ancestors fetch completed', {
      workItemId,
      ancestorCount: results.length,
      duration,
    });

    return results.map((result) => ({
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
      assigned_to_name: result.assigned_to_first_name && result.assigned_to_last_name
        ? `${result.assigned_to_first_name} ${result.assigned_to_last_name}`
        : null,
      due_date: result.due_date,
      started_at: result.started_at,
      completed_at: result.completed_at,
      created_by: result.created_by,
      created_by_name: result.created_by_first_name && result.created_by_last_name
        ? `${result.created_by_first_name} ${result.created_by_last_name}`
        : '',
      created_at: result.created_at || new Date(),
      updated_at: result.updated_at || new Date(),
    }));
  }

  /**
   * Phase 2: Move work item to a new parent (reparent)
   */
  async moveWorkItem(
    workItemId: string,
    newParentId: string | null
  ): Promise<WorkItemWithDetails> {
    const startTime = Date.now();

    log.info('Work item move initiated', {
      workItemId,
      newParentId,
      requestingUserId: this.userContext.user_id,
    });

    // Check permission
    const canUpdateOwn = this.checker.hasPermission('work-items:update:own', workItemId);
    const canUpdateOrg = this.checker.hasPermission('work-items:update:organization');
    const canUpdateAll = this.checker.hasPermission('work-items:update:all');

    if (!canUpdateOwn && !canUpdateOrg && !canUpdateAll) {
      throw new PermissionDeniedError('work-items:update:*', workItemId);
    }

    // Get the work item being moved
    const workItem = await this.getWorkItemById(workItemId);
    if (!workItem) {
      throw new Error('Work item not found');
    }

    // Validate new parent if provided
    let newParent: WorkItemWithDetails | null = null;
    let newDepth = 0;
    let newRootId = workItemId;
    let newPath = `/${workItemId}`;

    if (newParentId) {
      newParent = await this.getWorkItemById(newParentId);
      if (!newParent) {
        throw new Error('Parent work item not found');
      }

      // Prevent circular references
      const parentPath = await db
        .select({ path: work_items.path })
        .from(work_items)
        .where(eq(work_items.work_item_id, newParentId))
        .limit(1);

      if (parentPath[0]?.path?.includes(`/${workItemId}/`)) {
        throw new Error('Cannot move work item to its own descendant');
      }

      // Get parent depth to calculate new depth
      const parentDepth = await db
        .select({ depth: work_items.depth, root_work_item_id: work_items.root_work_item_id, path: work_items.path })
        .from(work_items)
        .where(eq(work_items.work_item_id, newParentId))
        .limit(1);

      newDepth = (parentDepth[0]?.depth || 0) + 1;
      newRootId = parentDepth[0]?.root_work_item_id || newParentId;
      newPath = `${parentDepth[0]?.path || ''}/${workItemId}`;

      // Validate max depth (10 levels)
      if (newDepth > 10) {
        throw new Error('Maximum nesting depth of 10 levels exceeded');
      }
    }

    // Update the work item
    await db
      .update(work_items)
      .set({
        parent_work_item_id: newParentId,
        root_work_item_id: newRootId,
        depth: newDepth,
        path: newPath,
        updated_at: new Date(),
      })
      .where(eq(work_items.work_item_id, workItemId));

    // Update all descendants recursively
    await this.updateDescendantPaths(workItemId, newPath, newRootId);

    const duration = Date.now() - startTime;
    log.info('Work item moved successfully', {
      workItemId,
      newParentId,
      newDepth,
      duration,
    });

    await this.logPermissionCheck('work-items:update:move', workItemId);

    const updatedWorkItem = await this.getWorkItemById(workItemId);
    if (!updatedWorkItem) {
      throw new Error('Failed to retrieve moved work item');
    }

    return updatedWorkItem;
  }

  /**
   * Phase 2: Helper to update descendant paths when a work item is moved
   */
  private async updateDescendantPaths(
    workItemId: string,
    newParentPath: string,
    newRootId: string
  ): Promise<void> {
    // Get all descendants
    const descendants = await db
      .select({
        work_item_id: work_items.work_item_id,
        path: work_items.path,
        depth: work_items.depth,
      })
      .from(work_items)
      .where(like(work_items.path, `${newParentPath}/${workItemId}/%`));

    // Update each descendant
    for (const descendant of descendants) {
      const oldPath = descendant.path || '';
      const relativePath = oldPath.replace(new RegExp(`^.*/${workItemId}/`), '');
      const updatedPath = `${newParentPath}/${workItemId}/${relativePath}`;
      const updatedDepth = updatedPath.split('/').filter((id) => id).length - 1;

      await db
        .update(work_items)
        .set({
          path: updatedPath,
          depth: updatedDepth,
          root_work_item_id: newRootId,
          updated_at: new Date(),
        })
        .where(eq(work_items.work_item_id, descendant.work_item_id));
    }
  }

  /**
   * Get custom field values for work items
   * Phase 3: Retrieves field values and formats them as a key-value map
   */
  private async getCustomFieldValues(workItemIds: string[]): Promise<Map<string, Record<string, unknown>>> {
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
}

/**
 * Factory function to create RBACWorkItemsService
 */
export function createRBACWorkItemsService(userContext: UserContext): RBACWorkItemsService {
  return new RBACWorkItemsService(userContext);
}
