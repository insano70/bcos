import { and, count, desc, eq, inArray, isNull, like } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations, practices, user_organizations, users } from '@/lib/db/schema';
import { BaseRBACService } from '@/lib/rbac/base-service';
import {
  getOrganizationChildren,
  getOrganizationHierarchy,
} from '@/lib/rbac/organization-hierarchy';
import type { Organization, UserContext } from '@/lib/types/rbac';

/**
 * Organizations Service with RBAC
 * Manages practice organizations with automatic permission checking
 * Maps the healthcare 'practices' concept to RBAC 'organizations'
 */

export interface CreateOrganizationData {
  name: string;
  slug: string;
  parent_organization_id?: string | undefined;
  practice_uids?: number[] | undefined; // Analytics security - practice_uid filtering
  is_active?: boolean | undefined;
}

export interface UpdateOrganizationData {
  name?: string | undefined;
  slug?: string | undefined;
  parent_organization_id?: string | null | undefined;
  practice_uids?: number[] | undefined; // Analytics security - practice_uid filtering
  is_active?: boolean | undefined;
}

export interface OrganizationQueryOptions {
  search?: string | undefined;
  parent_organization_id?: string | undefined;
  is_active?: boolean | undefined;
  include_children?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface OrganizationWithDetails extends Organization {
  member_count: number;
  practice_info?:
    | {
        practice_id: string;
        domain: string;
        status: string;
        template_id: string;
      }
    | undefined;
  children_count: number;
  parent?: Organization;
}

export class RBACOrganizationsService extends BaseRBACService {
  /**
   * Get organizations with automatic permission-based filtering
   */
  async getOrganizations(
    options: OrganizationQueryOptions = {}
  ): Promise<OrganizationWithDetails[]> {
    const accessScope = this.getAccessScope('organizations', 'read');

    // Build all where conditions upfront
    const whereConditions = [eq(organizations.is_active, true), isNull(organizations.deleted_at)];

    // Apply scope-based filtering
    switch (accessScope.scope) {
      case 'own': {
        // User can only see organizations they belong to
        const userOrgIds = this.userContext.organizations.map((org) => org.organization_id);
        if (userOrgIds.length > 0) {
          whereConditions.push(inArray(organizations.organization_id, userOrgIds));
        } else {
          return [];
        }
        break;
      }

      case 'organization': {
        // User can see their accessible organizations
        const accessibleOrgIds = accessScope.organizationIds || [];
        if (accessibleOrgIds.length > 0) {
          whereConditions.push(inArray(organizations.organization_id, accessibleOrgIds));
        } else {
          return [];
        }
        break;
      }

      case 'all':
        // Super admin can see all organizations
        break;
    }

    // Apply additional filters
    if (options.search) {
      whereConditions.push(like(organizations.name, `%${options.search}%`));
    }

    if (options.parent_organization_id !== undefined) {
      if (options.parent_organization_id === null) {
        whereConditions.push(isNull(organizations.parent_organization_id));
      } else {
        whereConditions.push(
          eq(organizations.parent_organization_id, options.parent_organization_id)
        );
      }
    }

    if (options.is_active !== undefined) {
      whereConditions.push(eq(organizations.is_active, options.is_active));
    }

    // Build complete query
    const query = db
      .select({
        organization_id: organizations.organization_id,
        name: organizations.name,
        slug: organizations.slug,
        parent_organization_id: organizations.parent_organization_id,
        is_active: organizations.is_active,
        created_at: organizations.created_at,
        updated_at: organizations.updated_at,
        deleted_at: organizations.deleted_at,
        // Practice mapping info
        practice_id: practices.practice_id,
        practice_domain: practices.domain,
        practice_status: practices.status,
        practice_template_id: practices.template_id,
      })
      .from(organizations)
      .leftJoin(practices, eq(organizations.organization_id, practices.practice_id)) // Map org to practice
      .where(and(...whereConditions))
      .orderBy(desc(organizations.created_at));

    // Execute base query
    const baseResults = await query;

    // Apply pagination manually if needed (simpler approach)
    const results = (() => {
      let filtered = baseResults;
      if (options.offset) {
        filtered = filtered.slice(options.offset);
      }
      if (options.limit) {
        filtered = filtered.slice(0, options.limit);
      }
      return filtered;
    })();

    // Enhance results with additional data
    const enhancedResults: OrganizationWithDetails[] = [];

    for (const row of results) {
      // Get member count
      const [memberCountResult] = await db
        .select({ count: count() })
        .from(user_organizations)
        .where(
          and(
            eq(user_organizations.organization_id, row.organization_id),
            eq(user_organizations.is_active, true)
          )
        );

      // Get children count
      const children = await getOrganizationChildren(row.organization_id);

      const enhanced: OrganizationWithDetails = {
        organization_id: row.organization_id,
        name: row.name,
        slug: row.slug,
        parent_organization_id: row.parent_organization_id || undefined,
        is_active: row.is_active ?? true,
        created_at: row.created_at ?? new Date(),
        updated_at: row.updated_at ?? new Date(),
        deleted_at: row.deleted_at || undefined,
        member_count: memberCountResult?.count || 0,
        children_count: children.length,
        practice_info: row.practice_id
          ? {
              practice_id: row.practice_id,
              domain: row.practice_domain || '',
              status: row.practice_status || 'active',
              template_id: row.practice_template_id || '',
            }
          : undefined,
      };

      enhancedResults.push(enhanced);
    }

    return enhancedResults;
  }

