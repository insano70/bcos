import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { createAppLogger } from '@/lib/logger/factory';
import { users, user_organizations, organizations } from '@/lib/db/schema';
import { user_roles, roles } from '@/lib/db/rbac-schema';
import { eq, and, inArray, isNull, like, or, count } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth/security';
import type { UserContext } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/types/rbac';

/**
 * Enhanced Users Service with RBAC
 * Provides user management with automatic permission checking and data filtering
 */

// Universal logger for RBAC user service operations
const rbacUsersLogger = createAppLogger('rbac-users-service', {
  component: 'business-logic',
  feature: 'user-management',
  businessIntelligence: true
})

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
  role_ids?: string[];
  email_verified?: boolean;
  is_active?: boolean;
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
  created_at: Date;
  updated_at: Date;
  organizations: {
    organization_id: string;
    name: string;
    slug: string;
    is_active: boolean;
  }[];
  roles?: {
    id: string;
    name: string;
  }[];
}

export class RBACUsersService extends BaseRBACService {
  /**
   * Get users with automatic permission-based filtering
   */
  async getUsers(options: UserQueryOptions = {}): Promise<UserWithOrganizations[]> {
    const accessScope = this.getAccessScope('users', 'read');
    
    // Build all where conditions upfront
    const whereConditions = [
      isNull(users.deleted_at),
      eq(users.is_active, true)
    ];

    // Apply scope-based filtering
    switch (accessScope.scope) {
      case 'own':
        whereConditions.push(eq(users.user_id, accessScope.userId!));
        break;
      
      case 'organization': {
        // Filter by accessible organizations
        const accessibleOrgIds = accessScope.organizationIds || [];
        if (accessibleOrgIds.length > 0) {
          whereConditions.push(
            inArray(user_organizations.organization_id, accessibleOrgIds),
            eq(user_organizations.is_active, true)
          );
        } else {
          // No accessible organizations - return empty result
          return [];
        }
        break;
      }
      
      case 'all':
        // No additional filtering for super admin
        break;
    }

    // Apply additional filters
    if (options.organizationId) {
      this.requireOrganizationAccess(options.organizationId);
      whereConditions.push(eq(user_organizations.organization_id, options.organizationId));
    }

    if (options.is_active !== undefined) {
      whereConditions.push(eq(users.is_active, options.is_active));
    }

    if (options.email_verified !== undefined) {
      whereConditions.push(eq(users.email_verified, options.email_verified));
    }

    if (options.search) {
      const searchCondition = or(
        like(users.first_name, `%${options.search}%`),
        like(users.last_name, `%${options.search}%`),
        like(users.email, `%${options.search}%`)
      );
      if (searchCondition) {
        whereConditions.push(searchCondition);
      }
    }

    // Build complete query with all conditions
    const baseQuery = db
      .select({
        user_id: users.user_id,
        email: users.email,
        first_name: users.first_name,
        last_name: users.last_name,
        email_verified: users.email_verified,
        is_active: users.is_active,
        created_at: users.created_at,
        updated_at: users.updated_at,
        // Organization info
        organization_id: organizations.organization_id,
        org_name: organizations.name,
        org_slug: organizations.slug,
        org_is_active: organizations.is_active
      })
      .from(users)
      .leftJoin(user_organizations, eq(users.user_id, user_organizations.user_id))
      .leftJoin(organizations, eq(user_organizations.organization_id, organizations.organization_id))
      .where(and(...whereConditions));

    // Execute base query
    const baseResults = await baseQuery;

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

    // Group by user and aggregate organizations
    const usersMap = new Map<string, UserWithOrganizations>();

    results.forEach(row => {
      if (!usersMap.has(row.user_id)) {
        usersMap.set(row.user_id, {
          user_id: row.user_id,
          email: row.email,
          first_name: row.first_name,
          last_name: row.last_name,
          email_verified: row.email_verified ?? false,
          is_active: row.is_active ?? true,
          created_at: row.created_at ?? new Date(),
          updated_at: row.updated_at ?? new Date(),
          organizations: []
        });
      }

      const user = usersMap.get(row.user_id)!;
      
      // Add organization if present and not already added
      if (row.organization_id && row.org_name && row.org_slug && !user.organizations.some(org => org.organization_id === row.organization_id)) {
        user.organizations.push({
          organization_id: row.organization_id,
          name: row.org_name,
          slug: row.org_slug,
          is_active: row.org_is_active ?? true
        });
      }
    });

    // Fetch roles for all users
    const userIds = Array.from(usersMap.keys());
    if (userIds.length > 0) {
      const rolesQuery = await db
        .select({
          user_id: user_roles.user_id,
          role_id: roles.role_id,
          role_name: roles.name
        })
        .from(user_roles)
        .innerJoin(roles, eq(roles.role_id, user_roles.role_id))
        .where(and(
          inArray(user_roles.user_id, userIds),
          eq(user_roles.is_active, true),
          eq(roles.is_active, true)
        ));

      // Add roles to users
      rolesQuery.forEach(roleRow => {
        const user = usersMap.get(roleRow.user_id);
        if (user) {
          if (!user.roles) {
            user.roles = [];
          }
          user.roles.push({
            id: roleRow.role_id,
            name: roleRow.role_name
          });
        }
      });
    }

    return Array.from(usersMap.values());
  }

