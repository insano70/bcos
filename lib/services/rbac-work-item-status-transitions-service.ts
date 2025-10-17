import { and, eq } from 'drizzle-orm';
import { AuthorizationError, NotFoundError, ValidationError } from '@/lib/api/responses/error';
import { db } from '@/lib/db';
import { work_item_status_transitions, work_item_statuses, work_item_types } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Work Item Status Transitions Service with RBAC
 * Manages status transition rules with automatic permission checking
 * Phase 4: Status workflow configuration per work item type
 */

export interface WorkItemStatusTransitionWithDetails {
  work_item_status_transition_id: string;
  work_item_type_id: string;
  from_status_id: string;
  to_status_id: string;
  is_allowed: boolean;
  validation_config: unknown | null;
  action_config: unknown | null;
  created_at: Date;
  updated_at: Date;
}

export class RBACWorkItemStatusTransitionsService extends BaseRBACService {
  /**
   * Get all transitions for a work item type
   */
  async getTransitionsByType(
    typeId: string,
    filters?: { from_status_id?: string; to_status_id?: string }
  ): Promise<WorkItemStatusTransitionWithDetails[]> {
    const queryStart = Date.now();

    try {
      const conditions = [eq(work_item_status_transitions.work_item_type_id, typeId)];

      if (filters?.from_status_id) {
        conditions.push(eq(work_item_status_transitions.from_status_id, filters.from_status_id));
      }

      if (filters?.to_status_id) {
        conditions.push(eq(work_item_status_transitions.to_status_id, filters.to_status_id));
      }

      const results = await db
        .select({
          work_item_status_transition_id:
            work_item_status_transitions.work_item_status_transition_id,
          work_item_type_id: work_item_status_transitions.work_item_type_id,
          from_status_id: work_item_status_transitions.from_status_id,
          to_status_id: work_item_status_transitions.to_status_id,
          is_allowed: work_item_status_transitions.is_allowed,
          validation_config: work_item_status_transitions.validation_config,
          action_config: work_item_status_transitions.action_config,
          created_at: work_item_status_transitions.created_at,
          updated_at: work_item_status_transitions.updated_at,
        })
        .from(work_item_status_transitions)
        .where(and(...conditions));

      const duration = Date.now() - queryStart;
      log.info(`Retrieved ${results.length} transitions for type ${typeId}`, {
        typeId,
        filters,
        count: results.length,
        duration,
      });

      return results;
    } catch (error) {
      const duration = Date.now() - queryStart;
      log.error(`Failed to retrieve transitions for type ${typeId}`, error, {
        typeId,
        filters,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });
      throw error;
    }
  }

  /**
   * Get a single transition by ID
   */
  async getTransitionById(
    transitionId: string
  ): Promise<WorkItemStatusTransitionWithDetails | null> {
    const queryStart = Date.now();

    try {
      const results = await db
        .select({
          work_item_status_transition_id:
            work_item_status_transitions.work_item_status_transition_id,
          work_item_type_id: work_item_status_transitions.work_item_type_id,
          from_status_id: work_item_status_transitions.from_status_id,
          to_status_id: work_item_status_transitions.to_status_id,
          is_allowed: work_item_status_transitions.is_allowed,
          validation_config: work_item_status_transitions.validation_config,
          action_config: work_item_status_transitions.action_config,
          created_at: work_item_status_transitions.created_at,
          updated_at: work_item_status_transitions.updated_at,
        })
        .from(work_item_status_transitions)
        .where(eq(work_item_status_transitions.work_item_status_transition_id, transitionId))
        .limit(1);

      const duration = Date.now() - queryStart;
      const found = results.length > 0;

      log.info(`Retrieved transition ${transitionId}`, {
        transitionId,
        found,
        duration,
      });

      return found && results[0] ? results[0] : null;
    } catch (error) {
      const duration = Date.now() - queryStart;
      log.error(`Failed to retrieve transition ${transitionId}`, error, {
        transitionId,
        duration,
      });
      throw error;
    }
  }

