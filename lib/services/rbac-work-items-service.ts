import { and, asc, count, desc, eq, inArray, isNull, like, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  organizations,
  users,
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
  description?: string | null;
  priority?: string;
  assigned_to?: string | null;
  due_date?: Date | null;
}

export interface UpdateWorkItemData {
  subject?: string;
  description?: string | null;
  status_id?: string;
  priority?: string;
  assigned_to?: string | null;
  due_date?: Date | null;
  started_at?: Date | null;
  completed_at?: Date | null;
}

export interface WorkItemQueryOptions {
  work_item_type_id?: string;
  organization_id?: string;
  status_id?: string;
  status_category?: string;
  priority?: string;
  assigned_to?: string;
  created_by?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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
}

export class RBACWorkItemsService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext);
  }

  /**
   * Get work items with automatic permission-based filtering
   */
  async getWorkItems(options: WorkItemQueryOptions = {}): Promise<WorkItemWithDetails[]> {
    const startTime = Date.now();
    const accessScope = this.getAccessScope('work_items', 'read');

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
      whereConditions.push(
        or(
          like(work_items.subject, `%${options.search}%`),
          like(work_items.description, `%${options.search}%`)
        )!
      );
    }

    // Build sorting
    const sortBy = options.sortBy || 'created_at';
    const sortOrder = options.sortOrder || 'desc';
    const orderByClause =
      sortOrder === 'asc' ? asc(work_items[sortBy as keyof typeof work_items]) : desc(work_items[sortBy as keyof typeof work_items]);

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
    const canReadOwn = this.checker.hasPermission('work_items:read:own', workItemId);
    const canReadOrg = this.checker.hasPermission('work_items:read:organization');
    const canReadAll = this.checker.hasPermission('work_items:read:all');

    if (!canReadOwn && !canReadOrg && !canReadAll) {
      throw new PermissionDeniedError('work_items:read:*', workItemId);
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

    // Additional permission check for organization scope
    if (canReadOrg && !canReadAll) {
      if (!this.canAccessOrganization(workItem.organization_id)) {
        throw new PermissionDeniedError('work_items:read:organization', workItemId);
      }
    }

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

    // Check permission
    this.requirePermission('work_items:create:organization', undefined, workItemData.organization_id);
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
        created_by: this.userContext.user_id,
      })
      .returning();

    if (!newWorkItem) {
      throw new Error('Failed to create work item');
    }

    log.info('Work item created successfully', {
      workItemId: newWorkItem.work_item_id,
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
    });

    await this.logPermissionCheck('work_items:create:organization', newWorkItem.work_item_id, workItemData.organization_id);

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
    const canUpdateOwn = this.checker.hasPermission('work_items:update:own', workItemId);
    const canUpdateOrg = this.checker.hasPermission('work_items:update:organization');
    const canUpdateAll = this.checker.hasPermission('work_items:update:all');

    if (!canUpdateOwn && !canUpdateOrg && !canUpdateAll) {
      throw new PermissionDeniedError('work_items:update:*', workItemId);
    }

    // Verify organization access for org scope
    if (canUpdateOrg && !canUpdateAll) {
      const targetWorkItem = await this.getWorkItemById(workItemId);
      if (!targetWorkItem) {
        throw new Error('Work item not found');
      }
      if (!this.canAccessOrganization(targetWorkItem.organization_id)) {
        throw new PermissionDeniedError('work_items:update:organization', workItemId);
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

    await this.logPermissionCheck('work_items:update', workItemId);

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
    const canDeleteOwn = this.checker.hasPermission('work_items:delete:own', workItemId);
    const canDeleteOrg = this.checker.hasPermission('work_items:delete:organization');
    const canDeleteAll = this.checker.hasPermission('work_items:delete:all');

    if (!canDeleteOwn && !canDeleteOrg && !canDeleteAll) {
      throw new PermissionDeniedError('work_items:delete:*', workItemId);
    }

    // Verify organization access for org scope
    if (canDeleteOrg && !canDeleteAll) {
      const targetWorkItem = await this.getWorkItemById(workItemId);
      if (!targetWorkItem) {
        throw new Error('Work item not found');
      }
      if (!this.canAccessOrganization(targetWorkItem.organization_id)) {
        throw new PermissionDeniedError('work_items:delete:organization', workItemId);
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

    await this.logPermissionCheck('work_items:delete', workItemId);
  }

  /**
   * Get work item count
   */
  async getWorkItemCount(options: WorkItemQueryOptions = {}): Promise<number> {
    const accessScope = this.getAccessScope('work_items', 'read');
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
}

/**
 * Factory function to create RBACWorkItemsService
 */
export function createRBACWorkItemsService(userContext: UserContext): RBACWorkItemsService {
  return new RBACWorkItemsService(userContext);
}
