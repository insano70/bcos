// 1. Drizzle ORM
import { eq, inArray, isNull, like, or, type SQL } from 'drizzle-orm';

// 2. Database
import { db } from '@/lib/db';
import { work_item_field_values, work_items } from '@/lib/db/schema';

// 3. Base classes
import { BaseRBACService } from '@/lib/rbac/base-service';

// 4. Types
import type { PermissionName, UserContext } from '@/lib/types/rbac';
import type { WorkItemQueryOptions, WorkItemWithDetails } from '@/lib/types/work-items';
import type { WorkItemQueryResult } from './query-builder';

/**
 * Base Work Items RBAC Service
 *
 * Extends BaseRBACService with work-items-specific permission patterns.
 * Provides shared permission checking, RBAC filtering, and helper methods
 * for all work item services.
 *
 * This base class eliminates duplicated code across:
 * - core-service.ts (CRUD operations)
 * - hierarchy-service.ts (parent-child relationships)
 *
 * Helper methods moved to base class for reuse:
 * - buildWorkItemWhereConditions() - Query filtering with RBAC
 * - mapWorkItemResult() - Database result mapping
 * - getCustomFieldValues() - Custom field retrieval
 *
 * @internal - Use factory functions from specific services instead
 */
export abstract class BaseWorkItemsService extends BaseRBACService {
  // Cached permission checks using base class methods
  protected readonly canReadAll: boolean;
  protected readonly canReadOwn: boolean;
  protected readonly canReadOrg: boolean;
  protected readonly canManageAll: boolean;
  protected readonly canManageOwn: boolean;
  protected readonly canManageOrg: boolean;
  protected readonly accessibleOrgIds: string[];

  constructor(userContext: UserContext) {
    super(userContext);

    // Use base class permission checker instead of manual checks
    this.canReadAll = this.hasAnyPermission(['work-items:read:all']);
    this.canReadOwn = this.hasAnyPermission(['work-items:read:own']);
    this.canReadOrg = this.hasAnyPermission(['work-items:read:organization']);
    this.canManageAll = this.hasAnyPermission(['work-items:manage:all']);
    this.canManageOrg = this.hasAnyPermission(['work-items:manage:organization']);
    
    // Check for individual own permissions (create, update, delete)
    this.canManageOwn = this.hasAnyPermission([
      'work-items:create:own',
      'work-items:update:own',
      'work-items:delete:own',
    ]);

    // Cache accessible organization IDs
    this.accessibleOrgIds = userContext.organizations?.map((org) => org.organization_id) || [];
  }

  /**
   * Build base RBAC WHERE conditions for work item queries
   *
   * Filters at database level for performance.
   * Shared utility used by all work item services.
   *
   * @returns Array of SQL conditions for WHERE clause
   */
  protected buildBaseRBACWhereConditions(): SQL[] {
    const conditions: SQL[] = [isNull(work_items.deleted_at)];

    // Apply RBAC filtering
    if (!this.canReadAll) {
      if (this.canReadOrg) {
        if (this.accessibleOrgIds.length > 0) {
          conditions.push(inArray(work_items.organization_id, this.accessibleOrgIds));
        } else {
          // No organizations accessible - return impossible condition
          conditions.push(eq(work_items.work_item_id, 'impossible-id'));
        }
      } else if (this.canReadOwn) {
        conditions.push(eq(work_items.created_by, this.userContext.user_id));
      } else {
        // No read permission - return impossible condition
        conditions.push(eq(work_items.work_item_id, 'impossible-id'));
      }
    }

    return conditions;
  }