  /**
   * Get a specific user by ID with permission checking
   */
  async getUserById(userId: string): Promise<UserWithOrganizations | null> {
    // Check if user can access this specific user
    const canReadOwn = this.checker.hasPermission('users:read:own', userId);
    const canReadOrg = this.checker.hasPermission('users:read:organization');
    const canReadAll = this.checker.hasPermission('users:read:all');

    if (!canReadOwn && !canReadOrg && !canReadAll) {
      throw new PermissionDeniedError('users:read:*', userId);
    }

    // Get user with organizations
    const query = db
      .select({
        user_id: users.user_id,
        email: users.email,
        first_name: users.first_name,
        last_name: users.last_name,
        email_verified: users.email_verified,
        is_active: users.is_active,
        created_at: users.created_at,
        updated_at: users.updated_at,
        organization_id: user_organizations.organization_id,
        org_name: organizations.name,
        org_slug: organizations.slug,
        org_is_active: organizations.is_active
      })
      .from(users)
      .leftJoin(user_organizations, and(
        eq(user_organizations.user_id, users.user_id),
        eq(user_organizations.is_active, true)
      ))
      .leftJoin(organizations, and(
        eq(organizations.organization_id, user_organizations.organization_id),
        isNull(organizations.deleted_at)
      ))
      .where(and(
        eq(users.user_id, userId),
        isNull(users.deleted_at)
      ));

    const results = await query;
    
    if (results.length === 0) {
      return null;
    }

    // Build user object with organizations
    const firstResult = results[0];
    if (!firstResult) {
      // Extra safety: should not happen after length check
      rbacUsersLogger.warn('User result had length > 0 but first item was null', { userId });
      return null;
    }

    if (!firstResult.user_id || !firstResult.email || !firstResult.first_name || !firstResult.last_name) {
      rbacUsersLogger.error('User result missing required fields', { 
        userId,
        hasUserId: !!firstResult.user_id,
        hasEmail: !!firstResult.email,
        hasFirstName: !!firstResult.first_name,
        hasLastName: !!firstResult.last_name
      });
      return null;
    }

    const userObj: UserWithOrganizations = {
      user_id: firstResult.user_id,
      email: firstResult.email,
      first_name: firstResult.first_name,
      last_name: firstResult.last_name,
      email_verified: firstResult.email_verified ?? false,
      is_active: firstResult.is_active ?? true,
      created_at: firstResult.created_at ?? new Date(),
      updated_at: firstResult.updated_at ?? new Date(),
      organizations: []
    };

    // Add organizations
    results.forEach(row => {
      if (row.organization_id && row.org_name && row.org_slug && !userObj.organizations.some(org => org.organization_id === row.organization_id)) {
        userObj.organizations.push({
          organization_id: row.organization_id,
          name: row.org_name,
          slug: row.org_slug,
          is_active: row.org_is_active ?? true
        });
      }
    });

    // For organization scope, verify user is in accessible organization
    if (canReadOrg && !canReadAll && !canReadOwn) {
      const hasSharedOrg = userObj.organizations.some(org =>
        this.canAccessOrganization(org.organization_id)
      );

      if (!hasSharedOrg) {
        throw new PermissionDeniedError('users:read:organization', userId);
      }
    }

    // Fetch user roles
    const rolesQuery = await db
      .select({
        role_id: roles.role_id,
        role_name: roles.name
      })
      .from(user_roles)
      .innerJoin(roles, eq(roles.role_id, user_roles.role_id))
      .where(and(
        eq(user_roles.user_id, userId),
        eq(user_roles.is_active, true),
        eq(roles.is_active, true)
      ));

    userObj.roles = rolesQuery.map(role => ({
      id: role.role_id,
      name: role.role_name
    }));

    return userObj;
  }

