import type { InferSelectModel, SQL } from 'drizzle-orm';
import { and, count, eq, isNull } from 'drizzle-orm';

import { db, work_item_statuses, work_item_types, work_items } from '@/lib/db';
import { ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors/domain-errors';
import { BaseCrudService, type BaseQueryOptions, type CrudServiceConfig } from '@/lib/services/crud';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Work Item Statuses Service with RBAC
 * Manages work item statuses with automatic permission checking
 *
 * Migrated to use BaseCrudService infrastructure.
 *
 * Special considerations:
 * - Statuses belong to work item types (parent resource)
 * - Global types (no organization_id) cannot be modified
 * - Organization access is validated through the parent type
 */

// Entity type derived from Drizzle schema
export type WorkItemStatus = InferSelectModel<typeof work_item_statuses>;

export interface StatusQueryOptions extends BaseQueryOptions {
  work_item_type_id?: string;
}

export interface CreateStatusData {
  work_item_type_id: string;
  status_name: string;
  status_category: string;
  is_initial?: boolean;
  is_final?: boolean;
  color?: string;
  display_order?: number;
}

export interface UpdateStatusData {
  status_name?: string;
  status_category?: string;
  is_initial?: boolean;
  is_final?: boolean;
  color?: string | null;
  display_order?: number;
}

/**
 * RBAC Work Item Statuses Service
 * Provides secure status management with automatic permission checking
 */
export class RBACWorkItemStatusesService extends BaseCrudService<
  typeof work_item_statuses,
  WorkItemStatus,
  CreateStatusData,
  UpdateStatusData,
  StatusQueryOptions
> {
  protected config: CrudServiceConfig<
    typeof work_item_statuses,
    WorkItemStatus,
    CreateStatusData,
    UpdateStatusData,
    StatusQueryOptions
  > = {
    table: work_item_statuses,
    resourceName: 'work-item-statuses',
    displayName: 'work item status',
    primaryKeyName: 'work_item_status_id',
    // No deletedAtColumnName - statuses use hard delete
    updatedAtColumnName: 'updated_at',
    permissions: {
      // Read is allowed for anyone with org access (validated via parent)
      read: 'work-items:read:organization',
      // Create/update/delete permissions are handled in validators
      // because they depend on whether the parent type is global
      create: 'work-items:manage:organization',
      update: 'work-items:manage:organization',
      delete: 'work-items:manage:organization',
    },
    parentResource: {
      table: work_item_types,
      foreignKeyColumnName: 'work_item_type_id',
      parentPrimaryKeyName: 'work_item_type_id',
      parentOrgColumnName: 'organization_id',
    },
    transformers: {
      toCreateValues: (data) => ({
        work_item_type_id: data.work_item_type_id,
        status_name: data.status_name,
        status_category: data.status_category,
        is_initial: data.is_initial ?? false,
        is_final: data.is_final ?? false,
        color: data.color ?? null,
        display_order: data.display_order ?? 0,
      }),
    },
    validators: {
      beforeCreate: async (data) => {
        await this.validateNotGlobalType(data.work_item_type_id);
      },
      beforeUpdate: async (_id, _data, existing) => {
        await this.validateNotGlobalType(existing.work_item_type_id);
      },
      beforeDelete: async (id, existing) => {
        await this.validateNotGlobalType(existing.work_item_type_id);
        await this.validateNoWorkItemsUsingStatus(String(id));
      },
    },
  };

  /**
   * Build custom filter conditions for type scoping.
   */
  protected buildCustomConditions(options: StatusQueryOptions): SQL[] {
    const conditions: SQL[] = [];

    if (options.work_item_type_id) {
      conditions.push(eq(work_item_statuses.work_item_type_id, options.work_item_type_id));
    }

    return conditions;
  }

  /**
   * Validate that the work item type is not global (has organization_id).
   * Global types cannot be modified.
   */
  private async validateNotGlobalType(typeId: string): Promise<void> {
    const [workItemType] = await db
      .select({ organization_id: work_item_types.organization_id })
      .from(work_item_types)
      .where(eq(work_item_types.work_item_type_id, typeId));

    if (!workItemType) {
      throw new NotFoundError('Work item type', typeId);
    }

    if (!workItemType.organization_id) {
      throw new ForbiddenError('Cannot modify statuses of global work item types');
    }

    // Verify user has access to this organization
    this.requireOrganizationAccess(workItemType.organization_id);
  }

  /**
   * Validate that no work items are using this status.
   */
  private async validateNoWorkItemsUsingStatus(statusId: string): Promise<void> {
    const [workItemCount] = await db
      .select({ count: count() })
      .from(work_items)
      .where(and(eq(work_items.status_id, statusId), isNull(work_items.deleted_at)));

    if (workItemCount && workItemCount.count > 0) {
      throw new ConflictError(
        `Cannot delete work item status with existing work items (${workItemCount.count} items found)`,
        'state_conflict',
        { workItemCount: workItemCount.count }
      );
    }
  }
}

/**
 * Factory function to create service instance
 */
export function createRBACWorkItemStatusesService(userContext: UserContext) {
  return new RBACWorkItemStatusesService(userContext);
}