  /**
   * Create a status transition rule
   */
  async createTransition(data: {
    work_item_type_id: string;
    from_status_id: string;
    to_status_id: string;
    is_allowed?: boolean;
  }): Promise<WorkItemStatusTransitionWithDetails> {
    const queryStart = Date.now();

    try {
      // Check permission
      this.requirePermission('work-items:manage:organization');

      // Get the work item type to check organization ownership
      const typeResults = await db
        .select({
          work_item_type_id: work_item_types.work_item_type_id,
          organization_id: work_item_types.organization_id,
        })
        .from(work_item_types)
        .where(eq(work_item_types.work_item_type_id, data.work_item_type_id))
        .limit(1);

      if (typeResults.length === 0) {
        throw NotFoundError('Work item type');
      }

      const type = typeResults[0];
      if (!type) {
        throw NotFoundError('Work item type');
      }

      // Prevent creating transitions for global types
      if (type.organization_id === null) {
        throw AuthorizationError('Cannot modify global work item types');
      }

      // Verify user has access to the organization
      if (!this.canAccessOrganization(type.organization_id)) {
        throw AuthorizationError('Access denied to this organization');
      }

      // Verify both statuses exist and belong to this type
      const fromStatusResults = await db
        .select({ work_item_status_id: work_item_statuses.work_item_status_id })
        .from(work_item_statuses)
        .where(
          and(
            eq(work_item_statuses.work_item_status_id, data.from_status_id),
            eq(work_item_statuses.work_item_type_id, data.work_item_type_id)
          )
        )
        .limit(1);

      if (fromStatusResults.length === 0) {
        throw ValidationError(
          'From status does not belong to this work item type',
          data.from_status_id
        );
      }

      const toStatusResults = await db
        .select({ work_item_status_id: work_item_statuses.work_item_status_id })
        .from(work_item_statuses)
        .where(
          and(
            eq(work_item_statuses.work_item_status_id, data.to_status_id),
            eq(work_item_statuses.work_item_type_id, data.work_item_type_id)
          )
        )
        .limit(1);

      if (toStatusResults.length === 0) {
        throw ValidationError(
          'To status does not belong to this work item type',
          data.to_status_id
        );
      }

      // Create the transition
      const results = await db
        .insert(work_item_status_transitions)
        .values({
          work_item_type_id: data.work_item_type_id,
          from_status_id: data.from_status_id,
          to_status_id: data.to_status_id,
          is_allowed: data.is_allowed ?? true,
        })
        .returning();

      const result = results[0];
      if (!result) {
        throw new Error('Failed to create transition');
      }

      const duration = Date.now() - queryStart;
      log.info(`Created status transition`, {
        transitionId: result.work_item_status_transition_id,
        typeId: data.work_item_type_id,
        fromStatusId: data.from_status_id,
        toStatusId: data.to_status_id,
        isAllowed: data.is_allowed ?? true,
        organizationId: type.organization_id,
        userId: this.userContext.user_id,
        duration,
      });

      return {
        ...result,
        validation_config: result.validation_config ?? null,
        action_config: result.action_config ?? null,
      };
    } catch (error) {
      const duration = Date.now() - queryStart;
      log.error(`Failed to create status transition`, error, {
        data,
        userId: this.userContext.user_id,
        duration,
      });
      throw error;
    }
  }

