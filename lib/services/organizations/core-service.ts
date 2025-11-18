// 1. Drizzle ORM
import { and, count, desc, eq, isNull, like } from 'drizzle-orm';
// 4. Errors
import { AuthorizationError, NotFoundError, ValidationError } from '@/lib/api/responses/error';
// 2. Database
import { db, organizations, practices, user_organizations } from '@/lib/db';
// 3. Logging
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { calculateChanges, logTemplates, sanitizeFilters } from '@/lib/logger/message-templates';
// 6. Internal services and utilities
import { getOrganizationChildren } from '@/lib/rbac/organization-hierarchy';
// 5. Types
import type { UserContext } from '@/lib/types/rbac';
import { BaseOrganizationsService } from './base-service';
import { getBatchEnrichmentData } from './batch-operations';
import { validateCircularReference } from './hierarchy-validator';
import { mapPracticeInfo, validatePracticeUids } from './practice-mapper';
import { sanitizeLikePattern, validatePagination } from './sanitization';
import type {
  CreateOrganizationData,
  OrganizationQueryOptions,
  OrganizationWithDetails,
  UpdateOrganizationData,
} from './types';

/**
 * Organization Core Service
 *
 * Handles core CRUD operations:
 * - getOrganizations (with batched counts)
 * - getOrganizationById
 * - createOrganization
 * - updateOrganization
 * - deleteOrganization
 *
 * Extracted from monolithic rbac-organizations-service.ts (1365 lines)
 * to separate CRUD concerns from hierarchy and member management.
 *
 * @internal - Use factory function instead
 */
