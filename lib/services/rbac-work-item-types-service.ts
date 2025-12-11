import { and, count, eq, isNull, or, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { organizations, users, work_item_types, work_items } from '@/lib/db/schema';
import { ConflictError, DatabaseError, ForbiddenError, NotFoundError } from '@/lib/errors/domain-errors';
import { log } from '@/lib/logger';
import { BaseCrudService, type CrudServiceConfig, type JoinQueryConfig } from '@/lib/services/crud';
import type { UserContext } from '@/lib/types/rbac';
import type {
  WorkItemTypeQueryOptions,
  WorkItemTypeWithDetails,
} from '@/lib/types/work-item-types';
import { formatUserName } from '@/lib/utils/user-formatters';

// Re-export types for consumers of this service
export type { WorkItemTypeQueryOptions, WorkItemTypeWithDetails };

/**
 * Work Item Types Service with RBAC
 * Manages work item types with automatic permission checking
 *
 * Migrated to use BaseCrudService infrastructure with JOIN support.
 */

// Create and update data types
interface CreateWorkItemTypeData {
  organization_id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_active?: boolean;
}

interface UpdateWorkItemTypeData {
  name?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  is_active?: boolean;
}

export class RBACWorkItemTypesService extends BaseCrudService<
  typeof work_item_types,
  WorkItemTypeWithDetails,
  CreateWorkItemTypeData,
  UpdateWorkItemTypeData,
  WorkItemTypeQueryOptions
> {
  protected config: CrudServiceConfig<
    typeof work_item_types,
    WorkItemTypeWithDetails,
    CreateWorkItemTypeData,
    UpdateWorkItemTypeData,
    WorkItemTypeQueryOptions
  > = {
    table: work_item_types,
    resourceName: 'work-items',
    displayName: 'work item type',
    primaryKeyName: 'work_item_type_id',
    deletedAtColumnName: 'deleted_at',
    updatedAtColumnName: 'updated_at',
    permissions: {
      read: 'work-items:read:organization',
      // Create/update/delete handled by custom methods due to complex permission logic
    },
    transformers: {
      toEntity: (row: Record<string, unknown>): WorkItemTypeWithDetails => ({
        work_item_type_id: row.work_item_type_id as string,
        organization_id: row.organization_id as string | null,
        organization_name: row.organization_name as string | null,
        name: row.name as string,
        description: row.description as string | null,
        icon: row.icon as string | null,
        color: row.color as string | null,
        is_active: row.is_active as boolean,
        created_by: row.created_by as string | null,
        created_by_name: formatUserName(
          row.created_by_first_name as string | null,
          row.created_by_last_name as string | null
        ),
        created_at: (row.created_at as Date) ?? new Date(),
        updated_at: (row.updated_at as Date) ?? new Date(),
      }),
      toCreateValues: (data, ctx) => ({
        organization_id: data.organization_id,
        name: data.name,
        description: data.description ?? null,
        icon: data.icon ?? null,
        color: data.color ?? null,
        is_active: data.is_active ?? true,
        created_by: ctx.user_id,
      }),
    },
  };

  /**
   * Build JOIN query for enriched work item type data
   */
  protected buildJoinQuery(): JoinQueryConfig {
    return {
      selectFields: {
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
      },
      joins: [
        {
          table: organizations,
          on: eq(work_item_types.organization_id, organizations.organization_id),
          type: 'left',
        },
        {
          table: users,
          on: eq(work_item_types.created_by, users.user_id),
          type: 'left',
        },
      ],
    };
  }

  /**
   * Build custom conditions for organization and is_active filtering
   * Work item types have special org logic: show global types (org_id = null) + org-specific types
   */
  protected buildCustomConditions(options: WorkItemTypeQueryOptions): SQL[] {
    const conditions: SQL[] = [];
    const { organization_id, is_active } = options;

    // Get access scope for custom org logic
    const accessScope = this.getAccessScope('work-items', 'read');

    // Complex organization filtering
    if (organization_id) {
      // Include both global types (null) and organization-specific types
      const orgCondition = or(
        isNull(work_item_types.organization_id),
        eq(work_item_types.organization_id, organization_id)
      );
      if (orgCondition) {
        conditions.push(orgCondition);
      }
    } else if (accessScope.scope === 'all' || this.isSuperAdmin()) {
      // Super admin or 'all' scope: show all work item types (no organization filter)
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

    // is_active filter
    if (is_active !== undefined) {
      conditions.push(eq(work_item_types.is_active, is_active));
    }

    return conditions;
  }

  // ===========================================================================
  // Public API Methods - Maintain backward compatibility
  // ===========================================================================

  /**
   * Get work item types with filtering and pagination.
   *
   * Includes both global types (organization_id = null) and organization-specific types.
   * Uses SQL-level sorting for performance.
   *
   * @param options - Query options (organization_id, is_active, limit, offset, sortField, sortOrder)
   * @returns Array of work item types with organization and creator details
   */
  async getWorkItemTypes(
    options: WorkItemTypeQueryOptions = {}
  ): Promise<WorkItemTypeWithDetails[]> {
    // Use SQL sorting by name for performance (instead of client-side sort)
    const result = await this.getList({
      ...options,
      sortField: options.sortField ?? 'name',
      sortOrder: options.sortOrder ?? 'asc',
    });
    return result.items;
  }

  /**
   * Get total count of work item types matching the filter options.
   *
   * @param options - Query options (organization_id, is_active)
   * @returns Total count of matching work item types
   */
  async getWorkItemTypeCount(options: WorkItemTypeQueryOptions = {}): Promise<number> {
    return this.getCount(options);
  }

  /**
   * Get a work item type by ID with organization and creator details.
   *
   * @param typeId - The work item type ID to retrieve
   * @returns The work item type entity with details, or null if not found
   */
  async getWorkItemTypeById(typeId: string): Promise<WorkItemTypeWithDetails | null> {
    return this.getById(typeId);
  }

  /**
   * Create a new work item type for an organization.
   *
   * Custom implementation required because permission checking depends on
   * organization_id provided in the input data.
   *
   * @param data - The work item type data (organization_id, name, description, icon, color)
   * @returns The created work item type with organization and creator details
   * @throws ForbiddenError if user doesn't have manage permission for the organization
   * @throws DatabaseError if creation fails
   */
  async createWorkItemType(data: CreateWorkItemTypeData): Promise<WorkItemTypeWithDetails> {
    const startTime = Date.now();

    log.info('Work item type creation initiated', {
      requestingUserId: this.userContext.user_id,
      organizationId: data.organization_id,
      operation: 'create_work_item_type',
    });

    // Check permission - using work-items:manage:organization
    this.requirePermission('work-items:manage:organization', undefined, data.organization_id);
    this.requireOrganizationAccess(data.organization_id);

    const [newType] = await db
      .insert(work_item_types)
      .values({
        organization_id: data.organization_id,
        name: data.name,
        description: data.description ?? null,
        icon: data.icon ?? null,
        color: data.color ?? null,
        is_active: data.is_active ?? true,
        created_by: this.userContext.user_id,
      })
      .returning();

    if (!newType) {
      throw new DatabaseError('Failed to create work item type', 'write');
    }

    log.info('Work item type created successfully', {
      workItemTypeId: newType.work_item_type_id,
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
    });

    // Return full details
    const typeWithDetails = await this.getWorkItemTypeById(newType.work_item_type_id);
    if (!typeWithDetails) {
      throw new DatabaseError('Failed to retrieve created work item type', 'read');
    }

    return typeWithDetails;
  }

  /**
   * Update a work item type.
   *
   * Custom implementation required because:
   * - Global types (organization_id = null) cannot be modified
   * - Permission checking depends on the existing entity's organization
   *
   * @param typeId - The work item type ID to update
   * @param data - The update data (name, description, icon, color, is_active)
   * @returns The updated work item type with organization and creator details
   * @throws NotFoundError if work item type not found
   * @throws ForbiddenError if attempting to update a global type or lacking permission
   * @throws DatabaseError if update fails
   */
  async updateWorkItemType(
    typeId: string,
    data: UpdateWorkItemTypeData
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
      throw new NotFoundError('Work item type', typeId);
    }

    if (!existingType.organization_id) {
      throw new ForbiddenError('Cannot update global work item types');
    }

    // Check permission
    this.requirePermission(
      'work-items:manage:organization',
      undefined,
      existingType.organization_id
    );
    this.requireOrganizationAccess(existingType.organization_id);

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
      throw new DatabaseError('Failed to retrieve updated work item type', 'read');
    }

    return updatedType;
  }

  /**
   * Delete a work item type (soft delete).
   *
   * Custom implementation required because:
   * - Global types require 'work-items:manage:all' permission
   * - Organization types require 'work-items:manage:organization' permission
   * - Cannot delete types that have existing work items
   *
   * @param typeId - The work item type ID to delete
   * @throws NotFoundError if work item type not found
   * @throws ForbiddenError if user lacks appropriate permission
   * @throws ConflictError if work items exist for this type
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
      throw new NotFoundError('Work item type', typeId);
    }

    // Check permission - for global types (no organization_id), require manage:all permission
    if (existingType.organization_id) {
      this.requirePermission(
        'work-items:manage:organization',
        undefined,
        existingType.organization_id
      );
      this.requireOrganizationAccess(existingType.organization_id);
    } else {
      // Global types require elevated permissions
      this.requirePermission('work-items:manage:all', undefined, undefined);
    }

    // Check if any work items exist for this type
    const [workItemCount] = await db
      .select({ count: count() })
      .from(work_items)
      .where(and(eq(work_items.work_item_type_id, typeId), isNull(work_items.deleted_at)));

    if (!workItemCount) {
      throw new DatabaseError('Failed to check work item count', 'read');
    }

    if (workItemCount.count > 0) {
      throw new ConflictError(
        `Cannot delete work item type with existing work items (${workItemCount.count} items found)`,
        'state_conflict',
        { workItemCount: workItemCount.count }
      );
    }

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
  }
}

/**
 * Factory function to create service instance
 */
export function createRBACWorkItemTypesService(userContext: UserContext) {
  return new RBACWorkItemTypesService(userContext);
}
