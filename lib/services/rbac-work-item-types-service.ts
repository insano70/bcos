import { and, asc, count, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations, users, work_item_types } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Work Item Types Service with RBAC
 * Manages work item types with automatic permission checking
 */

export interface WorkItemTypeQueryOptions {
  organization_id?: string | undefined;
  is_active?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface WorkItemTypeWithDetails {
  work_item_type_id: string;
  organization_id: string | null;
  organization_name: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export class RBACWorkItemTypesService extends BaseRBACService {
  /**
   * Get work item types with filtering
   * Returns global types (organization_id = null) and organization-specific types
   */
  async getWorkItemTypes(
    options: WorkItemTypeQueryOptions = {}
  ): Promise<WorkItemTypeWithDetails[]> {
    const { organization_id, is_active, limit = 50, offset = 0 } = options;

    const queryStart = Date.now();

    try {
      // Build WHERE conditions
      const conditions = [isNull(work_item_types.deleted_at)];

      // Filter by organization_id or include global types
      if (organization_id) {
        // Include both global types (null) and organization-specific types
        const orgCondition = or(
          isNull(work_item_types.organization_id),
          eq(work_item_types.organization_id, organization_id)
        );
        if (orgCondition) {
          conditions.push(orgCondition);
        }
      } else if (this.userContext.current_organization_id) {
        // If no org filter but user has current org, show global + current org types
        const orgCondition = or(
          isNull(work_item_types.organization_id),
          eq(work_item_types.organization_id, this.userContext.current_organization_id)
        );
        if (orgCondition) {
          conditions.push(orgCondition);
        }
      } else {
        // Otherwise, only show global types
        conditions.push(isNull(work_item_types.organization_id));
      }

      if (is_active !== undefined) {
        conditions.push(eq(work_item_types.is_active, is_active));
      }

      // Execute query with joins
      const results = await db
        .select({
          work_item_type_id: work_item_types.work_item_type_id,
          organization_id: work_item_types.organization_id,
          organization_name: organizations.name,
          name: work_item_types.name,
          description: work_item_types.description,
          icon: work_item_types.icon,
          color: work_item_types.color,
          is_active: work_item_types.is_active,
          created_by: work_item_types.created_by,
          created_by_first_name: users.first_name,
          created_by_last_name: users.last_name,
          created_at: work_item_types.created_at,
          updated_at: work_item_types.updated_at,
        })
        .from(work_item_types)
        .leftJoin(organizations, eq(work_item_types.organization_id, organizations.organization_id))
        .leftJoin(users, eq(work_item_types.created_by, users.user_id))
        .where(and(...conditions))
        .orderBy(asc(work_item_types.name))
        .limit(limit)
        .offset(offset);

      log.info('Work item types retrieved', {
        count: results.length,
        duration: Date.now() - queryStart,
      });

      return results.map((row) => ({
        work_item_type_id: row.work_item_type_id,
        organization_id: row.organization_id,
        organization_name: row.organization_name,
        name: row.name,
        description: row.description,
        icon: row.icon,
        color: row.color,
        is_active: row.is_active,
        created_by: row.created_by,
        created_by_name:
          row.created_by_first_name && row.created_by_last_name
            ? `${row.created_by_first_name} ${row.created_by_last_name}`
            : null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    } catch (error) {
      log.error('Failed to retrieve work item types', error);
      throw error;
    }
  }

  /**
   * Get total count of work item types
   */
  async getWorkItemTypeCount(options: WorkItemTypeQueryOptions = {}): Promise<number> {
    const { organization_id, is_active } = options;

    try {
      const conditions = [isNull(work_item_types.deleted_at)];

      if (organization_id) {
        const orgCondition = or(
          isNull(work_item_types.organization_id),
          eq(work_item_types.organization_id, organization_id)
        );
        if (orgCondition) {
          conditions.push(orgCondition);
        }
      } else if (this.userContext.current_organization_id) {
        const orgCondition = or(
          isNull(work_item_types.organization_id),
          eq(work_item_types.organization_id, this.userContext.current_organization_id)
        );
        if (orgCondition) {
          conditions.push(orgCondition);
        }
      } else {
        conditions.push(isNull(work_item_types.organization_id));
      }

      if (is_active !== undefined) {
        conditions.push(eq(work_item_types.is_active, is_active));
      }

      const [result] = await db
        .select({ count: count() })
        .from(work_item_types)
        .where(and(...conditions));

      return result?.count || 0;
    } catch (error) {
      log.error('Failed to count work item types', error);
      throw error;
    }
  }

  /**
   * Get work item type by ID
   */
  async getWorkItemTypeById(typeId: string): Promise<WorkItemTypeWithDetails | null> {
    try {
      const results = await db
        .select({
          work_item_type_id: work_item_types.work_item_type_id,
          organization_id: work_item_types.organization_id,
          organization_name: organizations.name,
          name: work_item_types.name,
          description: work_item_types.description,
          icon: work_item_types.icon,
          color: work_item_types.color,
          is_active: work_item_types.is_active,
          created_by: work_item_types.created_by,
          created_by_first_name: users.first_name,
          created_by_last_name: users.last_name,
          created_at: work_item_types.created_at,
          updated_at: work_item_types.updated_at,
        })
        .from(work_item_types)
        .leftJoin(organizations, eq(work_item_types.organization_id, organizations.organization_id))
        .leftJoin(users, eq(work_item_types.created_by, users.user_id))
        .where(
          and(eq(work_item_types.work_item_type_id, typeId), isNull(work_item_types.deleted_at))
        )
        .limit(1);

      const row = results[0];
      if (!row) {
        return null;
      }

      return {
        work_item_type_id: row.work_item_type_id,
        organization_id: row.organization_id,
        organization_name: row.organization_name,
        name: row.name,
        description: row.description,
        icon: row.icon,
        color: row.color,
        is_active: row.is_active,
        created_by: row.created_by,
        created_by_name:
          row.created_by_first_name && row.created_by_last_name
            ? `${row.created_by_first_name} ${row.created_by_last_name}`
            : null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    } catch (error) {
      log.error('Failed to retrieve work item type', error, { typeId });
      throw error;
    }
  }

  /**
   * Create a new work item type
   * Phase 4: Make work item types user-configurable
   */
  async createWorkItemType(data: {
    organization_id: string;
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    is_active?: boolean;
  }): Promise<WorkItemTypeWithDetails> {
    const startTime = Date.now();

    log.info('Work item type creation initiated', {
      requestingUserId: this.userContext.user_id,
      organizationId: data.organization_id,
      operation: 'create_work_item_type',
    });

    // Check permission - using work-items:manage:organization
    this.requirePermission('work-items:manage:organization', undefined, data.organization_id);
    this.requireOrganizationAccess(data.organization_id);

    try {
      const [newType] = await db
        .insert(work_item_types)
        .values({
          organization_id: data.organization_id,
          name: data.name,
          description: data.description || null,
          icon: data.icon || null,
          color: data.color || null,
          is_active: data.is_active ?? true,
          created_by: this.userContext.user_id,
        })
        .returning();

      if (!newType) {
        throw new Error('Failed to create work item type');
      }

      log.info('Work item type created successfully', {
        workItemTypeId: newType.work_item_type_id,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
      });

      // Return full details
      const typeWithDetails = await this.getWorkItemTypeById(newType.work_item_type_id);
      if (!typeWithDetails) {
        throw new Error('Failed to retrieve created work item type');
      }

      return typeWithDetails;
    } catch (error) {
      log.error('Failed to create work item type', error, {
        organizationId: data.organization_id,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Update a work item type
   * Phase 4: Make work item types user-configurable
   */
  async updateWorkItemType(
    typeId: string,
    data: {
      name?: string;
      description?: string | null;
      icon?: string | null;
      color?: string | null;
      is_active?: boolean;
    }
  ): Promise<WorkItemTypeWithDetails> {
    const startTime = Date.now();

    log.info('Work item type update initiated', {
      requestingUserId: this.userContext.user_id,
      typeId,
      operation: 'update_work_item_type',
    });

    // Get existing type to check organization
    const existingType = await this.getWorkItemTypeById(typeId);
    if (!existingType) {
      throw new Error('Work item type not found');
    }

    if (!existingType.organization_id) {
      throw new Error('Cannot update global work item types');
    }

    // Check permission
    this.requirePermission(
      'work-items:manage:organization',
      undefined,
      existingType.organization_id
    );
    this.requireOrganizationAccess(existingType.organization_id);

    try {
      await db
        .update(work_item_types)
        .set({
          ...data,
          updated_at: new Date(),
        })
        .where(eq(work_item_types.work_item_type_id, typeId));

      log.info('Work item type updated successfully', {
        typeId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
      });

      // Return updated details
      const updatedType = await this.getWorkItemTypeById(typeId);
      if (!updatedType) {
        throw new Error('Failed to retrieve updated work item type');
      }

      return updatedType;
    } catch (error) {
      log.error('Failed to update work item type', error, {
        typeId,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Delete (soft delete) a work item type
   * Phase 4: Make work item types user-configurable
   * Only allowed if no work items exist for this type
   */
  async deleteWorkItemType(typeId: string): Promise<void> {
    const startTime = Date.now();

    log.info('Work item type deletion initiated', {
      requestingUserId: this.userContext.user_id,
      typeId,
      operation: 'delete_work_item_type',
    });

    // Get existing type to check organization
    const existingType = await this.getWorkItemTypeById(typeId);
    if (!existingType) {
      throw new Error('Work item type not found');
    }

    if (!existingType.organization_id) {
      throw new Error('Cannot delete global work item types');
    }

    // Check permission
    this.requirePermission(
      'work-items:manage:organization',
      undefined,
      existingType.organization_id
    );
    this.requireOrganizationAccess(existingType.organization_id);

    // Check if any work items exist for this type
    const { work_items } = await import('@/lib/db/schema');
    const [workItemCount] = await db
      .select({ count: count() })
      .from(work_items)
      .where(
        and(eq(work_items.work_item_type_id, typeId), isNull(work_items.deleted_at))
      );

    if (!workItemCount) {
      throw new Error('Failed to check work item count');
    }

    if (workItemCount.count > 0) {
      throw new Error(
        `Cannot delete work item type with existing work items (${workItemCount.count} items found)`
      );
    }

    try {
      // Soft delete
      await db
        .update(work_item_types)
        .set({
          deleted_at: new Date(),
        })
        .where(eq(work_item_types.work_item_type_id, typeId));

      log.info('Work item type deleted successfully', {
        typeId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      log.error('Failed to delete work item type', error, {
        typeId,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }
}

/**
 * Factory function to create service instance
 */
export function createRBACWorkItemTypesService(userContext: UserContext) {
  return new RBACWorkItemTypesService(userContext);
}
