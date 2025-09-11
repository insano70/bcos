import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { 
  organizations, 
  user_organizations, 
  practices, 
  users
} from '@/lib/db/schema';
import { eq, and, inArray, isNull, like, desc, count } from 'drizzle-orm';
import { getOrganizationHierarchy, getOrganizationChildren } from '@/lib/rbac/organization-hierarchy';
import type { UserContext, Organization } from '@/lib/types/rbac';

/**
 * Organizations Service with RBAC
 * Manages practice organizations with automatic permission checking
 * Maps the healthcare 'practices' concept to RBAC 'organizations'
 */

export interface CreateOrganizationData {
  name: string;
  slug: string;
  parent_organization_id?: string;
  is_active?: boolean;
}

export interface UpdateOrganizationData {
  name?: string;
  slug?: string;
  parent_organization_id?: string;
  is_active?: boolean;
}

export interface OrganizationQueryOptions {
  search?: string;
  parent_organization_id?: string;
  is_active?: boolean;
  include_children?: boolean;
  limit?: number;
  offset?: number;
}

export interface OrganizationWithDetails extends Organization {
  member_count: number;
  practice_info?: {
    practice_id: string;
    domain: string;
    status: string;
    template_id: string;
  } | undefined;
  children_count: number;
  parent?: Organization;
}

export class RBACOrganizationsService extends BaseRBACService {
  /**
   * Get organizations with automatic permission-based filtering
   */
  async getOrganizations(options: OrganizationQueryOptions = {}): Promise<OrganizationWithDetails[]> {
    const accessScope = this.getAccessScope('practices', 'read');
    
    // Build all where conditions upfront
    const whereConditions = [
      eq(organizations.is_active, true),
      isNull(organizations.deleted_at)
    ];

    // Apply scope-based filtering
    switch (accessScope.scope) {
      case 'own': {
        // User can only see organizations they belong to
        const userOrgIds = this.userContext.organizations.map(org => org.organization_id);
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
      whereConditions.push(
        like(organizations.name, `%${options.search}%`)
      );
    }

    if (options.parent_organization_id !== undefined) {
      if (options.parent_organization_id === null) {
        whereConditions.push(isNull(organizations.parent_organization_id));
      } else {
        whereConditions.push(eq(organizations.parent_organization_id, options.parent_organization_id));
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
        practice_template_id: practices.template_id
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
        practice_info: row.practice_id ? {
          practice_id: row.practice_id,
          domain: row.practice_domain || '',
          status: row.practice_status || 'active',
          template_id: row.practice_template_id || ''
        } : undefined
      };

      enhancedResults.push(enhanced);
    }

    return enhancedResults;
  }

  /**
   * Get a specific organization by ID
   */
  async getOrganizationById(organizationId: string): Promise<OrganizationWithDetails | null> {
    this.requireAnyPermission([
      'practices:read:own',
      'practices:read:all'
    ], organizationId);

    this.requireOrganizationAccess(organizationId);

    const [result] = await this.getOrganizations({ limit: 1 });
    return result || null;
  }

  /**
   * Create a new organization (super admin only)
   */
  async createOrganization(orgData: CreateOrganizationData): Promise<OrganizationWithDetails> {
    this.requirePermission('practices:create:all');

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
        is_active: orgData.is_active ?? true
      })
      .returning();

    if (!newOrg) {
      throw new Error('Failed to create organization');
    }

    await this.logPermissionCheck('practices:create:all', newOrg.organization_id);

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
    this.requirePermission('practices:update:own', organizationId);
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
        updated_at: new Date()
      })
      .where(eq(organizations.organization_id, organizationId))
      .returning();

    if (!updatedOrg) {
      throw new Error('Failed to update organization');
    }

    await this.logPermissionCheck('practices:update:own', organizationId);

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
    this.requirePermission('practices:manage:all', organizationId);

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
        is_active: false
      })
      .where(eq(organizations.organization_id, organizationId));

    await this.logPermissionCheck('practices:delete:all', organizationId);
  }

  /**
   * Get organization hierarchy for current user
   */
  async getAccessibleHierarchy(rootOrganizationId?: string): Promise<Organization[]> {
    this.requireAnyPermission([
      'practices:read:own',
      'practices:read:all'
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
      hierarchy.forEach(hierarchyOrg => {
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
    this.requireAnyPermission([
      'users:read:organization',
      'users:read:all'
    ]);

    const members = await db
      .select({
        user_id: users.user_id,
        email: users.email,
        first_name: users.first_name,
        last_name: users.last_name,
        is_active: users.is_active,
        joined_at: user_organizations.joined_at
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

    return this.checker.hasPermission('practices:update:own', organizationId) ||
           this.checker.hasPermission('practices:manage:all');
  }
}

/**
 * Factory function to create RBAC Organizations Service
 */
export function createRBACOrganizationsService(userContext: UserContext): RBACOrganizationsService {
  return new RBACOrganizationsService(userContext);
}
