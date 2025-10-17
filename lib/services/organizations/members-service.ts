import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { AuthorizationError, NotFoundError, ValidationError } from '@/lib/api/responses/error';
import { db, organizations, user_organizations, users } from '@/lib/db';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { BaseOrganizationsService } from './base-service';
import { getBatchMemberCounts } from './query-builder';
import type {
  OrganizationMember,
  OrganizationMembersServiceInterface,
  UserWithMembershipStatus,
} from './types';

/**
 * Organization Members Service
 *
 * Handles all user-organization association management:
 * - Member listing
 * - Member status tracking
 * - Batch add/remove operations
 * - Member count queries
 *
 * Extracted from monolithic organizations service for better separation of concerns.
 *
 * Now extends BaseOrganizationsService to eliminate duplicated permission
 * checking logic (25 lines removed).
 *
 * @internal - Use factory function instead
 */
class OrganizationMembersService
  extends BaseOrganizationsService
  implements OrganizationMembersServiceInterface
{
  // All base permission properties inherited from BaseOrganizationsService
  // canAccessOrganization() is also inherited

  private readonly canReadUsers: boolean;

  constructor(userContext: UserContext) {
    super(userContext);

    // Additional permission check specific to members service
    this.canReadUsers =
      userContext.is_super_admin ||
      userContext.all_permissions?.some(
        (p) => p.name === 'users:read:organization' || p.name === 'users:read:all'
      ) ||
      false;
  }

  /**
   * Get organization members
   *
   * Returns active users who are members of the organization.
   * Requires user read permission and organization access.
   *
   * @param organizationId - Organization ID
   * @returns Array of organization members
   * @throws {AuthorizationError} If user lacks permission
   */
  async getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
    const startTime = Date.now();

    try {
      // Check organization access
      if (!this.canAccessOrganization(organizationId)) {
        throw AuthorizationError('Access denied to this organization');
      }

      // Check user read permission
      if (!this.canReadUsers) {
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
        component: 'members_service',
      });

      return members as OrganizationMember[];
    } catch (error) {
      log.error('get organization members failed', error, {
        operation: 'get_organization_members',
        organizationId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'members_service',
      });
      throw error;
    }
  }

  /**
   * Get all users with their membership status for a specific organization
   *
   * Returns all active users in the system with is_member flag.
   * Super admin only operation for member management UIs.
   *
   * @param organizationId - Organization ID
   * @returns Array of users with membership status
   * @throws {AuthorizationError} If user is not super admin
   */
  async getOrganizationUsersWithStatus(
    organizationId: string
  ): Promise<UserWithMembershipStatus[]> {
    const startTime = Date.now();

    try {
      // Check permission (super admin only)
      if (!this.canManage) {
        throw AuthorizationError('You do not have permission to manage organization users');
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
        component: 'members_service',
      });

      return result;
    } catch (error) {
      log.error('get organization users with status failed', error, {
        operation: 'get_organization_users_with_status',
        organizationId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'members_service',
      });
      throw error;
    }
  }

  /**
   * Add a user to an organization
   *
   * Creates new user-organization association or reactivates inactive one.
   *
   * @param organizationId - Organization ID
   * @param userId - User ID to add
   * @throws {AuthorizationError} If user lacks permission
   * @throws {NotFoundError} If organization or user not found
   */
  async addUserToOrganization(organizationId: string, userId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canManage) {
        throw AuthorizationError('You do not have permission to manage organization users');
      }

      // Check organization access
      if (!this.canAccessOrganization(organizationId)) {
        throw AuthorizationError('Access denied to this organization');
      }

      // Validate organization exists
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.organization_id, organizationId))
        .limit(1);

      if (!org) {
        throw NotFoundError('Organization');
      }

      // Validate user exists and is active
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.user_id, userId), eq(users.is_active, true), isNull(users.deleted_at)))
        .limit(1);

      if (!user) {
        throw NotFoundError('User');
      }

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
            .where(eq(user_organizations.user_organization_id, existing.user_organization_id));
        }
        // Already active - no action needed
      } else {
        // Create new association
        await db.insert(user_organizations).values({
          user_id: userId,
          organization_id: organizationId,
          is_active: true,
          joined_at: new Date(),
        });
      }

      const duration = Date.now() - startTime;
      log.info('user added to organization', {
        operation: 'add_user_to_organization',
        organizationId,
        targetUserId: userId,
        userId: this.userContext.user_id,
        duration,
        slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
        component: 'members_service',
      });
    } catch (error) {
      log.error('add user to organization failed', error, {
        operation: 'add_user_to_organization',
        organizationId,
        targetUserId: userId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'members_service',
      });
      throw error;
    }
  }

  /**
   * Remove a user from an organization (soft delete)
   *
   * @param organizationId - Organization ID
   * @param userId - User ID to remove
   * @throws {AuthorizationError} If user lacks permission
   */
  async removeUserFromOrganization(organizationId: string, userId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Check permission
      if (!this.canManage) {
        throw AuthorizationError('You do not have permission to manage organization users');
      }

      // Check organization access
      if (!this.canAccessOrganization(organizationId)) {
        throw AuthorizationError('Access denied to this organization');
      }

      await db
        .update(user_organizations)
        .set({
          is_active: false,
        })
        .where(
          and(
            eq(user_organizations.organization_id, organizationId),
            eq(user_organizations.user_id, userId),
            eq(user_organizations.is_active, true)
          )
        );

      const duration = Date.now() - startTime;
      log.info('user removed from organization', {
        operation: 'remove_user_from_organization',
        organizationId,
        targetUserId: userId,
        userId: this.userContext.user_id,
        duration,
        slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
        component: 'members_service',
      });
    } catch (error) {
      log.error('remove user from organization failed', error, {
        operation: 'remove_user_from_organization',
        organizationId,
        targetUserId: userId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'members_service',
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
   * @throws {AuthorizationError} If user is not super admin
   * @throws {NotFoundError} If organization not found
   * @throws {ValidationError} If no valid users to add
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
        throw AuthorizationError('You do not have permission to manage organization users');
      }

      // Check organization access
      if (!this.canAccessOrganization(organizationId)) {
        throw AuthorizationError('Access denied to this organization');
      }

      // Validate organization exists (outside transaction for early validation)
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.organization_id, organizationId))
        .limit(1);

      if (!org) {
        throw NotFoundError('Organization');
      }

      // Wrap all mutations in a transaction for consistency
      const { added, removed } = await db.transaction(async (tx) => {
        // Set statement timeout for this transaction (30 seconds)
        // Prevents long-running transactions from holding locks indefinitely
        await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);

        let addedCount = 0;
        let removedCount = 0;

        // Process additions
        if (addUserIds.length > 0) {
          // Validate all users exist and are active
          const existingUsers = await tx
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
            const [existing] = await tx
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
                await tx
                  .update(user_organizations)
                  .set({
                    is_active: true,
                    joined_at: new Date(),
                  })
                  .where(
                    eq(user_organizations.user_organization_id, existing.user_organization_id)
                  );
                addedCount++;
              }
              // Already active - skip
            } else {
              // Insert new association
              await tx.insert(user_organizations).values({
                user_id: userId,
                organization_id: organizationId,
                is_active: true,
                joined_at: new Date(),
              });
              addedCount++;
            }
          }
        }

        // Process removals (soft delete)
        if (removeUserIds.length > 0) {
          const result = await tx
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

          removedCount = result.length;
        }

        return { added: addedCount, removed: removedCount };
      });

      const duration = Date.now() - startTime;
      log.info('organization users updated', {
        operation: 'update_organization_users',
        organizationId,
        userId: this.userContext.user_id,
        added,
        removed,
        duration,
        slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
        component: 'members_service',
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
        component: 'members_service',
      });
      throw error;
    }
  }

  /**
   * Get member count for a single organization
   *
   * @param organizationId - Organization ID
   * @returns Member count
   */
  async getMemberCount(organizationId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(user_organizations)
      .where(
        and(
          eq(user_organizations.organization_id, organizationId),
          eq(user_organizations.is_active, true)
        )
      );

    return result?.count ? Number(result.count) : 0;
  }

  /**
   * Get member counts for multiple organizations
   * Uses optimized batch query from query builder
   *
   * @param organizationIds - Array of organization IDs
   * @returns Map of organization_id -> member count
   */
  async getBatchMemberCounts(organizationIds: string[]): Promise<Map<string, number>> {
    return getBatchMemberCounts(organizationIds);
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create Organization Members Service
 *
 * @param userContext - User context with RBAC permissions
 * @returns Members service interface
 */
export function createOrganizationMembersService(
  userContext: UserContext
): OrganizationMembersServiceInterface {
  return new OrganizationMembersService(userContext);
}
