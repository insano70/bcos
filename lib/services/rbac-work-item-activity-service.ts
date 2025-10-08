import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, work_item_activity, work_items } from '@/lib/db/schema';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { PermissionDeniedError } from '@/lib/types/rbac';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * Work Item Activity Service with RBAC
 * Phase 2: Manages activity/audit log for work items
 */

export interface CreateWorkItemActivityData {
  work_item_id: string;
  activity_type: string;
  field_name?: string | null | undefined;
  old_value?: string | null | undefined;
  new_value?: string | null | undefined;
  description?: string | null | undefined;
}

export interface WorkItemActivityQueryOptions {
  work_item_id: string;
  activity_type?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface WorkItemActivityWithDetails {
  work_item_activity_id: string;
  work_item_id: string;
  user_id: string;
  user_name: string;
  activity_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  description: string | null;
  created_at: Date;
}

export class RBACWorkItemActivityService extends BaseRBACService {
  /**
   * Get activity log for a work item with permission checking
   */
  async getActivity(options: WorkItemActivityQueryOptions): Promise<WorkItemActivityWithDetails[]> {
    const startTime = Date.now();

    log.info('Work item activity query initiated', {
      workItemId: options.work_item_id,
      requestingUserId: this.userContext.user_id,
    });

    // First verify user has permission to read the work item
    const canReadWorkItem = await this.canReadWorkItem(options.work_item_id);
    if (!canReadWorkItem) {
      throw new PermissionDeniedError('work-items:read:*', options.work_item_id);
    }

    // Build where conditions
    const whereConditions = [eq(work_item_activity.work_item_id, options.work_item_id)];

    if (options.activity_type) {
      whereConditions.push(eq(work_item_activity.activity_type, options.activity_type));
    }

    // Fetch activity log
    const results = await db
      .select({
        work_item_activity_id: work_item_activity.work_item_activity_id,
        work_item_id: work_item_activity.work_item_id,
        activity_type: work_item_activity.activity_type,
        field_name: work_item_activity.field_name,
        old_value: work_item_activity.old_value,
        new_value: work_item_activity.new_value,
        description: work_item_activity.description,
        created_by: work_item_activity.created_by,
        created_by_first_name: users.first_name,
        created_by_last_name: users.last_name,
        created_at: work_item_activity.created_at,
      })
      .from(work_item_activity)
      .leftJoin(users, eq(work_item_activity.created_by, users.user_id))
      .where(and(...whereConditions))
      .orderBy(desc(work_item_activity.created_at))
      .limit(options.limit || 50)
      .offset(options.offset || 0);

    const duration = Date.now() - startTime;
    log.info('Work item activity query completed', {
      workItemId: options.work_item_id,
      activityCount: results.length,
      duration,
    });

    return results.map((result) => ({
      work_item_activity_id: result.work_item_activity_id,
      work_item_id: result.work_item_id,
      user_id: result.created_by,
      user_name:
        result.created_by_first_name && result.created_by_last_name
          ? `${result.created_by_first_name} ${result.created_by_last_name}`
          : '',
      activity_type: result.activity_type,
      field_name: result.field_name,
      old_value: result.old_value,
      new_value: result.new_value,
      description: result.description,
      created_at: result.created_at || new Date(),
    }));
  }

  /**
   * Create new activity log entry
   * This is typically called internally by other services, not directly via API
   */
  async createActivity(activityData: CreateWorkItemActivityData): Promise<WorkItemActivityWithDetails> {
    const startTime = Date.now();

    log.info('Work item activity creation initiated', {
      workItemId: activityData.work_item_id,
      activityType: activityData.activity_type,
      requestingUserId: this.userContext.user_id,
    });

    // Create activity log entry
    const [newActivity] = await db
      .insert(work_item_activity)
      .values({
        work_item_id: activityData.work_item_id,
        activity_type: activityData.activity_type,
        field_name: activityData.field_name || null,
        old_value: activityData.old_value || null,
        new_value: activityData.new_value || null,
        description: activityData.description || null,
        created_by: this.userContext.user_id,
      })
      .returning();

    if (!newActivity) {
      throw new Error('Failed to create activity log entry');
    }

    log.info('Work item activity created successfully', {
      activityId: newActivity.work_item_activity_id,
      workItemId: activityData.work_item_id,
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
    });

    // Fetch and return the created activity with details
    const activities = await this.getActivity({
      work_item_id: activityData.work_item_id,
      limit: 1,
      offset: 0,
    });

    const firstActivity = activities[0];
    if (!firstActivity) {
      throw new Error('Failed to retrieve created activity');
    }

    return firstActivity;
  }

  /**
   * Helper: Log a work item change
   * Convenience method for logging field changes
   */
  async logChange(
    workItemId: string,
    fieldName: string,
    oldValue: string | null,
    newValue: string | null,
    description?: string
  ): Promise<void> {
    await this.createActivity({
      work_item_id: workItemId,
      activity_type: 'field_changed',
      field_name: fieldName,
      old_value: oldValue,
      new_value: newValue,
      description: description || `Changed ${fieldName} from "${oldValue}" to "${newValue}"`,
    });
  }

  /**
   * Helper: Log a work item status change
   */
  async logStatusChange(
    workItemId: string,
    oldStatus: string,
    newStatus: string
  ): Promise<void> {
    await this.createActivity({
      work_item_id: workItemId,
      activity_type: 'status_changed',
      field_name: 'status',
      old_value: oldStatus,
      new_value: newStatus,
      description: `Status changed from "${oldStatus}" to "${newStatus}"`,
    });
  }

  /**
   * Helper: Log a work item assignment
   */
  async logAssignment(
    workItemId: string,
    oldAssignee: string | null,
    newAssignee: string | null
  ): Promise<void> {
    await this.createActivity({
      work_item_id: workItemId,
      activity_type: 'assigned',
      field_name: 'assigned_to',
      old_value: oldAssignee,
      new_value: newAssignee,
      description: newAssignee
        ? `Assigned to ${newAssignee}`
        : 'Unassigned',
    });
  }

  /**
   * Helper: Log work item creation
   */
  async logCreation(workItemId: string): Promise<void> {
    await this.createActivity({
      work_item_id: workItemId,
      activity_type: 'created',
      description: 'Work item created',
    });
  }

  /**
   * Helper: Log work item deletion
   */
  async logDeletion(workItemId: string): Promise<void> {
    await this.createActivity({
      work_item_id: workItemId,
      activity_type: 'deleted',
      description: 'Work item deleted',
    });
  }

  /**
   * Helper: Check if user can read a work item
   */
  private async canReadWorkItem(workItemId: string): Promise<boolean> {
    const accessScope = this.getAccessScope('work-items', 'read');

    // Get the work item to check organization
    const [workItem] = await db
      .select({
        organization_id: work_items.organization_id,
        created_by: work_items.created_by,
      })
      .from(work_items)
      .where(and(eq(work_items.work_item_id, workItemId), isNull(work_items.deleted_at)))
      .limit(1);

    if (!workItem) {
      return false;
    }

    switch (accessScope.scope) {
      case 'own':
        return workItem.created_by === this.userContext.user_id;

      case 'organization': {
        const accessibleOrgIds = accessScope.organizationIds || [];
        return accessibleOrgIds.includes(workItem.organization_id);
      }

      case 'all':
        return true;

      default:
        return false;
    }
  }
}

/**
 * Factory function to create RBACWorkItemActivityService
 */
export function createRBACWorkItemActivityService(
  userContext: UserContext
): RBACWorkItemActivityService {
  return new RBACWorkItemActivityService(userContext);
}
