import type { InferSelectModel, SQL } from 'drizzle-orm';
import { and, eq } from 'drizzle-orm';

import { db, work_item_status_transitions, work_item_statuses, work_item_types } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors/domain-errors';
import { BaseCrudService, type BaseQueryOptions, type CrudServiceConfig } from '@/lib/services/crud';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Work Item Status Transitions Service with RBAC
 * Manages status transition rules with automatic permission checking
 *
 * Migrated to use BaseCrudService infrastructure.
 *
 * Special considerations:
 * - Transitions belong to work item types (parent resource)
 * - Global types (no organization_id) cannot be modified
 * - Must validate from/to statuses belong to the type
 */

// Entity type derived from Drizzle schema
export type WorkItemStatusTransition = InferSelectModel<typeof work_item_status_transitions>;

export interface TransitionQueryOptions extends BaseQueryOptions {
  work_item_type_id?: string;
  from_status_id?: string;
  to_status_id?: string;
}

export interface CreateTransitionData {
  work_item_type_id: string;
  from_status_id: string;
  to_status_id: string;
  is_allowed?: boolean;
}

export interface UpdateTransitionData {
  is_allowed?: boolean;
  validation_config?: unknown;
  action_config?: unknown;
}

/**
 * RBAC Work Item Status Transitions Service
 * Provides secure transition rule management with automatic permission checking
 */
export class RBACWorkItemStatusTransitionsService extends BaseCrudService<
  typeof work_item_status_transitions,
  WorkItemStatusTransition,
  CreateTransitionData,
  UpdateTransitionData,
  TransitionQueryOptions
> {
  protected config: CrudServiceConfig<
    typeof work_item_status_transitions,
    WorkItemStatusTransition,
    CreateTransitionData,
    UpdateTransitionData,
    TransitionQueryOptions
  > = {
    table: work_item_status_transitions,
    resourceName: 'work-item-status-transitions',
    displayName: 'status transition',
    primaryKeyName: 'work_item_status_transition_id',
    // No deletedAtColumnName - transitions use hard delete
    updatedAtColumnName: 'updated_at',
    permissions: {
      read: 'work-items:read:organization',
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
        from_status_id: data.from_status_id,
        to_status_id: data.to_status_id,
        is_allowed: data.is_allowed ?? true,
      }),
      toUpdateValues: (data) => {
        const values: Record<string, unknown> = {};
        if (data.is_allowed !== undefined) values.is_allowed = data.is_allowed;
        if (data.validation_config !== undefined) values.validation_config = data.validation_config;
        if (data.action_config !== undefined) values.action_config = data.action_config;
        return values;
      },
    },
    validators: {
      beforeCreate: async (data) => {
        await this.validateNotGlobalType(data.work_item_type_id);
        await this.validateStatusesBelongToType(
          data.work_item_type_id,
          data.from_status_id,
          data.to_status_id
        );
        await this.validateNoDuplicateTransition(
          data.work_item_type_id,
          data.from_status_id,
          data.to_status_id
        );
      },
      beforeUpdate: async (_id, _data, existing) => {
        await this.validateNotGlobalType(existing.work_item_type_id);
      },
      beforeDelete: async (_id, existing) => {
        await this.validateNotGlobalType(existing.work_item_type_id);
      },
    },
  };

  /**
   * Build custom filter conditions for type and status filtering.
   */
  protected buildCustomConditions(options: TransitionQueryOptions): SQL[] {
    const conditions: SQL[] = [];

    if (options.work_item_type_id) {
      conditions.push(
        eq(work_item_status_transitions.work_item_type_id, options.work_item_type_id)
      );
    }

    if (options.from_status_id) {
      conditions.push(eq(work_item_status_transitions.from_status_id, options.from_status_id));
    }

    if (options.to_status_id) {
      conditions.push(eq(work_item_status_transitions.to_status_id, options.to_status_id));
    }

    return conditions;
  }

  /**
   * Validate that the work item type is not global.
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
      throw new ForbiddenError('Cannot modify global work item types');
    }

    this.requireOrganizationAccess(workItemType.organization_id);
  }

  /**
   * Validate that from/to statuses belong to the type.
   */
  private async validateStatusesBelongToType(
    typeId: string,
    fromStatusId: string,
    toStatusId: string
  ): Promise<void> {
    const [fromStatus] = await db
      .select({ work_item_status_id: work_item_statuses.work_item_status_id })
      .from(work_item_statuses)
      .where(
        and(
          eq(work_item_statuses.work_item_status_id, fromStatusId),
          eq(work_item_statuses.work_item_type_id, typeId)
        )
      );

    if (!fromStatus) {
      throw new ValidationError('From status does not belong to this work item type');
    }

    const [toStatus] = await db
      .select({ work_item_status_id: work_item_statuses.work_item_status_id })
      .from(work_item_statuses)
      .where(
        and(
          eq(work_item_statuses.work_item_status_id, toStatusId),
          eq(work_item_statuses.work_item_type_id, typeId)
        )
      );

    if (!toStatus) {
      throw new ValidationError('To status does not belong to this work item type');
    }
  }

  /**
   * Validate that a transition doesn't already exist for this combination.
   */
  private async validateNoDuplicateTransition(
    typeId: string,
    fromStatusId: string,
    toStatusId: string
  ): Promise<void> {
    const [existing] = await db
      .select({
        work_item_status_transition_id: work_item_status_transitions.work_item_status_transition_id,
      })
      .from(work_item_status_transitions)
      .where(
        and(
          eq(work_item_status_transitions.work_item_type_id, typeId),
          eq(work_item_status_transitions.from_status_id, fromStatusId),
          eq(work_item_status_transitions.to_status_id, toStatusId)
        )
      );

    if (existing) {
      throw new ValidationError(
        'A transition rule already exists for this from/to status combination. Update or delete the existing rule instead.'
      );
    }
  }
}

/**
 * Factory function to create service with user context
 */
export function createRBACWorkItemStatusTransitionsService(userContext: UserContext) {
  return new RBACWorkItemStatusTransitionsService(userContext);
}