  /**
   * Get a specific organization by ID
   */
  async getOrganizationById(organizationId: string): Promise<OrganizationWithDetails | null> {
    this.requireAnyPermission(
      ['organizations:read:own', 'organizations:read:organization', 'organizations:read:all'],
      organizationId
    );

    this.requireOrganizationAccess(organizationId);

    const [result] = await this.getOrganizations({ limit: 1 });
    return result || null;
  }

  /**
   * Create a new organization (super admin only)
   */
  async createOrganization(orgData: CreateOrganizationData): Promise<OrganizationWithDetails> {
    this.requirePermission('organizations:create:all');

    // Validate parent organization if specified
    if (orgData.parent_organization_id) {
      const [parentOrg] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.organization_id, orgData.parent_organization_id))
        .limit(1);

      if (!parentOrg) {
        throw new Error('Parent organization not found');
      }
    }

    // Create organization
    const [newOrg] = await db
      .insert(organizations)
      .values({
        name: orgData.name,
        slug: orgData.slug,
        parent_organization_id: orgData.parent_organization_id,
        practice_uids: orgData.practice_uids || [], // Analytics security field
        is_active: orgData.is_active ?? true,
      })
      .returning();

    if (!newOrg) {
      throw new Error('Failed to create organization');
    }

    await this.logPermissionCheck('organizations:create:all', newOrg.organization_id);

    // Return enhanced organization
    const enhanced = await this.getOrganizationById(newOrg.organization_id);
    if (!enhanced) {
      throw new Error('Failed to retrieve created organization');
    }

