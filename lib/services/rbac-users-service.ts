import { and, count, eq } from 'drizzle-orm';
import { ensureSecurityRecord, hashPassword } from '@/lib/auth/security';
import { account_security, db } from '@/lib/db';
import { user_organizations, users } from '@/lib/db/schema';
import { calculateChanges, log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/types/rbac';
import {
  applyUserSearchFilters,
  buildSingleUserWithOrganizations,
  buildUserRBACConditions,
  getSingleUserQuery,
  getUsersBaseQuery,
  groupUsersByIdWithOrganizations,
} from './users/query-builders';
import {
  canAccessOrganization,
  getRBACScope,
  requireAnyPermission,
  requireOrganizationAccess,
  requirePermission,
} from './users/rbac-helpers';

/**
 * Users Service with RBAC
 *
 * Provides core user management with automatic permission-based filtering.
 *
 * **RBAC Scopes**:
 * - `own`: Users can only access their own user record
 * - `organization`: Users can access users within their accessible organizations
 * - `all`: Super admins can access all users across all organizations
 *
 * **Core Operations**:
 * - List users with RBAC filtering
 * - Get single user by ID
 * - Create new users with security record initialization
 * - Update users with password tracking
 * - Soft delete users
 * - Search users
 * - Count users
 * - Check user management permissions
 *
 * **Security Features**:
 * - Automatic account_security record creation on user creation
 * - Password change tracking in account_security table
 * - Transaction handling for user updates with role assignments
 * - Self-deletion prevention
 *
 * **Note**: For organization membership management (add/remove users to/from organizations),
 * use the `user-organization-service.ts` instead.
 *
 * @example
 * ```typescript
 * const service = createRBACUsersService(userContext);
 *
 * // List users (automatically filtered by RBAC)
 * const users = await service.getUsers({ organizationId: 'org-123' });
 *
 * // Create user
 * const newUser = await service.createUser({
 *   email: 'user@example.com',
 *   password: 'secure-password',
 *   first_name: 'John',
 *   last_name: 'Doe',
 *   organization_id: 'org-123',
 * });
 *
 * // Update user with role assignment
 * const updated = await service.updateUser('user-123', {
 *   role_ids: ['role-admin', 'role-user'],
 * });
 * ```
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface CreateUserData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  organization_id: string;
  email_verified?: boolean;
  is_active?: boolean;
}

export interface UpdateUserData {
  first_name?: string;
  last_name?: string;
  email?: string;
  password?: string;
  email_verified?: boolean;
  is_active?: boolean;
  provider_uid?: number | null | undefined;
}

export interface UserQueryOptions {
  organizationId?: string | undefined;
  search?: string | undefined;
  is_active?: boolean | undefined;
  email_verified?: boolean | undefined;
  limit?: number;
  offset?: number;
}

export interface UserWithOrganizations {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  email_verified: boolean;
  is_active: boolean;
  provider_uid?: number | null | undefined;
  created_at: Date;
  updated_at: Date;
  organizations: {
    organization_id: string;
    name: string;
    slug: string;
    is_active: boolean;
  }[];
}

/**
 * Users Service Interface
 */
export interface UsersServiceInterface {
  getUsers(options?: UserQueryOptions): Promise<UserWithOrganizations[]>;
  getUserById(userId: string): Promise<UserWithOrganizations | null>;
  createUser(userData: CreateUserData): Promise<UserWithOrganizations>;
  updateUser(userId: string, updateData: UpdateUserData): Promise<UserWithOrganizations>;
  deleteUser(userId: string): Promise<void>;
  searchUsers(searchTerm: string, organizationId?: string): Promise<UserWithOrganizations[]>;
  getUserCount(organizationId?: string): Promise<number>;
}

// ============================================================================
// Service Implementation
// ============================================================================

class RBACUsersService implements UsersServiceInterface {
  // Permission flags cached in constructor
  private readonly canReadAll: boolean;
  private readonly canReadOrganization: boolean;
  private readonly canReadOwn: boolean;
  private readonly canUpdate: boolean;
  private readonly canUpdateOwn: boolean;
  private readonly canUpdateOrganization: boolean;
  private readonly isSuperAdmin: boolean;
  private readonly accessibleOrganizationIds: string[];

  constructor(private readonly userContext: UserContext) {
    // Cache permission checks in constructor (called once)
    const permissions = userContext.all_permissions || [];

    this.canReadAll = permissions.some((p) => p.name === 'users:read:all');
    this.canReadOrganization = permissions.some((p) => p.name === 'users:read:organization');
    this.canReadOwn = permissions.some((p) => p.name === 'users:read:own');
    this.canUpdate = permissions.some((p) => p.name === 'users:update:all');
    this.canUpdateOwn = permissions.some((p) => p.name === 'users:update:own');
    this.canUpdateOrganization = permissions.some((p) => p.name === 'users:update:organization');
    this.isSuperAdmin = userContext.is_super_admin || false;

    // Cache accessible organization IDs
    this.accessibleOrganizationIds =
      userContext.accessible_organizations?.map((org) => org.organization_id) || [];
  }

  /**
   * Get users with automatic permission-based filtering
   */
  async getUsers(options: UserQueryOptions = {}): Promise<UserWithOrganizations[]> {
    const startTime = Date.now();

    try {
      // Build RBAC where conditions using query builder
      const whereConditions = buildUserRBACConditions(
        this.canReadAll,
        this.canReadOrganization,
        this.accessibleOrganizationIds,
        this.userContext.user_id
      );

      // If organization scope and no accessible orgs, return empty
      const scope = getRBACScope(this.canReadAll, this.canReadOrganization);
      if (scope === 'organization' && this.accessibleOrganizationIds.length === 0) {
        return [];
      }

      // Apply additional filters
      if (options.organizationId) {
        requireOrganizationAccess(
          options.organizationId,
          this.isSuperAdmin,
          this.accessibleOrganizationIds
        );
        whereConditions.push(eq(user_organizations.organization_id, options.organizationId));
      }

      if (options.is_active !== undefined) {
        whereConditions.push(eq(users.is_active, options.is_active));
      }

      if (options.email_verified !== undefined) {
        whereConditions.push(eq(users.email_verified, options.email_verified));
      }

      // Apply search filters using query builder
      applyUserSearchFilters(whereConditions, options.search);

      // Execute query using base query builder
      const queryStart = Date.now();
      const baseQuery = getUsersBaseQuery().where(and(...whereConditions));

      // Execute base query
      const baseResults = await baseQuery;
      const queryDuration = Date.now() - queryStart;

      // Apply pagination manually if needed
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

      // Group by user and aggregate organizations using query builder
      const usersMap = groupUsersByIdWithOrganizations(results);

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.list('users', {
        userId: this.userContext.user_id,
        ...(this.userContext.current_organization_id && {
          organizationId: this.userContext.current_organization_id,
        }),
        filters: {
          organizationId: options.organizationId,
          search: options.search,
          is_active: options.is_active,
          email_verified: options.email_verified,
        },
        results: {
          returned: usersMap.size,
          total: usersMap.size,
          page: options.offset ? Math.floor(options.offset / (options.limit || 50)) + 1 : 1,
        },
        duration,
        metadata: {
          usersQuery: { duration: queryDuration, slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY },
          rbacScope: scope,
          component: 'service',
        },
      });

      log.info(template.message, template.context);

      return Array.from(usersMap.values());
    } catch (error) {
      log.error('get users failed', error, {
        operation: 'get_users',
        userId: this.userContext.user_id,
        filters: options,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Get a specific user by ID with permission checking
   */
  async getUserById(userId: string): Promise<UserWithOrganizations | null> {
    const startTime = Date.now();

    try {
      // Check if user can access this specific user
      if (!this.canReadOwn && !this.canReadOrganization && !this.canReadAll) {
        throw new PermissionDeniedError('users:read:*', userId);
      }

      // Get user with organizations using query builder
      const queryStart = Date.now();
      const results = await getSingleUserQuery(userId);
      const queryDuration = Date.now() - queryStart;

      // Build user object using query builder
      const userObj = buildSingleUserWithOrganizations(results);

      if (!userObj) {
        return null;
      }

      // For organization scope, verify user is in accessible organization
      if (this.canReadOrganization && !this.canReadAll && !this.canReadOwn) {
        const hasSharedOrg = userObj.organizations.some((org) =>
          canAccessOrganization(
            org.organization_id,
            this.isSuperAdmin,
            this.accessibleOrganizationIds
          )
        );

        if (!hasSharedOrg) {
          throw new PermissionDeniedError('users:read:organization', userId);
        }
      }

      const duration = Date.now() - startTime;
      const scope = getRBACScope(this.canReadAll, this.canReadOrganization);

      const template = logTemplates.crud.read('user', {
        resourceId: userId,
        resourceName: userObj.email,
        userId: this.userContext.user_id,
        duration,
        found: true,
        metadata: {
          userQuery: { duration: queryDuration, slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY },
          organizationCount: userObj.organizations.length,
          rbacScope: scope,
          component: 'service',
        },
      });

      log.info(template.message, template.context);

      return userObj;
    } catch (error) {
      log.error('get user by id failed', error, {
        operation: 'get_user_by_id',
        userId: this.userContext.user_id,
        targetUserId: userId,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Create a new user with permission checking
   */
  async createUser(userData: CreateUserData): Promise<UserWithOrganizations> {
    const startTime = Date.now();

    try {
      const hasCreatePermission = this.userContext.all_permissions?.some(
        (p) => p.name === 'users:create:organization'
      );
      requirePermission('users:create:organization', !!hasCreatePermission, this.isSuperAdmin);
      requireOrganizationAccess(
        userData.organization_id,
        this.isSuperAdmin,
        this.accessibleOrganizationIds
      );

      // Hash password
      const hashedPassword = await hashPassword(userData.password);

      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          email: userData.email,
          password_hash: hashedPassword,
          first_name: userData.first_name,
          last_name: userData.last_name,
          email_verified: userData.email_verified ?? false,
          is_active: userData.is_active ?? true,
        })
        .returning();

      if (!newUser) {
        throw new Error('Failed to create user');
      }

      // Proactively create account_security record for defense-in-depth
      await ensureSecurityRecord(newUser.user_id);

      // Add user to organization
      await db.insert(user_organizations).values({
        user_id: newUser.user_id,
        organization_id: userData.organization_id,
        is_active: true,
      });

      // Return user with organization info
      const userWithOrgs = await this.getUserById(newUser.user_id);
      if (!userWithOrgs) {
        throw new Error('Failed to retrieve created user');
      }

      const duration = Date.now() - startTime;
      const scope = getRBACScope(this.canReadAll, this.canReadOrganization);

      const template = logTemplates.crud.create('user', {
        resourceId: newUser.user_id,
        resourceName: newUser.email,
        userId: this.userContext.user_id,
        organizationId: userData.organization_id,
        duration,
        metadata: {
          emailVerified: userData.email_verified ?? false,
          securityRecordCreated: true,
          passwordHashed: true,
          rbacScope: scope,
          component: 'service',
        },
      });

      log.info(template.message, template.context);

      return userWithOrgs;
    } catch (error) {
      log.error('create user failed', error, {
        operation: 'create_user',
        userId: this.userContext.user_id,
        targetOrganizationId: userData.organization_id,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Update a user with permission checking
   */
  async updateUser(userId: string, updateData: UpdateUserData): Promise<UserWithOrganizations> {
    const startTime = Date.now();

    try {
      // Check permissions: can update own profile OR can update organization users
      if (
        !this.canUpdateOwn &&
        !this.canUpdateOrganization &&
        !this.canUpdate &&
        !this.isSuperAdmin
      ) {
        throw new PermissionDeniedError('users:update:*', userId);
      }

      // For organization scope, verify user is in accessible organization
      if (
        this.canUpdateOrganization &&
        !this.canUpdate &&
        userId !== this.userContext.user_id &&
        !this.isSuperAdmin
      ) {
        const targetUser = await this.getUserById(userId);
        if (!targetUser) {
          throw new Error('User not found');
        }

        const hasSharedOrg = targetUser.organizations.some((org) =>
          canAccessOrganization(
            org.organization_id,
            this.isSuperAdmin,
            this.accessibleOrganizationIds
          )
        );

        if (!hasSharedOrg) {
          throw new PermissionDeniedError('users:update:organization', userId);
        }
      }

      // Get existing user for change tracking
      const existingUser = await this.getUserById(userId);
      if (!existingUser) {
        throw new Error('User not found');
      }

      // Execute user update and role assignment as atomic transaction
      await db.transaction(async (tx) => {
        // Prepare update data
        const updateFields: Partial<{
          first_name: string;
          last_name: string;
          email: string;
          password?: string;
          password_hash: string;
          role_ids?: string[];
          email_verified: boolean;
          is_active: boolean;
          provider_uid: number | null | undefined;
          updated_at: Date;
        }> = {
          ...updateData,
          updated_at: new Date(),
        };

        // Hash password if provided and track password change
        let passwordWasChanged = false;
        if (updateData.password) {
          updateFields.password_hash = await hashPassword(updateData.password);
          delete updateFields.password; // Remove plain password from update
          passwordWasChanged = true;
        }

        // Update user
        const [user] = await tx
          .update(users)
          .set(updateFields)
          .where(eq(users.user_id, userId))
          .returning();

        if (!user) {
          throw new Error('Failed to update user');
        }

        // Track password change in account_security table
        if (passwordWasChanged) {
          // Ensure security record exists
          await ensureSecurityRecord(userId);

          // Update password_changed_at timestamp
          await tx
            .update(account_security)
            .set({
              password_changed_at: new Date(),
            })
            .where(eq(account_security.user_id, userId));
        }

        return user;
      });

      // Return updated user with organization info
      const userWithOrgs = await this.getUserById(userId);
      if (!userWithOrgs) {
        throw new Error('Failed to retrieve updated user');
      }

      const duration = Date.now() - startTime;

      // Calculate changes for audit trail
      const changes = calculateChanges(
        existingUser as unknown as Record<string, unknown>,
        updateData as unknown as Record<string, unknown>,
        Object.keys(updateData)
      );

      const scope = getRBACScope(this.canReadAll, this.canReadOrganization);

      const template = logTemplates.crud.update('user', {
        resourceId: userId,
        resourceName: userWithOrgs.email,
        userId: this.userContext.user_id,
        changes,
        duration,
        metadata: {
          passwordChanged: !!updateData.password,
          rbacScope: scope,
          component: 'service',
        },
      });

      log.info(template.message, template.context);

      return userWithOrgs;
    } catch (error) {
      log.error('update user failed', error, {
        operation: 'update_user',
        userId: this.userContext.user_id,
        targetUserId: userId,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Delete a user with permission checking
   */
  async deleteUser(userId: string): Promise<void> {
    const startTime = Date.now();

    try {
      const hasDeletePermission = this.userContext.all_permissions?.some(
        (p) => p.name === 'users:delete:organization'
      );
      requirePermission(
        'users:delete:organization',
        !!hasDeletePermission,
        this.isSuperAdmin,
        userId
      );

      // Prevent self-deletion
      if (userId === this.userContext.user_id) {
        throw new Error('Cannot delete your own account');
      }

      // Verify user is in accessible organization
      const targetUser = await this.getUserById(userId);
      if (!targetUser) {
        throw new Error('User not found');
      }

      // Soft delete user
      await db
        .update(users)
        .set({
          deleted_at: new Date(),
          is_active: false,
        })
        .where(eq(users.user_id, userId));

      // Deactivate user organizations
      await db
        .update(user_organizations)
        .set({
          is_active: false,
        })
        .where(eq(user_organizations.user_id, userId));

      const duration = Date.now() - startTime;
      const scope = getRBACScope(this.canReadAll, this.canReadOrganization);

      const template = logTemplates.crud.delete('user', {
        resourceId: userId,
        resourceName: targetUser.email,
        userId: this.userContext.user_id,
        soft: true,
        duration,
        metadata: {
          organizationMembershipsDeactivated: targetUser.organizations.length,
          rbacScope: scope,
          component: 'service',
        },
      });

      log.info(template.message, template.context);
    } catch (error) {
      log.error('delete user failed', error, {
        operation: 'delete_user',
        userId: this.userContext.user_id,
        targetUserId: userId,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Search users across accessible organizations
   */
  async searchUsers(searchTerm: string, organizationId?: string): Promise<UserWithOrganizations[]> {
    const hasAny = ['users:read:own', 'users:read:organization', 'users:read:all'].some(
      (permission) => this.userContext.all_permissions?.some((p) => p.name === permission)
    );
    requireAnyPermission(
      ['users:read:own', 'users:read:organization', 'users:read:all'],
      hasAny,
      this.isSuperAdmin
    );
    return await this.getUsers({
      search: searchTerm,
      organizationId,
    });
  }

  /**
   * Get user count for accessible scope
   */
  async getUserCount(organizationId?: string): Promise<number> {
    const startTime = Date.now();

    try {
      // Build where conditions using query builder
      const whereConditions = buildUserRBACConditions(
        this.canReadAll,
        this.canReadOrganization,
        this.accessibleOrganizationIds,
        this.userContext.user_id
      );

      const scope = getRBACScope(this.canReadAll, this.canReadOrganization);

      // If organization scope and no accessible orgs, return 0
      if (scope === 'organization' && this.accessibleOrganizationIds.length === 0) {
        return 0;
      }

      if (organizationId) {
        requireOrganizationAccess(
          organizationId,
          this.isSuperAdmin,
          this.accessibleOrganizationIds
        );
        whereConditions.push(eq(user_organizations.organization_id, organizationId));
      }

      // Build query based on whether we need organization joins
      const needsOrgJoin = scope === 'organization' || organizationId;

      const queryStart = Date.now();
      const query = needsOrgJoin
        ? db
            .select({ count: count() })
            .from(users)
            .innerJoin(user_organizations, eq(users.user_id, user_organizations.user_id))
            .where(and(...whereConditions))
        : db
            .select({ count: count() })
            .from(users)
            .where(and(...whereConditions));

      const [result] = await query;
      const queryDuration = Date.now() - queryStart;
      const duration = Date.now() - startTime;

      log.info('user count retrieved', {
        operation: 'get_user_count',
        userId: this.userContext.user_id,
        organizationId,
        duration,
        metadata: {
          count: result?.count || 0,
          countQuery: { duration: queryDuration, slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY },
          rbacScope: scope,
          component: 'service',
        },
      });

      return result?.count || 0;
    } catch (error) {
      log.error('get user count failed', error, {
        operation: 'get_user_count',
        userId: this.userContext.user_id,
        organizationId,
        component: 'service',
      });
      throw error;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Factory function to create RBAC Users Service
 */
export function createRBACUsersService(userContext: UserContext): UsersServiceInterface {
  return new RBACUsersService(userContext);
}