  /**
   * Create a new user with permission checking
   */
  async createUser(userData: CreateUserData): Promise<UserWithOrganizations> {
    const startTime = Date.now()
    
    // Enhanced user creation logging
    rbacUsersLogger.info('User creation initiated', {
      requestingUserId: this.userContext.user_id,
      targetOrganizationId: userData.organization_id,
      operation: 'create_user',
      securityLevel: 'high'
    })
    
    this.requirePermission('users:create:organization', undefined, userData.organization_id);
    
    // Verify user can create in this organization
    this.requireOrganizationAccess(userData.organization_id);
    
    // Enhanced permission validation success logging
    rbacUsersLogger.security('user_creation_authorized', 'low', {
      action: 'permission_check_passed',
      userId: this.userContext.user_id,
      targetOrganization: userData.organization_id,
      requiredPermission: 'users:create:organization'
    })

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
        is_active: userData.is_active ?? true
      })
      .returning();

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    // Add user to organization
    await db
      .insert(user_organizations)
      .values({
        user_id: newUser.user_id,
        organization_id: userData.organization_id,
        is_active: true
      });

    // Return user with organization info
    const userWithOrgs = await this.getUserById(newUser.user_id);
    if (!userWithOrgs) {
      throw new Error('Failed to retrieve created user');
    }

    // Enhanced user creation completion logging
    const duration = Date.now() - startTime
    
    // Business intelligence for user creation
    rbacUsersLogger.info('User creation analytics', {
      operation: 'user_created',
      newUserId: newUser.user_id,
      organizationId: userData.organization_id,
      createdByUserId: this.userContext.user_id,
      userSegment: 'new_user',
      emailVerified: userData.email_verified ?? false,
      duration
    })
    
    // Security event for user creation
    rbacUsersLogger.security('user_account_created', 'medium', {
      action: 'account_creation_success',
      userId: this.userContext.user_id,
      newAccountId: newUser.user_id,
      organizationId: userData.organization_id,
      complianceValidated: true
    })
    
    // Performance monitoring
    rbacUsersLogger.timing('User creation completed', startTime, {
      passwordHashingIncluded: true,
      rbacValidationIncluded: true,
      databaseOperations: 3 // user insert + org assignment + retrieval
    })

    await this.logPermissionCheck('users:create:organization', newUser.user_id, userData.organization_id);
    
    return userWithOrgs;
  }

  /**
   * Update a user with permission checking
   */
  async updateUser(userId: string, updateData: UpdateUserData): Promise<UserWithOrganizations> {
    // Check permissions: can update own profile OR can update organization users
    const canUpdateOwn = this.checker.hasPermission('users:update:own', userId);
    const canUpdateOrg = this.checker.hasPermission('users:update:organization');
    const canUpdateAll = this.checker.hasPermission('users:update:all');

    if (!canUpdateOwn && !canUpdateOrg && !canUpdateAll) {
      throw new PermissionDeniedError('users:update:*', userId);
    }

    // For organization scope, verify user is in accessible organization
    if (canUpdateOrg && !canUpdateAll && userId !== this.userContext.user_id) {
      const targetUser = await this.getUserById(userId);
      if (!targetUser) {
        throw new Error('User not found');
      }

      const hasSharedOrg = targetUser.organizations.some(org =>
        this.canAccessOrganization(org.organization_id)
      );

      if (!hasSharedOrg) {
        throw new PermissionDeniedError('users:update:organization', userId);
      }
    }

    // Execute user update and role assignment as atomic transaction
    const updatedUser = await db.transaction(async (tx) => {
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
        updated_at: Date;
      }> = {
        ...updateData,
        updated_at: new Date()
      };

      // Hash password if provided
      if (updateData.password) {
        updateFields.password_hash = await hashPassword(updateData.password);
        delete updateFields.password; // Remove plain password from update
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

      // Update user roles if provided
      if (updateData.role_ids) {
        // First, deactivate all current roles for this user
        await tx
          .update(user_roles)
          .set({ is_active: false })
          .where(eq(user_roles.user_id, userId));

        // Then add the new roles
        if (updateData.role_ids.length > 0) {
          const roleAssignments = updateData.role_ids.map(roleId => ({
            user_id: userId,
            role_id: roleId,
            organization_id: this.userContext.current_organization_id,
            granted_by: this.userContext.user_id,
            is_active: true
          }));

          await tx.insert(user_roles).values(roleAssignments);
        }
      }

      return user;
    });

    await this.logPermissionCheck('users:update', userId);

    // Return updated user with organization info
    const userWithOrgs = await this.getUserById(userId);
    if (!userWithOrgs) {
      throw new Error('Failed to retrieve updated user');
    }

    return userWithOrgs;
  }

  /**
   * Delete a user with permission checking
   */
  async deleteUser(userId: string): Promise<void> {
    this.requirePermission('users:delete:organization', userId);
    
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
        is_active: false
      })
      .where(eq(users.user_id, userId));

    // Deactivate user organizations
    await db
      .update(user_organizations)
      .set({
        is_active: false
      })
      .where(eq(user_organizations.user_id, userId));

    await this.logPermissionCheck('users:delete:organization', userId);
  }

  /**
   * Add user to organization
   */
  async addUserToOrganization(userId: string, organizationId: string): Promise<void> {
    this.requirePermission('users:create:organization', userId, organizationId);
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

    if (existing) {
      if (!existing.is_active) {
        // Reactivate existing membership
        await db
          .update(user_organizations)
          .set({
            is_active: true,
            joined_at: new Date()
          })
          .where(eq(user_organizations.user_organization_id, existing.user_organization_id));
      }
      return;
    }

    // Create new organization membership
    await db
      .insert(user_organizations)
      .values({
        user_id: userId,
        organization_id: organizationId,
        is_active: true
      });

    await this.logPermissionCheck('users:create:organization', userId, organizationId);
  }

  /**
   * Remove user from organization
   */
  async removeUserFromOrganization(userId: string, organizationId: string): Promise<void> {
    this.requirePermission('users:delete:organization', userId, organizationId);
    this.requireOrganizationAccess(organizationId);

    // Prevent removing self from organization
    if (userId === this.userContext.user_id) {
      throw new Error('Cannot remove yourself from organization');
    }

    // Deactivate organization membership
    await db
      .update(user_organizations)
      .set({
        is_active: false
      })
      .where(
        and(
          eq(user_organizations.user_id, userId),
          eq(user_organizations.organization_id, organizationId)
        )
      );

    await this.logPermissionCheck('users:delete:organization', userId, organizationId);
  }

  /**
   * Get users in a specific organization
   */
  async getUsersInOrganization(organizationId: string): Promise<UserWithOrganizations[]> {
    this.requireOrganizationAccess(organizationId);
    
    return await this.getUsers({ organizationId });
  }

  /**
   * Search users across accessible organizations
   */
  async searchUsers(searchTerm: string, organizationId?: string): Promise<UserWithOrganizations[]> {
    this.requireAnyPermission([
      'users:read:own',
      'users:read:organization', 
      'users:read:all'
    ]);

    return await this.getUsers({ 
      search: searchTerm,
      organizationId 
    });
  }

  /**
   * Get user count for accessible scope
   */
  async getUserCount(organizationId?: string): Promise<number> {
    const accessScope = this.getAccessScope('users', 'read');
    
    // Build where conditions
    const whereConditions = [
      isNull(users.deleted_at),
      eq(users.is_active, true)
    ];

    // Apply scope-based filtering
    switch (accessScope.scope) {
      case 'own':
        whereConditions.push(eq(users.user_id, accessScope.userId!));
        break;
      
      case 'organization': {
        const accessibleOrgIds = accessScope.organizationIds || [];
        if (accessibleOrgIds.length === 0) {
          return 0;
        }
        whereConditions.push(
          inArray(user_organizations.organization_id, accessibleOrgIds),
          eq(user_organizations.is_active, true)
        );
        break;
      }
      
      case 'all':
        // No additional filtering
        break;
    }

    if (organizationId) {
      this.requireOrganizationAccess(organizationId);
      whereConditions.push(eq(user_organizations.organization_id, organizationId));
    }

    // Build query based on whether we need organization joins
    const needsOrgJoin = accessScope.scope === 'organization' || organizationId;

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
    return result?.count || 0;
  }

  /**
   * Check if user can be managed by current user
   */
  async canManageUser(targetUserId: string): Promise<boolean> {
    // Super admin can manage anyone
    if (this.isSuperAdmin()) {
      return true;
    }

    // Users can always manage themselves
    if (targetUserId === this.userContext.user_id) {
      return this.checker.hasPermission('users:update:own', targetUserId);
    }

    // Check organization-level management permissions
    if (!this.checker.hasPermission('users:update:organization')) {
      return false;
    }

    // Verify shared organization
    const targetUser = await this.getUserById(targetUserId);
    if (!targetUser) {
      return false;
    }

    return targetUser.organizations.some(org =>
      this.canAccessOrganization(org.organization_id)
    );
  }

  /**
   * Get users that current user can manage
   */
  async getManageableUsers(): Promise<UserWithOrganizations[]> {
    this.requireAnyPermission([
      'users:update:own',
      'users:update:organization'
    ]);

    const allUsers = await this.getUsers();
    
    if (this.isSuperAdmin()) {
      return allUsers;
    }

    // Filter to only users that can be managed
    const manageableUsers: UserWithOrganizations[] = [];
    
    for (const user of allUsers) {
      if (await this.canManageUser(user.user_id)) {
        manageableUsers.push(user);
      }
    }

    return manageableUsers;
  }
}

/**
 * Factory function to create RBAC Users Service
 */
export function createRBACUsersService(userContext: UserContext): RBACUsersService {
  return new RBACUsersService(userContext);
}
