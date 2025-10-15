import { and, count, desc, eq, inArray, isNotNull, isNull, like, sql, type SQL } from 'drizzle-orm';
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '@/lib/api/responses/error';
import { db, organizations, practices, user_organizations, users } from '@/lib/db';
import { SLOW_THRESHOLDS, log } from '@/lib/logger';
import { calculateChanges, logTemplates, sanitizeFilters } from '@/lib/logger/message-templates';
import {
  getOrganizationChildren,
  getOrganizationHierarchy,
} from '@/lib/rbac/organization-hierarchy';
import type { Organization, UserContext } from '@/lib/types/rbac';

/**
 * Organizations Service with RBAC
 *
 * Manages practice organizations with automatic permission checking.
 * Maps the healthcare 'practices' concept to RBAC 'organizations'.
 *
 * @internal - Do not export class, use factory function instead
 *
 * RBAC Scopes:
 * - `organizations:read:all` - Read all organizations (super admin)
 * - `organizations:read:organization` - Read accessible organizations
 * - `organizations:read:own` - Read only organizations user belongs to
 * - `organizations:create:all` - Create organizations (super admin)
 * - `organizations:update:own` - Update own organizations
 * - `organizations:update:organization` - Update accessible organizations
 * - `organizations:manage:all` - Full management (super admin)
 *
 * Features:
 * - Hierarchy support with parent-child relationships
 * - Batch optimizations for member and children counts
 * - Practice mapping for healthcare organizations
 * - Soft delete with safety checks (no children, no active members)
 *
 * @example
 * ```typescript
 * const service = createRBACOrganizationsService(userContext);
 *
 * // List organizations with filtering
 * const orgs = await service.getOrganizations({
 *   search: 'Clinic',
 *   is_active: true,
 *   limit: 50
 * });
 *
 * // Create with parent
 * const newOrg = await service.createOrganization({
 *   name: 'Sub Clinic',
 *   slug: 'sub-clinic',
 *   parent_organization_id: 'parent_id'
 * });
 * ```
 */

// ============================================================
// INTERFACES
// ============================================================

export interface OrganizationsServiceInterface {
  getOrganizations(options?: OrganizationQueryOptions): Promise<OrganizationWithDetails[]>;
  getOrganizationById(organizationId: string): Promise<OrganizationWithDetails | null>;
  createOrganization(data: CreateOrganizationData): Promise<OrganizationWithDetails>;
  updateOrganization(
    organizationId: string,
    data: UpdateOrganizationData
  ): Promise<OrganizationWithDetails>;
  deleteOrganization(organizationId: string): Promise<void>;
  getAccessibleHierarchy(rootOrganizationId?: string): Promise<Organization[]>;
  getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]>;
  canManageOrganization(organizationId: string): boolean;
  getOrganizationUsersWithStatus(organizationId: string): Promise<UserWithMembershipStatus[]>;
  updateOrganizationUsers(
    organizationId: string,
    addUserIds: string[],
    removeUserIds: string[]
  ): Promise<{ added: number; removed: number }>;
}

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

export interface OrganizationMember {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  joined_at: Date | null;
}

export interface UserWithMembershipStatus {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: Date;
  is_member: boolean;
  joined_at?: Date;
}

// ============================================================
// IMPLEMENTATION
// ============================================================

/**
 * Internal Organizations Service
 * Implements all CRUD operations with RBAC enforcement and hierarchy support
 */
class OrganizationsService implements OrganizationsServiceInterface {
  private readonly canReadAll: boolean;
  private readonly canReadOrganization: boolean;
  private readonly canReadOwn: boolean;
  private readonly canCreate: boolean;
  private readonly canUpdate: boolean;
  private readonly canManage: boolean;
  private readonly canDelete: boolean;
  private readonly accessibleOrgIds: string[];

