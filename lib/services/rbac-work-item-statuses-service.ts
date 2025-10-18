import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { work_item_statuses, work_item_types } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Work Item Statuses Service with RBAC
 * Manages work item statuses with automatic permission checking
 * Phase 4: Status management per work item type
 */

export interface WorkItemStatusWithDetails {
  work_item_status_id: string;
  work_item_type_id: string;
  status_name: string;
  status_category: string;
  is_initial: boolean;
  is_final: boolean;
  color: string | null;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export class RBACWorkItemStatusesService extends BaseRBACService {
  /**
   * Get statuses for a work item type
   * Validates organization access before returning statuses
   */
  async getStatusesByType(typeId: string): Promise<WorkItemStatusWithDetails[]> {
    const queryStart = Date.now();

    try {
      // Validate work item type exists and check organization access
      const [workItemType] = await db
        .select({ organization_id: work_item_types.organization_id })
        .from(work_item_types)
        .where(eq(work_item_types.work_item_type_id, typeId))
        .limit(1);

      if (!workItemType) {
        throw new Error('Work item type not found');
      }

      // Check organization access if type is organization-scoped
      if (workItemType.organization_id) {
        this.requireOrganizationAccess(workItemType.organization_id);
      }

      const results = await db
        .select({
          work_item_status_id: work_item_statuses.work_item_status_id,
          work_item_type_id: work_item_statuses.work_item_type_id,
          status_name: work_item_statuses.status_name,
          status_category: work_item_statuses.status_category,
          is_initial: work_item_statuses.is_initial,
          is_final: work_item_statuses.is_final,
          color: work_item_statuses.color,
          display_order: work_item_statuses.display_order,
          created_at: work_item_statuses.created_at,
          updated_at: work_item_statuses.updated_at,
        })
        .from(work_item_statuses)
        .where(eq(work_item_statuses.work_item_type_id, typeId))
        .orderBy(asc(work_item_statuses.display_order));

      log.info('Work item statuses retrieved', {
        typeId,
        count: results.length,
        duration: Date.now() - queryStart,
        organizationId: workItemType.organization_id,
      });

      return results;
    } catch (error) {
      log.error('Failed to retrieve work item statuses', error, { typeId });
      throw error;
    }
  }

  /**
   * Get status by ID
   * Validates organization access before returning status
   */
  async getStatusById(statusId: string): Promise<WorkItemStatusWithDetails | null> {
    try {
      const [result] = await db
        .select({
          work_item_status_id: work_item_statuses.work_item_status_id,
          work_item_type_id: work_item_statuses.work_item_type_id,
          status_name: work_item_statuses.status_name,
          status_category: work_item_statuses.status_category,
          is_initial: work_item_statuses.is_initial,
          is_final: work_item_statuses.is_final,
          color: work_item_statuses.color,
          display_order: work_item_statuses.display_order,
          created_at: work_item_statuses.created_at,
          updated_at: work_item_statuses.updated_at,
        })
        .from(work_item_statuses)
        .where(eq(work_item_statuses.work_item_status_id, statusId))
        .limit(1);

      if (!result) {
        return null;
      }

      // Validate organization access via the work item type
      const [workItemType] = await db
        .select({ organization_id: work_item_types.organization_id })
        .from(work_item_types)
        .where(eq(work_item_types.work_item_type_id, result.work_item_type_id))
        .limit(1);

      if (!workItemType) {
        throw new Error('Work item type not found');
      }

      // Check organization access if type is organization-scoped
      if (workItemType.organization_id) {
        this.requireOrganizationAccess(workItemType.organization_id);
      }

      return result;
    } catch (error) {
      log.error('Failed to retrieve work item status', error, { statusId });
      throw error;
    }
  }

  /**
   * Create a new work item status
   * Phase 4: Add statuses to work item types
   */
  async createStatus(data: {
    work_item_type_id: string;
    status_name: string;
    status_category: string;
    is_initial?: boolean;
    is_final?: boolean;
    color?: string;
    display_order?: number;
  }): Promise<WorkItemStatusWithDetails> {
    const startTime = Date.now();

    log.info('Work item status creation initiated', {
      requestingUserId: this.userContext.user_id,
      typeId: data.work_item_type_id,
      operation: 'create_work_item_status',
    });

    // Get the type to check organization access
    const [workItemType] = await db
      .select({ organization_id: work_item_types.organization_id })
      .from(work_item_types)
      .where(eq(work_item_types.work_item_type_id, data.work_item_type_id))
      .limit(1);

    if (!workItemType) {
      throw new Error('Work item type not found');
    }

    // Check permission - only for organization-owned types
    if (workItemType.organization_id) {
      this.requirePermission(
        'work-items:manage:organization',
        undefined,
        workItemType.organization_id
      );
      this.requireOrganizationAccess(workItemType.organization_id);
    } else {
      // Global types cannot be modified
      throw new Error('Cannot add statuses to global work item types');
    }

    try {
      const [newStatus] = await db
        .insert(work_item_statuses)
        .values({
          work_item_type_id: data.work_item_type_id,
          status_name: data.status_name,
          status_category: data.status_category,
          is_initial: data.is_initial ?? false,
          is_final: data.is_final ?? false,
          color: data.color || null,
          display_order: data.display_order ?? 0,
        })
        .returning();

      if (!newStatus) {
        throw new Error('Failed to create work item status');
      }

      log.info('Work item status created successfully', {
        statusId: newStatus.work_item_status_id,
        typeId: data.work_item_type_id,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
      });

      return {
        work_item_status_id: newStatus.work_item_status_id,
        work_item_type_id: newStatus.work_item_type_id,
        status_name: newStatus.status_name,
        status_category: newStatus.status_category,
        is_initial: newStatus.is_initial,
        is_final: newStatus.is_final,
        color: newStatus.color,
        display_order: newStatus.display_order,
        created_at: newStatus.created_at,
        updated_at: newStatus.updated_at,
      };
    } catch (error) {
      log.error('Failed to create work item status', error, {
        typeId: data.work_item_type_id,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Update a work item status
   * Phase 4: Modify status properties
   */
  async updateStatus(
    statusId: string,
    data: {
      status_name?: string;
      status_category?: string;
      is_initial?: boolean;
      is_final?: boolean;
      color?: string | null;
      display_order?: number;
    }
  ): Promise<WorkItemStatusWithDetails> {
    const startTime = Date.now();

    log.info('Work item status update initiated', {
      requestingUserId: this.userContext.user_id,
      statusId,
      operation: 'update_work_item_status',
    });

    // Get existing status and type to check permissions
    const existingStatus = await this.getStatusById(statusId);
    if (!existingStatus) {
      throw new Error('Work item status not found');
    }

    const [workItemType] = await db
      .select({ organization_id: work_item_types.organization_id })
      .from(work_item_types)
      .where(eq(work_item_types.work_item_type_id, existingStatus.work_item_type_id))
      .limit(1);

    if (!workItemType) {
      throw new Error('Work item type not found');
    }

    if (workItemType.organization_id) {
      this.requirePermission(
        'work-items:manage:organization',
        undefined,
        workItemType.organization_id
      );
      this.requireOrganizationAccess(workItemType.organization_id);
    } else {
      throw new Error('Cannot update statuses of global work item types');
    }

    try {
      await db
        .update(work_item_statuses)
        .set({
          ...data,
          updated_at: new Date(),
        })
        .where(eq(work_item_statuses.work_item_status_id, statusId));

      log.info('Work item status updated successfully', {
        statusId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
      });

      const updatedStatus = await this.getStatusById(statusId);
      if (!updatedStatus) {
        throw new Error('Failed to retrieve updated work item status');
      }

      return updatedStatus;
    } catch (error) {
      log.error('Failed to update work item status', error, {
        statusId,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Delete a work item status
   * Phase 4: Remove status if not in use
   */
  async deleteStatus(statusId: string): Promise<void> {
    const startTime = Date.now();

    log.info('Work item status deletion initiated', {
      requestingUserId: this.userContext.user_id,
      statusId,
      operation: 'delete_work_item_status',
    });

    const existingStatus = await this.getStatusById(statusId);
    if (!existingStatus) {
      throw new Error('Work item status not found');
    }

    const [workItemType] = await db
      .select({ organization_id: work_item_types.organization_id })
      .from(work_item_types)
      .where(eq(work_item_types.work_item_type_id, existingStatus.work_item_type_id))
      .limit(1);

    if (!workItemType) {
      throw new Error('Work item type not found');
    }

    if (workItemType.organization_id) {
      this.requirePermission(
        'work-items:manage:organization',
        undefined,
        workItemType.organization_id
      );
      this.requireOrganizationAccess(workItemType.organization_id);
    } else {
      throw new Error('Cannot delete statuses from global work item types');
    }

    // Check if any work items use this status
    const { work_items } = await import('@/lib/db/schema');
    const [workItemCount] = await db
      .select({ count: count() })
      .from(work_items)
      .where(and(eq(work_items.status_id, statusId), isNull(work_items.deleted_at)));

    if (!workItemCount) {
      throw new Error('Failed to check work item count');
    }

    if (workItemCount.count > 0) {
      throw new Error(
        `Cannot delete work item status with existing work items (${workItemCount.count} items found)`
      );
    }

    try {
      await db
        .delete(work_item_statuses)
        .where(eq(work_item_statuses.work_item_status_id, statusId));

      log.info('Work item status deleted successfully', {
        statusId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      log.error('Failed to delete work item status', error, {
        statusId,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }
}

/**
 * Factory function to create service instance
 */
export function createRBACWorkItemStatusesService(userContext: UserContext) {
  return new RBACWorkItemStatusesService(userContext);
}
