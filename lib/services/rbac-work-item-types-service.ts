import { and, asc, count, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations, users, work_item_types } from '@/lib/db/schema';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

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
      const conditions = [eq(work_item_types.deleted_at, null as unknown as Date)];

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
      const conditions = [eq(work_item_types.deleted_at, null as unknown as Date)];

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
          and(
            eq(work_item_types.work_item_type_id, typeId),
            eq(work_item_types.deleted_at, null as unknown as Date)
          )
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
}

/**
 * Factory function to create service instance
 */
export function createRBACWorkItemTypesService(userContext: UserContext) {
  return new RBACWorkItemTypesService(userContext);
}