    return enhanced;
  }

  /**
   * Update an organization
   */
  async updateOrganization(
    organizationId: string,
    updateData: UpdateOrganizationData
  ): Promise<OrganizationWithDetails> {
    this.requireAnyPermission(
      ['organizations:update:own', 'organizations:update:organization', 'organizations:manage:all'],
      organizationId
    );
    this.requireOrganizationAccess(organizationId);

    // Validate parent organization if being changed
    if (updateData.parent_organization_id !== undefined) {
      if (updateData.parent_organization_id) {
        const [parentOrg] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.organization_id, updateData.parent_organization_id))
          .limit(1);

        if (!parentOrg) {
          throw new Error('Parent organization not found');
        }

        // Prevent circular references
        if (updateData.parent_organization_id === organizationId) {
          throw new Error('Organization cannot be its own parent');
        }
      }
    }

    // Update organization
    const [updatedOrg] = await db
      .update(organizations)
      .set({
        ...updateData,
        updated_at: new Date(),
      })
      .where(eq(organizations.organization_id, organizationId))
      .returning();

    if (!updatedOrg) {
      throw new Error('Failed to update organization');
    }

    await this.logPermissionCheck('organizations:update:organization', organizationId);

    // Return enhanced organization
    const enhanced = await this.getOrganizationById(organizationId);
    if (!enhanced) {
      throw new Error('Failed to retrieve updated organization');
    }

    return enhanced;
  }

  /**
   * Delete an organization (soft delete)
   */
  async deleteOrganization(organizationId: string): Promise<void> {
    this.requireAnyPermission(
      ['organizations:delete:organization', 'organizations:manage:all'],
      organizationId
    );

    // Check for child organizations
    const children = await getOrganizationChildren(organizationId);
    if (children.length > 0) {
      throw new Error('Cannot delete organization with child organizations');
    }

    // Check for active members
    const [memberCount] = await db
      .select({ count: count() })
      .from(user_organizations)
      .where(
        and(
          eq(user_organizations.organization_id, organizationId),
          eq(user_organizations.is_active, true)
        )
      );

    if ((memberCount?.count || 0) > 0) {
      throw new Error('Cannot delete organization with active members');
    }

    // Soft delete organization
    await db
      .update(organizations)
      .set({
        deleted_at: new Date(),
        is_active: false,
      })
      .where(eq(organizations.organization_id, organizationId));

    await this.logPermissionCheck('organizations:delete:organization', organizationId);
  }

  /**
   * Get organization hierarchy for current user
   */
  async getAccessibleHierarchy(rootOrganizationId?: string): Promise<Organization[]> {
    this.requireAnyPermission([
      'organizations:read:own',
      'organizations:read:organization',
      'organizations:read:all',
    ]);

    if (rootOrganizationId) {
      this.requireOrganizationAccess(rootOrganizationId);
      return await getOrganizationHierarchy(rootOrganizationId);
    }

    // Get hierarchy for all accessible organizations
    const accessibleOrgs = this.userContext.accessible_organizations;
    const hierarchies = new Map<string, Organization>();

    for (const org of accessibleOrgs) {
      const hierarchy = await getOrganizationHierarchy(org.organization_id);
      hierarchy.forEach((hierarchyOrg) => {
        hierarchies.set(hierarchyOrg.organization_id, hierarchyOrg);
      });
    }

    return Array.from(hierarchies.values());
  }

  /**
   * Get organization members
   */
  async getOrganizationMembers(organizationId: string) {
    this.requireOrganizationAccess(organizationId);
    this.requireAnyPermission(['users:read:organization', 'users:read:all']);

    const members = await db
      .select({
        user_id: users.user_id,
        email: users.email,
        first_name: users.first_name,
        last_name: users.last_name,
        is_active: users.is_active,
        joined_at: user_organizations.joined_at,
      })
      .from(user_organizations)
      .innerJoin(users, eq(user_organizations.user_id, users.user_id))
      .where(
        and(
          eq(user_organizations.organization_id, organizationId),
          eq(user_organizations.is_active, true),
          eq(users.is_active, true),
          isNull(users.deleted_at)
        )
      )
      .orderBy(desc(user_organizations.joined_at));

    return members;
  }

  /**
   * Check if current user can manage specific organization
   */
  canManageOrganization(organizationId: string): boolean {
    if (this.isSuperAdmin()) {
      return true;
    }

    if (!this.canAccessOrganization(organizationId)) {
      return false;
    }

    return (
      this.checker.hasPermission('organizations:update:own', organizationId) ||
      this.checker.hasPermission('organizations:update:organization', organizationId) ||
      this.checker.hasPermission('organizations:manage:all')
    );
  }

  /**
   * Get all users with their membership status for a specific organization
   * Returns all active users in the system with is_member flag
   */
  async getOrganizationUsersWithStatus(organizationId: string): Promise<
    Array<{
      user_id: string;
      email: string;
      first_name: string;
      last_name: string;
      is_active: boolean;
      email_verified: boolean;
      created_at: Date;
      is_member: boolean;
      joined_at?: Date;
    }>
  > {
    this.requirePermission('organizations:manage:all');
    this.requireOrganizationAccess(organizationId);

    // Get all active users in the system
    const allUsers = await db
      .select({
        user_id: users.user_id,
        email: users.email,
        first_name: users.first_name,
        last_name: users.last_name,
        is_active: users.is_active,
        email_verified: users.email_verified,
        created_at: users.created_at,
      })
      .from(users)
      .where(and(eq(users.is_active, true), isNull(users.deleted_at)))
      .orderBy(users.last_name, users.first_name);

    // Get current members of this organization
    const currentMembers = await db
      .select({
        user_id: user_organizations.user_id,
        joined_at: user_organizations.joined_at,
      })
      .from(user_organizations)
      .where(
        and(
          eq(user_organizations.organization_id, organizationId),
          eq(user_organizations.is_active, true)
        )
      );

    // Create a map of member user_ids for quick lookup
    const memberMap = new Map(
      currentMembers.map((m) => [m.user_id, m.joined_at])
    );

    // Combine data: all users with membership flag
    return allUsers.map((user) => {
      const joinedAt = memberMap.get(user.user_id);
      const result: {
        user_id: string;
        email: string;
        first_name: string;
        last_name: string;
        is_active: boolean;
        email_verified: boolean;
        created_at: Date;
        is_member: boolean;
        joined_at?: Date;
      } = {
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        is_active: user.is_active ?? true,
        email_verified: user.email_verified ?? false,
        created_at: user.created_at ?? new Date(),
        is_member: memberMap.has(user.user_id),
      };

      // Only include joined_at if it exists (for exactOptionalPropertyTypes)
      if (joinedAt) {
        result.joined_at = joinedAt;
      }

      return result;
    });
  }

  /**
   * Batch update organization users - add and remove associations
   */
  async updateOrganizationUsers(
    organizationId: string,
    addUserIds: string[],
    removeUserIds: string[]
  ): Promise<{ added: number; removed: number }> {
    this.requirePermission('organizations:manage:all');
    this.requireOrganizationAccess(organizationId);

    let added = 0;
    let removed = 0;

    // Validate organization exists
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.organization_id, organizationId))
      .limit(1);

    if (!org) {
      throw new Error('Organization not found');
    }

    // Process additions
    if (addUserIds.length > 0) {
      // Validate all users exist and are active
      const existingUsers = await db
        .select({ user_id: users.user_id })
        .from(users)
        .where(
          and(
            inArray(users.user_id, addUserIds),
            eq(users.is_active, true),
            isNull(users.deleted_at)
          )
        );

      const validUserIds = existingUsers.map((u) => u.user_id);

      if (validUserIds.length === 0) {
        throw new Error('No valid users found to add');
      }

      // For each user, either insert new or reactivate existing
      for (const userId of validUserIds) {
        // Check if association already exists
        const [existing] = await db
          .select()
          .from(user_organizations)
          .where(
            and(
              eq(user_organizations.user_id, userId),
              eq(user_organizations.organization_id, organizationId)
            )
          )
          .limit(1);

        if (existing) {
          // Reactivate if inactive
          if (!existing.is_active) {
            await db
              .update(user_organizations)
              .set({
                is_active: true,
                joined_at: new Date(),
              })
              .where(
                eq(user_organizations.user_organization_id, existing.user_organization_id)
              );
            added++;
          }
          // Already active - skip
        } else {
          // Insert new association
          await db.insert(user_organizations).values({
            user_id: userId,
            organization_id: organizationId,
            is_active: true,
            joined_at: new Date(),
          });
          added++;
        }
      }
    }

    // Process removals (soft delete)
    if (removeUserIds.length > 0) {
      const result = await db
        .update(user_organizations)
        .set({
          is_active: false,
        })
        .where(
          and(
            eq(user_organizations.organization_id, organizationId),
            inArray(user_organizations.user_id, removeUserIds),
            eq(user_organizations.is_active, true)
          )
        )
        .returning();

      removed = result.length;
    }

    await this.logPermissionCheck('organizations:manage:all', organizationId);

    return { added, removed };
  }
}

/**
 * Factory function to create RBAC Organizations Service
 */
export function createRBACOrganizationsService(userContext: UserContext): RBACOrganizationsService {
  return new RBACOrganizationsService(userContext);
}
