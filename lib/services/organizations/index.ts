import { and, desc, eq, inArray, isNull, like, sql, type SQL } from 'drizzle-orm';
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '@/lib/api/responses/error';
import { db, organizations } from '@/lib/db';
import { SLOW_THRESHOLDS, log } from '@/lib/logger';
import { calculateChanges, logTemplates, sanitizeFilters } from '@/lib/logger/message-templates';
import { getOrganizationChildren } from '@/lib/rbac/organization-hierarchy';
import type { Organization, UserContext } from '@/lib/types/rbac';
import {
  createOrganizationQueryBuilder,
  getBatchEnrichmentData,
  mapPracticeInfo,
  buildBaseWhereConditions,
} from './query-builder';
import { createOrganizationMembersService } from './members-service';
import { createOrganizationHierarchyService } from './hierarchy-service';
import { sanitizeLikePattern, validatePagination } from './sanitization';
import type {
  CreateOrganizationData,
  OrganizationQueryOptions,
  OrganizationWithDetails,
  UpdateOrganizationData,
  OrganizationsServiceInterface,
  OrganizationMember,
  UserWithMembershipStatus,
  RawOrganizationRow,
} from './types';

/**
 * Organizations Service with RBAC (Refactored)
 *
 * Main CRUD service for practice organizations with automatic permission checking.
 * Maps the healthcare 'practices' concept to RBAC 'organizations'.
 *
 * Refactored to use:
 * - Query builder for reusable patterns
 * - Separate members service for user management
 * - Separate hierarchy service for tree operations
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
class OrganizationsService implements OrganizationsServiceInterface {
  private readonly canReadAll: boolean;
  private readonly canReadOrganization: boolean;
  private readonly canReadOwn: boolean;
  private readonly canCreate: boolean;
  private readonly canUpdate: boolean;
  private readonly canDelete: boolean;
  private readonly accessibleOrgIds: string[];

  // Delegated services
  private readonly membersService: ReturnType<typeof createOrganizationMembersService>;
  private readonly hierarchyService: ReturnType<typeof createOrganizationHierarchyService>;

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

    this.canDelete =
      userContext.is_super_admin ||
      userContext.all_permissions?.some((p) => p.name === 'organizations:manage:all') ||
      false;

    this.accessibleOrgIds =
      userContext.accessible_organizations?.map((org) => org.organization_id) || [];

    // Initialize delegated services
    this.membersService = createOrganizationMembersService(userContext);
    this.hierarchyService = createOrganizationHierarchyService(userContext);
  }

  /**
   * Build RBAC WHERE conditions based on user permissions
   * Filters at database level for performance
   */
  private buildRBACWhereConditions(): SQL[] {
    const conditions: SQL[] = buildBaseWhereConditions() as SQL[];

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
   * Uses query builder to eliminate duplication.
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
      if (!this.canReadAll && !this.canReadOrganization && !this.canReadOwn) {
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

      // Validate and sanitize pagination parameters
      const { limit, offset } = validatePagination(options.limit, options.offset);

      // Apply additional filters
      if (options.organization_id) {
        whereConditions.push(eq(organizations.organization_id, options.organization_id));
      }

      if (options.search) {
        // Sanitize search input to prevent SQL injection via LIKE pattern
        const sanitizedSearch = sanitizeLikePattern(options.search);
        whereConditions.push(like(organizations.name, `%${sanitizedSearch}%`));
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

      // Use query builder for base query
      const queryStart = Date.now();
      const baseResults = await createOrganizationQueryBuilder()
        .where(and(...whereConditions))
        .orderBy(desc(organizations.created_at));
      const queryDuration = Date.now() - queryStart;

      // Apply pagination manually (after filtering) using validated parameters
      const results = baseResults.slice(offset, offset + limit);

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

      // Get enrichment data (member counts + children counts) in batch
      const enrichmentStart = Date.now();
      const { memberCounts, childrenCounts } = await getBatchEnrichmentData(organizationIds);
      const enrichmentDuration = Date.now() - enrichmentStart;

      // Enhance results with batched data using helper
      const enhancedResults: OrganizationWithDetails[] = results.map((row) => ({
        organization_id: row.organization_id,
        name: row.name,
        slug: row.slug,
        parent_organization_id: row.parent_organization_id || undefined,
        is_active: row.is_active ?? true,
        created_at: row.created_at ?? new Date(),
        updated_at: row.updated_at ?? new Date(),
        deleted_at: row.deleted_at || undefined,
        member_count: memberCounts.get(row.organization_id) || 0,
        children_count: childrenCounts.get(row.organization_id) || 0,
        practice_info: mapPracticeInfo(row as RawOrganizationRow),
      }));

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
          enrichment: {
            duration: enrichmentDuration,
            slow: enrichmentDuration > SLOW_THRESHOLDS.DB_QUERY,
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
   * Reuses getOrganizations for consistency.
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
        throw AuthorizationError('You do not have permission to read organizations');
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

      // Reuse getOrganizations with ID filtering
      const results = await this.getOrganizations({
        organization_id: organizationId,
        limit: 1
      });

      const result = results[0] || null;

      if (!result) {
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
        throw AuthorizationError('You do not have permission to create organizations');
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
   * Validates parent organization and uses hierarchy service for circular reference check.
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
        throw AuthorizationError('You do not have permission to update organizations');
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

          // Use hierarchy service to prevent circular references
          const isValid = await this.hierarchyService.validateHierarchyMove(
            organizationId,
            data.parent_organization_id
          );

          if (!isValid) {
            throw ValidationError(null, 'Cannot create circular organization hierarchy');
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
   * - Cannot delete if has active members (uses members service)
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
        throw AuthorizationError('You do not have permission to delete organizations');
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
        throw ValidationError(null, 'Cannot delete organization with child organizations');
      }

      // Check for active members using members service
      const memberCount = await this.membersService.getMemberCount(organizationId);
      if (memberCount > 0) {
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

  // ============================================================
  // DELEGATED METHODS
  // ============================================================

  /**
   * Get organization hierarchy - delegates to hierarchy service
   */
  async getAccessibleHierarchy(rootOrganizationId?: string): Promise<Organization[]> {
    return this.hierarchyService.getAccessibleHierarchy(rootOrganizationId);
  }

  /**
   * Get organization members - delegates to members service
   */
  async getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
    return this.membersService.getOrganizationMembers(organizationId);
  }

  /**
   * Get organization users with status - delegates to members service
   */
  async getOrganizationUsersWithStatus(
    organizationId: string
  ): Promise<UserWithMembershipStatus[]> {
    return this.membersService.getOrganizationUsersWithStatus(organizationId);
  }

  /**
   * Update organization users - delegates to members service
   */
  async updateOrganizationUsers(
    organizationId: string,
    addUserIds: string[],
    removeUserIds: string[]
  ): Promise<{ added: number; removed: number }> {
    return this.membersService.updateOrganizationUsers(organizationId, addUserIds, removeUserIds);
  }

  /**
   * Check if current user can manage specific organization
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

// Re-export types for consumers
export type {
  OrganizationsServiceInterface,
  OrganizationWithDetails,
  OrganizationMember,
  UserWithMembershipStatus,
  CreateOrganizationData,
  UpdateOrganizationData,
  OrganizationQueryOptions,
} from './types';