  /**
   * Build complete WHERE conditions for work item queries
   *
   * Combines base RBAC filtering with optional query filters.
   * Supports filtering by type, organization, status, priority, assignment, and search.
   *
   * @param options - Query filter options
   * @returns Array of SQL where conditions
   */
  protected buildWorkItemWhereConditions(options: WorkItemQueryOptions = {}): SQL[] {
    const conditions: SQL[] = this.buildBaseRBACWhereConditions();

    // Apply optional filters
    if (options.work_item_type_id) {
      conditions.push(eq(work_items.work_item_type_id, options.work_item_type_id));
    }

    if (options.organization_id) {
      conditions.push(eq(work_items.organization_id, options.organization_id));
    }

    if (options.status_id) {
      conditions.push(eq(work_items.status_id, options.status_id));
    }

    if (options.priority) {
      conditions.push(eq(work_items.priority, options.priority));
    }

    if (options.assigned_to) {
      conditions.push(eq(work_items.assigned_to, options.assigned_to));
    }

    if (options.created_by) {
      conditions.push(eq(work_items.created_by, options.created_by));
    }

    if (options.search) {
      const searchCondition = or(
        like(work_items.subject, `%${options.search}%`),
        like(work_items.description, `%${options.search}%`)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    return conditions;
  }

  /**
   * Map database query result to WorkItemWithDetails
   *
   * Handles name concatenation, default values, and custom fields.
   * Shared helper used by all services to ensure consistent mapping.
   *
   * @param result - Raw database result from query builder
   * @param customFields - Optional custom field values
   * @returns Mapped work item with details
   */
  protected mapWorkItemResult(
    result: WorkItemQueryResult,
    customFields?: Record<string, unknown>
  ): WorkItemWithDetails {
    return {
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
      assigned_to_name:
        result.assigned_to_first_name && result.assigned_to_last_name
          ? `${result.assigned_to_first_name} ${result.assigned_to_last_name}`
          : null,
      due_date: result.due_date,
      started_at: result.started_at,
      completed_at: result.completed_at,
      parent_work_item_id: result.parent_work_item_id,
      root_work_item_id: result.root_work_item_id,
      depth: result.depth,
      path: result.path,
      created_by: result.created_by,
      created_by_name:
        result.created_by_first_name && result.created_by_last_name
          ? `${result.created_by_first_name} ${result.created_by_last_name}`
          : '',
      created_at: result.created_at,
      updated_at: result.updated_at,
      custom_fields: customFields,
    };
  }

  /**
   * Get custom field values for multiple work items
   *
   * Fetches and organizes custom field values for efficient batch retrieval.
   * Returns a map for O(1) lookup when mapping work items.
   *
   * @param workItemIds - Array of work item IDs
   * @returns Map of work item ID to custom field values
   */
  protected async getCustomFieldValues(
    workItemIds: string[]
  ): Promise<Map<string, Record<string, unknown>>> {
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

  /**
   * Check if user has access to specific organization
   *
   * @param organizationId - Organization ID to check
   * @returns True if user can access organization
   */
  protected canAccessOrganization(organizationId: string): boolean {
    if (this.userContext.is_super_admin) return true;
    return this.accessibleOrgIds.includes(organizationId);
  }

  /**
   * Get RBAC scope for logging
   *
   * @returns Scope level for audit trail
   */
  protected getRBACScope(): 'all' | 'organization' | 'own' | 'none' {
    if (this.canReadAll) return 'all';
    if (this.canReadOrg) return 'organization';
    if (this.canReadOwn) return 'own';
    return 'none';
  }

  /**
   * Get management RBAC scope for logging
   *
   * @returns Management scope level for audit trail
   */
  protected getManagementRBACScope(): 'all' | 'organization' | 'own' | 'none' {
    if (this.canManageAll) return 'all';
    if (this.canManageOrg) return 'organization';
    if (this.canManageOwn) return 'own';
    return 'none';
  }

  /**
   * Helper for permission checking delegation to base class
   *
   * @param permissions - Permissions to check
   * @returns True if user has any of the permissions
   */
  private hasAnyPermission(permissions: PermissionName[]): boolean {
    return (
      this.userContext.is_super_admin ||
      this.checker.hasAnyPermission(permissions, undefined, undefined)
    );
  }
}