  /**
   * Update a status transition rule
   */
  async updateTransition(
    transitionId: string,
    data: {
      is_allowed?: boolean;
      validation_config?: unknown;
      action_config?: unknown;
    }
  ): Promise<WorkItemStatusTransitionWithDetails> {
    const queryStart = Date.now();

    try {
      // Check permission
      this.requirePermission('work-items:manage:organization');

      // Get the transition and verify it exists
      const existingTransition = await this.getTransitionById(transitionId);
      if (!existingTransition) {
        throw NotFoundError('Status transition');
      }

      // Get the work item type to check organization ownership
      const typeResults = await db
        .select({
          work_item_type_id: work_item_types.work_item_type_id,
          organization_id: work_item_types.organization_id,
        })
        .from(work_item_types)
        .where(eq(work_item_types.work_item_type_id, existingTransition.work_item_type_id))
        .limit(1);

      if (typeResults.length === 0) {
        throw NotFoundError('Work item type');
      }

      const type = typeResults[0];
      if (!type) {
        throw NotFoundError('Work item type');
      }

      // Prevent updating transitions for global types
      if (type.organization_id === null) {
        throw AuthorizationError('Cannot modify global work item types');
      }

      // Verify user has access to the organization
      if (!this.canAccessOrganization(type.organization_id)) {
        throw AuthorizationError('Access denied to this organization');
      }

      // Update the transition
      const updateData: {
        is_allowed?: boolean;
        validation_config?: unknown;
        action_config?: unknown;
        updated_at: Date;
      } = {
        updated_at: new Date(),
      };

      if (data.is_allowed !== undefined) {
        updateData.is_allowed = data.is_allowed;
      }
      if (data.validation_config !== undefined) {
        updateData.validation_config = data.validation_config;
      }
      if (data.action_config !== undefined) {
        updateData.action_config = data.action_config;
      }

      const results = await db
        .update(work_item_status_transitions)
        .set(updateData)
        .where(eq(work_item_status_transitions.work_item_status_transition_id, transitionId))
        .returning();

      const result = results[0];
      if (!result) {
        throw new Error('Failed to update transition');
      }

      const duration = Date.now() - queryStart;
      log.info(`Updated status transition ${transitionId}`, {
        transitionId,
        updates: data,
        organizationId: type.organization_id,
        userId: this.userContext.user_id,
        duration,
      });

      return {
        ...result,
        validation_config: result.validation_config ?? null,
        action_config: result.action_config ?? null,
      };
    } catch (error) {
      const duration = Date.now() - queryStart;
      log.error(`Failed to update status transition ${transitionId}`, error, {
        transitionId,
        data,
        userId: this.userContext.user_id,
        duration,
      });
      throw error;
    }
  }

  /**
   * Delete a status transition rule
   */
  async deleteTransition(transitionId: string): Promise<void> {
    const queryStart = Date.now();

    try {
      // Check permission
      this.requirePermission('work-items:manage:organization');

      // Get the transition and verify it exists
      const existingTransition = await this.getTransitionById(transitionId);
      if (!existingTransition) {
        throw NotFoundError('Status transition');
      }

      // Get the work item type to check organization ownership
      const typeResults = await db
        .select({
          work_item_type_id: work_item_types.work_item_type_id,
          organization_id: work_item_types.organization_id,
        })
        .from(work_item_types)
        .where(eq(work_item_types.work_item_type_id, existingTransition.work_item_type_id))
        .limit(1);

      if (typeResults.length === 0) {
        throw NotFoundError('Work item type');
      }

      const type = typeResults[0];
      if (!type) {
        throw NotFoundError('Work item type');
      }

      // Prevent deleting transitions from global types
      if (type.organization_id === null) {
        throw AuthorizationError('Cannot modify global work item types');
      }

      // Verify user has access to the organization
      if (!this.canAccessOrganization(type.organization_id)) {
        throw AuthorizationError('Access denied to this organization');
      }

      // Delete the transition
      await db
        .delete(work_item_status_transitions)
        .where(eq(work_item_status_transitions.work_item_status_transition_id, transitionId));

      const duration = Date.now() - queryStart;
      log.info(`Deleted status transition ${transitionId}`, {
        transitionId,
        organizationId: type.organization_id,
        userId: this.userContext.user_id,
        duration,
      });
    } catch (error) {
      const duration = Date.now() - queryStart;
      log.error(`Failed to delete status transition ${transitionId}`, error, {
        transitionId,
        userId: this.userContext.user_id,
        duration,
      });
      throw error;
    }
  }
}

/**
 * Factory function to create service with user context
 */
export function createRBACWorkItemStatusTransitionsService(userContext: UserContext) {
  return new RBACWorkItemStatusTransitionsService(userContext);
}