class OrganizationCoreService extends BaseOrganizationsService {
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
      // Validate and sanitize pagination parameters
      // Use high default limit unless explicitly paginating - users should see all their organizations
      const { limit, offset } = !options.limit && !options.offset
        ? { limit: 10000, offset: 0 } // No pagination - show all organizations
        : validatePagination(options.limit, options.offset);

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
            component: 'core_service',
          },
        });
        log.info(template.message, template.context);
        return [];
      }

      // Apply additional filters
      if (options.search) {
        // Sanitize search input to prevent LIKE pattern injection
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

      // Build complete query with practice mapping
      // Apply pagination at database level for efficiency
      const queryStart = Date.now();
      const baseResults = await db
        .select({
          organization_id: organizations.organization_id,
          name: organizations.name,
          slug: organizations.slug,
          parent_organization_id: organizations.parent_organization_id,
          practice_uids: organizations.practice_uids,
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
        .orderBy(desc(organizations.created_at))
        .limit(limit)
        .offset(offset);
      const queryDuration = Date.now() - queryStart;

      // Results already paginated at database level
      const results = baseResults;

      if (results.length === 0) {
        const template = logTemplates.crud.list('organizations', {
          userId: this.userContext.user_id,
          filters: sanitizeFilters(options as Record<string, unknown>),
          results: { returned: 0, total: 0, page: Math.floor(offset / limit) + 1 },
          duration: Date.now() - startTime,
          metadata: {
            query: { duration: queryDuration, slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY },
            rbacScope: this.getRBACScope(),
            component: 'core_service',
          },
        });
        log.info(template.message, template.context);
        return [];
      }

      // Collect all organization IDs for batched enrichment queries
      const organizationIds = results.map((row) => row.organization_id);

      // Get member and children counts in optimized batch query
      // Uses CTE optimization for datasets > 50 organizations (30-40% faster)
      const enrichmentStart = Date.now();
      const { memberCounts: memberCountMap, childrenCounts: childrenCountMap } =
        await getBatchEnrichmentData(organizationIds);
      const enrichmentDuration = Date.now() - enrichmentStart;

      // Enhance results with batched data
      const enhancedResults: OrganizationWithDetails[] = [];

      for (const row of results) {
        const enhanced: OrganizationWithDetails = {
          organization_id: row.organization_id,
          name: row.name,
          slug: row.slug,
          parent_organization_id: row.parent_organization_id || undefined,
          practice_uids: row.practice_uids || [],
          is_active: row.is_active ?? true,
          created_at: row.created_at ?? new Date(),
          updated_at: row.updated_at ?? new Date(),
          deleted_at: row.deleted_at || undefined,
          member_count: memberCountMap.get(row.organization_id) || 0,
          children_count: childrenCountMap.get(row.organization_id) || 0,
          practice_info: mapPracticeInfo(row),
        };

        enhancedResults.push(enhanced);
      }

      const duration = Date.now() - startTime;
      const page = Math.floor(offset / limit) + 1;

      const template = logTemplates.crud.list('organizations', {
        userId: this.userContext.user_id,
        ...(this.userContext.current_organization_id && {
          organizationId: this.userContext.current_organization_id,
        }),
        filters: sanitizeFilters(options as Record<string, unknown>),
        results: {
          returned: enhancedResults.length,
          total: enhancedResults.length, // Can't determine total without extra query
          page,
          hasMore: enhancedResults.length === limit, // If we got a full page, there might be more
        },
        duration,
        metadata: {
          query: { duration: queryDuration, slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY },
          enrichmentQuery: {
            duration: enrichmentDuration,
            slow: enrichmentDuration > SLOW_THRESHOLDS.DB_QUERY,
            usedCTE: organizationIds.length >= 50,
          },
          rbacScope: this.getRBACScope(),
          batchOptimized: true,
          component: 'core_service',
        },
      });
      log.info(template.message, template.context);

      return enhancedResults;
    } catch (error) {
      log.error('list organizations failed', error, {
        operation: 'list_organizations',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'core_service',
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
            component: 'core_service',
          },
        });
        log.info(template.message, template.context);
        throw AuthorizationError('Access denied to this organization');
      }

      // Query single organization directly
      const queryStart = Date.now();
      const [result] = await db
        .select({
          organization_id: organizations.organization_id,
          name: organizations.name,
          slug: organizations.slug,
          parent_organization_id: organizations.parent_organization_id,
          practice_uids: organizations.practice_uids,
          is_active: organizations.is_active,
          created_at: organizations.created_at,
          updated_at: organizations.updated_at,
          deleted_at: organizations.deleted_at,
          practice_id: practices.practice_id,
          practice_domain: practices.domain,
          practice_status: practices.status,
          practice_template_id: practices.template_id,
        })
        .from(organizations)
        .leftJoin(practices, eq(organizations.organization_id, practices.practice_id))
        .where(
          and(
            eq(organizations.organization_id, organizationId),
            eq(organizations.is_active, true),
            isNull(organizations.deleted_at)
          )
        )
        .limit(1);
      const queryDuration = Date.now() - queryStart;

      if (!result) {
        const template = logTemplates.crud.read('organization', {
          resourceId: organizationId,
          userId: this.userContext.user_id,
          duration: Date.now() - startTime,
          found: false,
          metadata: {
            query: { duration: queryDuration, slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY },
            component: 'core_service',
          },
        });
        log.info(template.message, template.context);
        return null;
      }

      // Get member count
      const [memberCountResult] = await db
        .select({ count: count() })
        .from(user_organizations)
        .where(
          and(
            eq(user_organizations.organization_id, organizationId),
            eq(user_organizations.is_active, true)
          )
        );

      // Get children count
      const [childrenCountResult] = await db
        .select({ count: count() })
        .from(organizations)
        .where(
          and(
            eq(organizations.parent_organization_id, organizationId),
            eq(organizations.is_active, true),
            isNull(organizations.deleted_at)
          )
        );

      const enhanced: OrganizationWithDetails = {
        organization_id: result.organization_id,
        name: result.name,
        slug: result.slug,
        parent_organization_id: result.parent_organization_id || undefined,
        practice_uids: result.practice_uids || [],
        is_active: result.is_active ?? true,
        created_at: result.created_at ?? new Date(),
        updated_at: result.updated_at ?? new Date(),
        deleted_at: result.deleted_at || undefined,
        member_count: memberCountResult?.count ? Number(memberCountResult.count) : 0,
        children_count: childrenCountResult?.count ? Number(childrenCountResult.count) : 0,
        practice_info: mapPracticeInfo(result),
      };

      const duration = Date.now() - startTime;
      const template = logTemplates.crud.read('organization', {
        resourceId: organizationId,
        resourceName: enhanced.name,
        userId: this.userContext.user_id,
        duration,
        found: true,
        metadata: {
          slug: enhanced.slug,
          memberCount: enhanced.member_count,
          childrenCount: enhanced.children_count,
          rbacScope: this.getRBACScope(),
          component: 'core_service',
        },
      });
      log.info(template.message, template.context);

      return enhanced;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      log.error('read organization failed', error, {
        operation: 'read_organization',
        resourceId: organizationId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'core_service',
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

      // Validate and sanitize practice_uids for analytics security
      const validatedPracticeUids = validatePracticeUids(data.practice_uids) || [];

      // Create organization
      const [newOrg] = await db
        .insert(organizations)
        .values({
          name: data.name,
          slug: data.slug,
          parent_organization_id: data.parent_organization_id,
          practice_uids: validatedPracticeUids,
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
          component: 'core_service',
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
        component: 'core_service',
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

          // Prevent circular references (comprehensive check)
          // Only validate if parent is actually changing
          if (data.parent_organization_id !== existing.parent_organization_id) {
            const { createOrganizationHierarchyService } = await import('./hierarchy-service');
            const hierarchyService = createOrganizationHierarchyService(this.userContext);

            await validateCircularReference(
              organizationId,
              data.parent_organization_id,
              (id) => hierarchyService.getOrganizationDescendants(id)
            );
          }
        }
      }

      // Validate and sanitize practice_uids if being updated
      const updateData: UpdateOrganizationData = { ...data };
      if (data.practice_uids !== undefined) {
        updateData.practice_uids = validatePracticeUids(data.practice_uids) || [];
      }

      // Calculate changes for audit trail
      const changes = calculateChanges(existing, updateData, [
        'name',
        'slug',
        'parent_organization_id',
        'is_active',
        'practice_uids',
      ]);

      // Build update object explicitly to ensure null values are handled correctly
      const dbUpdateData: Partial<typeof organizations.$inferInsert> = {
        updated_at: new Date(),
      };

      // Only include fields that are actually being updated
      if (updateData.name !== undefined) dbUpdateData.name = updateData.name;
      if (updateData.slug !== undefined) dbUpdateData.slug = updateData.slug;
      if (updateData.is_active !== undefined) dbUpdateData.is_active = updateData.is_active;
      if (updateData.practice_uids !== undefined) dbUpdateData.practice_uids = updateData.practice_uids;

      // Explicitly handle parent_organization_id including null values
      if (updateData.parent_organization_id !== undefined) {
        dbUpdateData.parent_organization_id = updateData.parent_organization_id;
      }

      // Update organization
      const [updatedOrg] = await db
        .update(organizations)
        .set(dbUpdateData)
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
          component: 'core_service',
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
        component: 'core_service',
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
          component: 'core_service',
        },
      });
      log.info(logTemplate.message, logTemplate.context);
    } catch (error) {
      log.error('delete organization failed', error, {
        operation: 'delete_organization',
        resourceId: organizationId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'core_service',
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
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create Organization Core Service
 *
 * @param userContext - User context with RBAC permissions
 * @returns Core service instance
 */
export function createOrganizationCoreService(userContext: UserContext): OrganizationCoreService {
  return new OrganizationCoreService(userContext);
}
