import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user_organizations } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/types/rbac';
import type { UserWithOrganizations } from './rbac-users-service';
import { createRBACUsersService } from './rbac-users-service';

/**
 * User Organization Service
 *
 * Manages user-organization membership relationships with RBAC controls.
 *
 * **Core Operations**:
 * - Add user to organization
 * - Remove user from organization
 * - Get users in organization
 *
 * **Security Features**:
 * - Self-removal prevention
 * - Organization access validation
 * - Permission-based filtering
 *
 * @example
 * ```typescript
 * const service = createUserOrganizationService(userContext);
 *
 * // Add user to organization
 * await service.addUserToOrganization('user-123', 'org-456');
 *
 * // Get all users in organization
 * const users = await service.getUsersInOrganization('org-456');
 *
 * // Remove user from organization
 * await service.removeUserFromOrganization('user-123', 'org-456');
 * ```
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * User Organization Service Interface
 */
export interface UserOrganizationServiceInterface {
  addUserToOrganization(userId: string, organizationId: string): Promise<void>;
  removeUserFromOrganization(userId: string, organizationId: string): Promise<void>;
  getUsersInOrganization(organizationId: string): Promise<UserWithOrganizations[]>;
}

// ============================================================================
// Service Implementation
// ============================================================================

class UserOrganizationService implements UserOrganizationServiceInterface {
  private readonly isSuperAdmin: boolean;
  private readonly accessibleOrganizationIds: string[];

  constructor(private readonly userContext: UserContext) {
    this.isSuperAdmin = userContext.is_super_admin || false;
    this.accessibleOrganizationIds =
      userContext.accessible_organizations?.map((org) => org.organization_id) || [];
  }

  /**
   * Check if user can access an organization
   */
  private canAccessOrganization(organizationId: string): boolean {
    if (this.isSuperAdmin) {
      return true;
    }
    return this.accessibleOrganizationIds.includes(organizationId);
  }

  /**
   * Require organization access or throw error
   */
  private requireOrganizationAccess(organizationId: string): void {
    if (!this.canAccessOrganization(organizationId)) {
      throw new PermissionDeniedError('organization:access', organizationId);
    }
  }

  /**
   * Require permission or throw error
   */
  private requirePermission(permission: string, resourceId?: string): void {
    const hasPermission = this.userContext.all_permissions?.some((p) => p.name === permission);
    if (!hasPermission && !this.isSuperAdmin) {
      throw new PermissionDeniedError(permission, resourceId || 'unknown');
    }
  }

  /**
   * Add user to organization
   */
  async addUserToOrganization(userId: string, organizationId: string): Promise<void> {
    const startTime = Date.now();

    try {
      this.requirePermission('users:create:organization', userId);
      this.requireOrganizationAccess(organizationId);

      // Check if user already belongs to organization
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

      const wasReactivated = !!existing && !existing.is_active;

      if (existing) {
        if (!existing.is_active) {
          // Reactivate existing membership
          await db
            .update(user_organizations)
            .set({
              is_active: true,
              joined_at: new Date(),
            })
            .where(eq(user_organizations.user_organization_id, existing.user_organization_id));
        }
      } else {
        // Create new organization membership
        await db.insert(user_organizations).values({
          user_id: userId,
          organization_id: organizationId,
          is_active: true,
        });
      }

      const duration = Date.now() - startTime;

      log.info('user added to organization', {
        operation: 'add_user_to_organization',
        userId: this.userContext.user_id,
        targetUserId: userId,
        organizationId,
        duration,
        metadata: {
          reactivated: wasReactivated,
          component: 'service',
        },
      });
    } catch (error) {
      log.error('add user to organization failed', error, {
        operation: 'add_user_to_organization',
        userId: this.userContext.user_id,
        targetUserId: userId,
        organizationId,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Remove user from organization
   */
  async removeUserFromOrganization(userId: string, organizationId: string): Promise<void> {
    const startTime = Date.now();

    try {
      this.requirePermission('users:delete:organization', userId);
      this.requireOrganizationAccess(organizationId);

      // Prevent removing self from organization
      if (userId === this.userContext.user_id) {
        throw new Error('Cannot remove yourself from organization');
      }

      // Deactivate organization membership
      await db
        .update(user_organizations)
        .set({
          is_active: false,
        })
        .where(
          and(
            eq(user_organizations.user_id, userId),
            eq(user_organizations.organization_id, organizationId)
          )
        );

      const duration = Date.now() - startTime;

      log.info('user removed from organization', {
        operation: 'remove_user_from_organization',
        userId: this.userContext.user_id,
        targetUserId: userId,
        organizationId,
        duration,
        metadata: {
          soft: true,
          component: 'service',
        },
      });
    } catch (error) {
      log.error('remove user from organization failed', error, {
        operation: 'remove_user_from_organization',
        userId: this.userContext.user_id,
        targetUserId: userId,
        organizationId,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Get users in a specific organization
   */
  async getUsersInOrganization(organizationId: string): Promise<UserWithOrganizations[]> {
    this.requireOrganizationAccess(organizationId);

    // Delegate to users service for the actual query
    const usersService = createRBACUsersService(this.userContext);
    return await usersService.getUsers({ organizationId });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Factory function to create User Organization Service
 */
export function createUserOrganizationService(
  userContext: UserContext
): UserOrganizationServiceInterface {
  return new UserOrganizationService(userContext);
}