  constructor(private readonly userContext: UserContext) {
    // Cache all permission checks once for performance
    this.canReadAll =
      userContext.is_super_admin ||
      userContext.all_permissions?.some((p) => p.name === 'organizations:read:all') ||
      false;

    this.canReadOrganization =
      userContext.all_permissions?.some((p) => p.name === 'organizations:read:organization') ||
      false;

    this.canReadOwn =
      userContext.all_permissions?.some((p) => p.name === 'organizations:read:own') || false;

    this.canCreate =
      userContext.is_super_admin ||
      userContext.all_permissions?.some((p) => p.name === 'organizations:create:all') ||
      false;

    this.canUpdate =
      userContext.is_super_admin ||
      userContext.all_permissions?.some(
        (p) =>
          p.name === 'organizations:update:own' ||
          p.name === 'organizations:update:organization' ||
          p.name === 'organizations:manage:all'
      ) ||
      false;

    this.canManage =
      userContext.is_super_admin ||
      userContext.all_permissions?.some((p) => p.name === 'organizations:manage:all') ||
      false;

    this.canDelete =
      userContext.is_super_admin ||
      userContext.all_permissions?.some((p) => p.name === 'organizations:manage:all') ||
      false;

    this.accessibleOrgIds =
      userContext.accessible_organizations?.map((org) => org.organization_id) || [];
  }

  /**
   * Build RBAC WHERE conditions based on user permissions
   * Filters at database level for performance
   */
  private buildRBACWhereConditions(): SQL<unknown>[] {
    const conditions: SQL<unknown>[] = [eq(organizations.is_active, true), isNull(organizations.deleted_at)];

    if (!this.canReadAll) {
      if (this.canReadOrganization && this.accessibleOrgIds.length > 0) {
        // User can see their accessible organizations
        conditions.push(inArray(organizations.organization_id, this.accessibleOrgIds));
      } else if (this.canReadOwn) {
        // User can only see organizations they belong to
        const userOrgIds =
          this.userContext.organizations?.map((org) => org.organization_id) || [];
        if (userOrgIds.length > 0) {
          conditions.push(inArray(organizations.organization_id, userOrgIds));
        } else {
          conditions.push(sql`FALSE`); // No accessible organizations
        }
      } else {
        conditions.push(sql`FALSE`); // No permission
      }
    }

    return conditions;
  }

  /**
   * Check if user has access to specific organization
   */
  private canAccessOrganization(organizationId: string): boolean {
    if (this.userContext.is_super_admin) return true;
    return this.accessibleOrgIds.includes(organizationId);
  }

  /**
   * Get RBAC scope for logging
   */
  private getRBACScope(): 'all' | 'organization' | 'own' | 'none' {
    if (this.canReadAll) return 'all';
    if (this.canReadOrganization) return 'organization';
    if (this.canReadOwn) return 'own';
    return 'none';
  }

  /**
   * Get organizations with automatic permission-based filtering
   *
   * Uses batch optimization for member and children counts.
   * Applies RBAC filtering at database level.
   *
   * @param options - Query filters (search, parent, pagination)
   * @returns Array of organizations with member/children counts
   */
  async getOrganizations(
    options: OrganizationQueryOptions = {}
  ): Promise<OrganizationWithDetails[]> {
    const startTime = Date.now();

    try {
      // Build RBAC WHERE conditions
      const whereConditions = this.buildRBACWhereConditions();

      // Early return for no permission
      if (
        !this.canReadAll &&
        !this.canReadOrganization &&
        !this.canReadOwn
      ) {
        const template = logTemplates.crud.list('organizations', {
          userId: this.userContext.user_id,
          filters: sanitizeFilters(options as Record<string, unknown>),
          results: { returned: 0, total: 0, page: 1 },
          duration: Date.now() - startTime,
          metadata: {
            rbacScope: 'none',
            noPermission: true,
            component: 'service',
          },
        });
        log.info(template.message, template.context);
        return [];
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

      // Build complete query with practice mapping
      const queryStart = Date.now();
      const baseResults = await db
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
        .leftJoin(practices, eq(organizations.organization_id, practices.practice_id))
        .where(and(...whereConditions))
        .orderBy(desc(organizations.created_at));
      const queryDuration = Date.now() - queryStart;

      // Apply pagination manually (after filtering)
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

      if (results.length === 0) {
        const template = logTemplates.crud.list('organizations', {
          userId: this.userContext.user_id,
          filters: sanitizeFilters(options as Record<string, unknown>),
          results: { returned: 0, total: baseResults.length, page: 1 },
          duration: Date.now() - startTime,
          metadata: {
            query: { duration: queryDuration, slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY },
            rbacScope: this.getRBACScope(),
            component: 'service',
          },
        });
        log.info(template.message, template.context);
        return [];
      }

      // Collect all organization IDs for batched queries
      const organizationIds = results.map((row) => row.organization_id);

      // Batch Query 1: Get all member counts in a single query
      const memberCountStart = Date.now();
      const memberCountResults = await db
        .select({
          organization_id: user_organizations.organization_id,
          count: count(),
        })
        .from(user_organizations)
        .where(
          and(
            inArray(user_organizations.organization_id, organizationIds),
            eq(user_organizations.is_active, true)
          )
        )
        .groupBy(user_organizations.organization_id);
      const memberCountDuration = Date.now() - memberCountStart;

      // Create member count lookup map for O(1) access
      const memberCountMap = new Map<string, number>();
      for (const result of memberCountResults) {
        memberCountMap.set(result.organization_id, Number(result.count));
      }

      // Batch Query 2: Get all children counts in a single query
      const childrenCountStart = Date.now();
      const childrenCountResults = await db
        .select({
          parent_organization_id: organizations.parent_organization_id,
          count: count(),
        })
        .from(organizations)
        .where(
          and(
            inArray(organizations.parent_organization_id, organizationIds),
            isNotNull(organizations.parent_organization_id),
            eq(organizations.is_active, true),
            isNull(organizations.deleted_at)
          )
        )
        .groupBy(organizations.parent_organization_id);
      const childrenCountDuration = Date.now() - childrenCountStart;

      // Create children count lookup map for O(1) access
      const childrenCountMap = new Map<string, number>();
      for (const result of childrenCountResults) {
        if (result.parent_organization_id) {
          childrenCountMap.set(result.parent_organization_id, Number(result.count));
        }
      }

      // Enhance results with batched data
      const enhancedResults: OrganizationWithDetails[] = [];

      for (const row of results) {
        const enhanced: OrganizationWithDetails = {
          organization_id: row.organization_id,
          name: row.name,
          slug: row.slug,
          parent_organization_id: row.parent_organization_id || undefined,
          is_active: row.is_active ?? true,
          created_at: row.created_at ?? new Date(),
          updated_at: row.updated_at ?? new Date(),
          deleted_at: row.deleted_at || undefined,
          member_count: memberCountMap.get(row.organization_id) || 0,
          children_count: childrenCountMap.get(row.organization_id) || 0,
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

      const duration = Date.now() - startTime;
      const page = Math.floor((options.offset || 0) / (options.limit || 100)) + 1;

      const template = logTemplates.crud.list('organizations', {
        userId: this.userContext.user_id,
        ...(this.userContext.current_organization_id && {
          organizationId: this.userContext.current_organization_id,
        }),
        filters: sanitizeFilters(options as Record<string, unknown>),
        results: {
          returned: enhancedResults.length,
          total: baseResults.length,
          page,
          hasMore: (options.offset || 0) + enhancedResults.length < baseResults.length,
        },
        duration,
        metadata: {
          query: { duration: queryDuration, slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY },
          memberCountQuery: {
            duration: memberCountDuration,
            slow: memberCountDuration > SLOW_THRESHOLDS.DB_QUERY,
          },
          childrenCountQuery: {
            duration: childrenCountDuration,
            slow: childrenCountDuration > SLOW_THRESHOLDS.DB_QUERY,
          },
          rbacScope: this.getRBACScope(),
          batchOptimized: true,
          component: 'service',
        },
      });
      log.info(template.message, template.context);

      return enhancedResults;
    } catch (error) {
      log.error('list organizations failed', error, {
        operation: 'list_organizations',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Get a specific organization by ID
   *
   * Verifies RBAC access before returning organization details.
   *
   * @param organizationId - Organization ID to retrieve
   * @returns Organization with details or null if not found
   * @throws {AuthorizationError} If user lacks permission
   */
  async getOrganizationById(organizationId: string): Promise<OrganizationWithDetails | null> {
    const startTime = Date.now();

    try {
      // Check permissions
      if (!this.canReadAll && !this.canReadOrganization && !this.canReadOwn) {
        throw AuthorizationError(
          'You do not have permission to read organizations'
        );
      }

      // Check organization access
      if (!this.canReadAll && !this.canAccessOrganization(organizationId)) {
        const template = logTemplates.crud.read('organization', {
          resourceId: organizationId,
          userId: this.userContext.user_id,
          duration: Date.now() - startTime,
          found: false,
          metadata: {
            accessDenied: true,
            rbacScope: this.getRBACScope(),
            component: 'service',
          },
        });
        log.info(template.message, template.context);
        throw AuthorizationError('Access denied to this organization');
      }

      // Reuse getOrganizations with filtering
      const [result] = await this.getOrganizations({
        limit: 1,
        // Filter by specific org ID - handled by RBAC conditions
      });

      if (!result || result.organization_id !== organizationId) {
        const template = logTemplates.crud.read('organization', {
          resourceId: organizationId,
          userId: this.userContext.user_id,
          duration: Date.now() - startTime,
          found: false,
          metadata: { component: 'service' },
        });
        log.info(template.message, template.context);
        return null;
      }

      const duration = Date.now() - startTime;
      const template = logTemplates.crud.read('organization', {
        resourceId: organizationId,
        resourceName: result.name,
        userId: this.userContext.user_id,
        duration,
        found: true,
        metadata: {
          slug: result.slug,
          memberCount: result.member_count,
          childrenCount: result.children_count,
          rbacScope: this.getRBACScope(),
          component: 'service',
        },
      });
      log.info(template.message, template.context);

      return result;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      log.error('read organization failed', error, {
        operation: 'read_organization',
        resourceId: organizationId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Create a new organization
   *
   * Validates parent organization exists if specified.
   * Super admin only operation.
   *
   * @param data - Organization creation data
   * @returns Created organization with details
   * @throws {AuthorizationError} If user is not super admin
   * @throws {NotFoundError} If parent organization not found
   */
  async createOrganization(data: CreateOrganizationData): Promise<OrganizationWithDetails> {
    const startTime = Date.now();

    try {
      // Check permission (super admin only)
      if (!this.canCreate) {
        throw AuthorizationError(
          'You do not have permission to create organizations'
        );
      }

      // Validate parent organization if specified
      if (data.parent_organization_id) {
        const [parentOrg] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.organization_id, data.parent_organization_id))
          .limit(1);

        if (!parentOrg) {
          throw NotFoundError('Parent organization');
        }
      }

      // Create organization
      const [newOrg] = await db
        .insert(organizations)
        .values({
          name: data.name,
          slug: data.slug,
          parent_organization_id: data.parent_organization_id,
          practice_uids: data.practice_uids || [],
          is_active: data.is_active ?? true,
        })
        .returning();

      if (!newOrg) {
        throw new Error('Failed to create organization');
      }

      // Return enhanced organization
      const enhanced = await this.getOrganizationById(newOrg.organization_id);
      if (!enhanced) {
        throw new Error('Failed to retrieve created organization');
      }

      const duration = Date.now() - startTime;
      const logTemplate = logTemplates.crud.create('organization', {
        resourceId: enhanced.organization_id,
        resourceName: enhanced.name,
        userId: this.userContext.user_id,
        ...(this.userContext.current_organization_id && {
          organizationId: this.userContext.current_organization_id,
        }),
        duration,
        metadata: {
          slug: enhanced.slug,
          parentOrganizationId: enhanced.parent_organization_id,
          isActive: enhanced.is_active,
          slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
          rbacScope: 'super_admin',
          component: 'service',
        },
      });
      log.info(logTemplate.message, logTemplate.context);

      return enhanced;
    } catch (error) {
      log.error('create organization failed', error, {
        operation: 'create_organization',
        userId: this.userContext.user_id,
        name: data.name,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Update an organization
   *
   * Validates parent organization and prevents circular references.
   * Tracks all field changes for audit trail.
   *
   * @param organizationId - Organization ID to update
   * @param data - Update data
   * @returns Updated organization with details
   * @throws {AuthorizationError} If user lacks permission
   * @throws {NotFoundError} If organization or parent not found
   * @throws {ValidationError} If circular reference detected
   */
  async updateOrganization(
    organizationId: string,
    data: UpdateOrganizationData
  ): Promise<OrganizationWithDetails> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canUpdate) {
        throw AuthorizationError(
          'You do not have permission to update organizations'
        );
      }

      // Check organization access
      if (!this.canAccessOrganization(organizationId)) {
        throw AuthorizationError('Access denied to this organization');
      }

      // Get existing organization for change tracking
      const [existing] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.organization_id, organizationId))
        .limit(1);

      if (!existing) {
        throw NotFoundError('Organization');
      }

      // Validate parent organization if being changed
      if (data.parent_organization_id !== undefined) {
        if (data.parent_organization_id) {
          const [parentOrg] = await db
            .select()
            .from(organizations)
            .where(eq(organizations.organization_id, data.parent_organization_id))
            .limit(1);

          if (!parentOrg) {
            throw NotFoundError('Parent organization');
          }

          // Prevent circular references
          if (data.parent_organization_id === organizationId) {
            throw ValidationError(null, 'Organization cannot be its own parent');
          }
        }
      }

      // Calculate changes for audit trail
      const changes = calculateChanges(
        existing as unknown as Record<string, unknown>,
        data as unknown as Record<string, unknown>,
        ['name', 'slug', 'parent_organization_id', 'is_active', 'practice_uids']
      );

      // Update organization
      const [updatedOrg] = await db
        .update(organizations)
        .set({
          ...data,
          updated_at: new Date(),
        })
        .where(eq(organizations.organization_id, organizationId))
        .returning();

      if (!updatedOrg) {
        throw new Error('Failed to update organization');
      }

      // Return enhanced organization
      const enhanced = await this.getOrganizationById(organizationId);
      if (!enhanced) {
        throw new Error('Failed to retrieve updated organization');
      }

      const duration = Date.now() - startTime;
      const logTemplate = logTemplates.crud.update('organization', {
        resourceId: organizationId,
        resourceName: enhanced.name,
        userId: this.userContext.user_id,
        ...(this.userContext.current_organization_id && {
          organizationId: this.userContext.current_organization_id,
        }),
        changes,
        duration,
        metadata: {
          slug: enhanced.slug,
          fieldsChanged: Object.keys(changes).length,
          slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
          rbacScope: this.userContext.is_super_admin ? 'super_admin' : 'organization',
          component: 'service',
        },
      });
      log.info(logTemplate.message, logTemplate.context);

      return enhanced;
    } catch (error) {
      log.error('update organization failed', error, {
        operation: 'update_organization',
        resourceId: organizationId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Delete an organization (soft delete)
   *
   * Safety checks:
   * - Cannot delete if has child organizations
   * - Cannot delete if has active members
   *
   * @param organizationId - Organization ID to delete
   * @throws {AuthorizationError} If user lacks permission
   * @throws {ValidationError} If organization has children or active members
   */
  async deleteOrganization(organizationId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canDelete) {
        throw AuthorizationError(
          'You do not have permission to delete organizations'
        );
      }

      // Get organization details before deleting
      const [existing] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.organization_id, organizationId))
        .limit(1);

      if (!existing) {
        throw NotFoundError('Organization');
      }

      // Check for child organizations
      const children = await getOrganizationChildren(organizationId);
      if (children.length > 0) {
        throw ValidationError(
          null,
          'Cannot delete organization with child organizations'
        );
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

      if ((memberCount?.count ? Number(memberCount.count) : 0) > 0) {
        throw ValidationError(null, 'Cannot delete organization with active members');
      }

      // Soft delete organization
      await db
        .update(organizations)
        .set({
          deleted_at: new Date(),
          is_active: false,
        })
        .where(eq(organizations.organization_id, organizationId));

      const duration = Date.now() - startTime;
      const logTemplate = logTemplates.crud.delete('organization', {
        resourceId: organizationId,
        resourceName: existing.name,
        userId: this.userContext.user_id,
        ...(this.userContext.current_organization_id && {
          organizationId: this.userContext.current_organization_id,
        }),
        soft: true,
        duration,
        metadata: {
          slug: existing.slug,
          rbacScope: 'super_admin',
          component: 'service',
        },
      });
      log.info(logTemplate.message, logTemplate.context);
    } catch (error) {
      log.error('delete organization failed', error, {
        operation: 'delete_organization',
        resourceId: organizationId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Get organization hierarchy for current user
   *
   * Uses external hierarchy helper to build tree structure.
   * Returns all accessible organizations in hierarchy.
   *
   * @param rootOrganizationId - Optional root to start from
   * @returns Array of organizations in hierarchy
   */
  async getAccessibleHierarchy(rootOrganizationId?: string): Promise<Organization[]> {
    const startTime = Date.now();

    try {
      // Check permissions
      if (!this.canReadAll && !this.canReadOrganization && !this.canReadOwn) {
        throw AuthorizationError(
          'You do not have permission to read organization hierarchy'
        );
      }

      if (rootOrganizationId) {
        // Check access to root
        if (!this.canAccessOrganization(rootOrganizationId)) {
          throw AuthorizationError('Access denied to root organization');
        }
        const hierarchy = await getOrganizationHierarchy(rootOrganizationId);

        const duration = Date.now() - startTime;
        log.info('organization hierarchy retrieved', {
          operation: 'get_organization_hierarchy',
          rootOrganizationId,
          userId: this.userContext.user_id,
          hierarchySize: hierarchy.length,
          duration,
          slow: duration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.getRBACScope(),
          component: 'service',
        });

        return hierarchy;
      }

      // Get hierarchy for all accessible organizations
      const accessibleOrgs = this.userContext.accessible_organizations || [];
      const hierarchies = new Map<string, Organization>();

      for (const org of accessibleOrgs) {
        const hierarchy = await getOrganizationHierarchy(org.organization_id);
        for (const hierarchyOrg of hierarchy) {
          hierarchies.set(hierarchyOrg.organization_id, hierarchyOrg);
        }
      }

      const result = Array.from(hierarchies.values());
      const duration = Date.now() - startTime;

      log.info('accessible hierarchies retrieved', {
        operation: 'get_accessible_hierarchy',
        userId: this.userContext.user_id,
        accessibleOrgCount: accessibleOrgs.length,
        totalHierarchySize: result.length,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        rbacScope: this.getRBACScope(),
        component: 'service',
      });

      return result;
    } catch (error) {
      log.error('get accessible hierarchy failed', error, {
        operation: 'get_accessible_hierarchy',
        userId: this.userContext.user_id,
        rootOrganizationId,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Get organization members
   *
   * Returns active users who are members of the organization.
   *
   * @param organizationId - Organization ID
   * @returns Array of organization members
   */
  async getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
    const startTime = Date.now();

    try {
      // Check organization access
      if (!this.canAccessOrganization(organizationId)) {
        throw AuthorizationError('Access denied to this organization');
      }

      // Check user read permission
      const canReadUsers =
        this.userContext.is_super_admin ||
        this.userContext.all_permissions?.some(
          (p) => p.name === 'users:read:organization' || p.name === 'users:read:all'
        );

      if (!canReadUsers) {
        throw AuthorizationError('You do not have permission to read organization members');
      }

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

      const duration = Date.now() - startTime;
      log.info('organization members retrieved', {
        operation: 'get_organization_members',
        organizationId,
        userId: this.userContext.user_id,
        memberCount: members.length,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        component: 'service',
      });

      return members as OrganizationMember[];
    } catch (error) {
      log.error('get organization members failed', error, {
        operation: 'get_organization_members',
        organizationId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Check if current user can manage specific organization
   *
   * @param organizationId - Organization ID
   * @returns True if user can manage organization
   */
  canManageOrganization(organizationId: string): boolean {
    if (this.userContext.is_super_admin) {
      return true;
    }

    if (!this.canAccessOrganization(organizationId)) {
      return false;
    }

    return (
      this.userContext.all_permissions?.some(
        (p) =>
          p.name === 'organizations:update:own' ||
          p.name === 'organizations:update:organization' ||
          p.name === 'organizations:manage:all'
      ) || false
    );
  }

  /**
   * Get all users with their membership status for a specific organization
   *
   * Returns all active users in the system with is_member flag.
   * Super admin only operation.
   *
   * @param organizationId - Organization ID
   * @returns Array of users with membership status
   */
  async getOrganizationUsersWithStatus(
    organizationId: string
  ): Promise<UserWithMembershipStatus[]> {
    const startTime = Date.now();

    try {
      // Check permission (super admin only)
      if (!this.canManage) {
        throw AuthorizationError(
          'You do not have permission to manage organization users'
        );
      }

      // Check organization access
      if (!this.canAccessOrganization(organizationId)) {
        throw AuthorizationError('Access denied to this organization');
      }

      // Get all active users in the system
      const allUsersStart = Date.now();
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
      const allUsersDuration = Date.now() - allUsersStart;

      // Get current members of this organization
      const membersStart = Date.now();
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
      const membersDuration = Date.now() - membersStart;

      // Create a map of member user_ids for O(1) lookup
      const memberMap = new Map(currentMembers.map((m) => [m.user_id, m.joined_at]));

      // Combine data: all users with membership flag
      const result = allUsers.map((user) => {
        const joinedAt = memberMap.get(user.user_id);
        const userWithStatus: UserWithMembershipStatus = {
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
          userWithStatus.joined_at = joinedAt;
        }

        return userWithStatus;
      });

      const duration = Date.now() - startTime;
      log.info('organization users with status retrieved', {
        operation: 'get_organization_users_with_status',
        organizationId,
        userId: this.userContext.user_id,
        totalUsers: result.length,
        members: currentMembers.length,
        duration,
        metadata: {
          allUsersQuery: {
            duration: allUsersDuration,
            slow: allUsersDuration > SLOW_THRESHOLDS.DB_QUERY,
          },
          membersQuery: {
            duration: membersDuration,
            slow: membersDuration > SLOW_THRESHOLDS.DB_QUERY,
          },
        },
        component: 'service',
      });

      return result;
    } catch (error) {
      log.error('get organization users with status failed', error, {
        operation: 'get_organization_users_with_status',
        organizationId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Batch update organization users
   *
   * Adds and removes user associations in a single operation.
   * Validates all users exist before adding.
   * Super admin only operation.
   *
   * @param organizationId - Organization ID
   * @param addUserIds - User IDs to add
   * @param removeUserIds - User IDs to remove
   * @returns Count of added and removed users
   */
  async updateOrganizationUsers(
    organizationId: string,
    addUserIds: string[],
    removeUserIds: string[]
  ): Promise<{ added: number; removed: number }> {
    const startTime = Date.now();

    try {
      // Check permission (super admin only)
      if (!this.canManage) {
        throw AuthorizationError(
          'You do not have permission to manage organization users'
        );
      }

      // Check organization access
      if (!this.canAccessOrganization(organizationId)) {
        throw AuthorizationError('Access denied to this organization');
      }

      let added = 0;
      let removed = 0;

      // Validate organization exists
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.organization_id, organizationId))
        .limit(1);

      if (!org) {
        throw NotFoundError('Organization');
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
          throw ValidationError(null, 'No valid users found to add');
        }

        // For each user, either insert new or reactivate existing
        for (const userId of validUserIds) {
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

      const duration = Date.now() - startTime;
      log.info('organization users updated', {
        operation: 'update_organization_users',
        organizationId,
        userId: this.userContext.user_id,
        added,
        removed,
        duration,
        slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
        component: 'service',
      });

      return { added, removed };
    } catch (error) {
      log.error('update organization users failed', error, {
        operation: 'update_organization_users',
        organizationId,
        userId: this.userContext.user_id,
        addUserIds: addUserIds.length,
        removeUserIds: removeUserIds.length,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create RBAC Organizations Service
 *
 * Factory function to create a new organizations service instance
 * with automatic RBAC enforcement.
 *
 * @param userContext - User context with RBAC permissions
 * @returns Service interface
 *
 * @example
 * ```typescript
 * const service = createRBACOrganizationsService(userContext);
 *
 * // List organizations
 * const orgs = await service.getOrganizations({ is_active: true });
 *
 * // Create with hierarchy
 * const newOrg = await service.createOrganization({
 *   name: 'Sub Clinic',
 *   slug: 'sub-clinic',
 *   parent_organization_id: parentId
 * });
 * ```
 */
export function createRBACOrganizationsService(
  userContext: UserContext
): OrganizationsServiceInterface {
  return new OrganizationsService(userContext);
}
