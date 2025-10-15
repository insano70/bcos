/**
 * RBAC Users Service Basic Committed Tests
 *
 * Provides basic coverage of RBACUsersService using committed factories.
 * Tests focus on core CRUD operations and permission enforcement.
 *
 * Part of wide coverage strategy - basic tests for all services.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import '@/tests/setup/integration-setup'
import {
  createCommittedUser,
  createCommittedOrganization,
  type CommittedUser
} from '@/tests/factories/committed'
import {
  createTestRole,
  assignRoleToUser
} from '@/tests/factories'
import {
  mapDatabaseRoleToRole,
  mapDatabaseOrgToOrg,
  buildUserContext
} from '@/tests/helpers/rbac-helper'
import { assignUserToOrganization } from '@/tests/helpers/committed-rbac-helper'
import { createRBACUsersService } from '@/lib/services/rbac-users-service'
import { createUserOrganizationService } from '@/lib/services/user-organization-service'
import { PermissionDeniedError } from '@/lib/types/rbac'
import type { PermissionName } from '@/lib/types/rbac'
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base'
import { nanoid } from 'nanoid'

describe('RBAC Users Service - Basic Committed Tests', () => {
  let scope: ScopedFactoryCollection
  let scopeId: string

  beforeEach(() => {
    scopeId = `users-test-${nanoid(8)}`
    scope = createTestScope(scopeId)
  })

  afterEach(async () => {
    await scope.cleanup()
  })

  describe('getUsers - Read Operations', () => {
    it('should retrieve users with real data', async () => {
      const adminUser = await createCommittedUser({
        firstName: 'Admin',
        lastName: 'User',
        scope: scopeId
      })
      const role = await createTestRole({
        name: 'user_admin',
        permissions: ['users:read:all' as PermissionName]
      })
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role))

      // Create test users
      const user1 = await createCommittedUser({
        firstName: 'Test',
        lastName: 'User1',
        scope: scopeId
      })
      const user2 = await createCommittedUser({
        firstName: 'Test',
        lastName: 'User2',
        scope: scopeId
      })

      const userContext = await buildUserContext(adminUser)
      const usersService = createRBACUsersService(userContext)
      const result = await usersService.getUsers()

      expect(Array.isArray(result)).toBe(true)
      const userIds = result.map(u => u.user_id)
      expect(userIds).toContain(user1.user_id)
      expect(userIds).toContain(user2.user_id)
    })

    it('should filter users by search term', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'user_admin',
        permissions: ['users:read:all' as PermissionName]
      })
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role))

      const uniqueUser = await createCommittedUser({
        firstName: 'UniqueSearchTerm',
        lastName: 'TestUser',
        scope: scopeId
      })

      const userContext = await buildUserContext(adminUser)
      const usersService = createRBACUsersService(userContext)
      const result = await usersService.getUsers({ search: 'UniqueSearchTerm' })

      const userIds = result.map(u => u.user_id)
      expect(userIds).toContain(uniqueUser.user_id)
    })

    it('should deny user retrieval without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const usersService = createRBACUsersService(userContext)

      await expect(usersService.getUsers()).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('getUserById - Single Record Retrieval', () => {
    it('should retrieve specific user with valid permissions', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'user_admin',
        permissions: ['users:read:all' as PermissionName]
      })
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role))

      const targetUser = await createCommittedUser({
        firstName: 'Target',
        lastName: 'User',
        scope: scopeId
      })

      const userContext = await buildUserContext(adminUser)
      const usersService = createRBACUsersService(userContext)
      const result = await usersService.getUserById(targetUser.user_id)

      expect(result).toBeDefined()
      if (!result) throw new Error('Expected user to be defined')
      expect(result.user_id).toBe(targetUser.user_id)
      expect(result.first_name).toBe('Target')
      expect(result.last_name).toBe('User')
    })

    it('should return null for non-existent user', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'user_admin',
        permissions: ['users:read:all' as PermissionName]
      })
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(adminUser)
      const usersService = createRBACUsersService(userContext)
      const result = await usersService.getUserById('00000000-0000-0000-0000-000000000000')

      expect(result).toBeNull()
    })
  })

  describe('getUserCount - Aggregation Operations', () => {
    it('should return accurate user count', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'user_admin',
        permissions: ['users:read:all' as PermissionName]
      })
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role))

      // Create test users
      await createCommittedUser({ firstName: 'Count1', scope: scopeId })
      await createCommittedUser({ firstName: 'Count2', scope: scopeId })
      await createCommittedUser({ firstName: 'Count3', scope: scopeId })

      const userContext = await buildUserContext(adminUser)
      const usersService = createRBACUsersService(userContext)
      const count = await usersService.getUserCount()

      expect(typeof count).toBe('number')
      expect(count).toBeGreaterThanOrEqual(4) // 3 test users + admin
    })
  })

  describe('createUser - Creation Operations', () => {
    it('should create user with all required fields', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId })
      const org = await createCommittedOrganization({ scope: scopeId })

      // Assign admin to organization
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org))

      const role = await createTestRole({
        name: 'user_admin',
        permissions: [
          'users:create:organization' as PermissionName,
          'users:read:organization' as PermissionName
        ],
        organizationId: org.organization_id
      })
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org))

      const userContext = await buildUserContext(adminUser, org.organization_id)
      const usersService = createRBACUsersService(userContext)

      const userData = {
        email: `newuser-${nanoid(8)}@test.local`,
        password: 'SecurePassword123!',
        first_name: 'New',
        last_name: 'User',
        organization_id: org.organization_id
      }

      const result = await usersService.createUser(userData)

      expect(result).toBeDefined()
      expect(result.email).toBe(userData.email)
      expect(result.first_name).toBe('New')
      expect(result.last_name).toBe('User')
      expect(result.user_id).toBeTruthy()
    })

    it('should deny user creation without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const org = await createCommittedOrganization({ scope: scopeId })

      const userContext = await buildUserContext(user)
      const usersService = createRBACUsersService(userContext)

      const userData = {
        email: `unauthorized-${nanoid(8)}@test.local`,
        password: 'Password123!',
        first_name: 'Unauthorized',
        last_name: 'User',
        organization_id: org.organization_id
      }

      await expect(usersService.createUser(userData)).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('updateUser - Modification Operations', () => {
    it('should update user successfully', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId })
      const org = await createCommittedOrganization({ scope: scopeId })

      // Assign admin to organization
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org))

      const role = await createTestRole({
        name: 'user_admin',
        permissions: [
          'users:update:organization' as PermissionName,
          'users:read:organization' as PermissionName
        ],
        organizationId: org.organization_id
      })
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org))

      const targetUser = await createCommittedUser({
        firstName: 'Original',
        lastName: 'Name',
        scope: scopeId
      })

      // Assign target user to same organization so admin can update them
      await assignUserToOrganization(targetUser, mapDatabaseOrgToOrg(org))

      const userContext = await buildUserContext(adminUser, org.organization_id)
      const usersService = createRBACUsersService(userContext)

      const result = await usersService.updateUser(targetUser.user_id, {
        first_name: 'Updated',
        last_name: 'Name'
      })

      expect(result.first_name).toBe('Updated')
      expect(result.last_name).toBe('Name')
    })

    it('should deny user update without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const targetUser = await createCommittedUser({
        firstName: 'Protected',
        lastName: 'User',
        scope: scopeId
      })

      const userContext = await buildUserContext(user)
      const usersService = createRBACUsersService(userContext)

      await expect(
        usersService.updateUser(targetUser.user_id, { first_name: 'Hacked' })
      ).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('deleteUser - Deletion Operations', () => {
    it('should delete user successfully', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId })
      const org = await createCommittedOrganization({ scope: scopeId })

      // Assign admin to organization
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org))

      const role = await createTestRole({
        name: 'user_admin',
        permissions: [
          'users:delete:organization' as PermissionName,
          'users:read:organization' as PermissionName
        ],
        organizationId: org.organization_id
      })
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org))

      const targetUser = await createCommittedUser({
        firstName: 'ToDelete',
        lastName: 'User',
        scope: scopeId
      })

      // Assign target user to same organization so admin can delete them
      await assignUserToOrganization(targetUser, mapDatabaseOrgToOrg(org))

      const userContext = await buildUserContext(adminUser, org.organization_id)
      const usersService = createRBACUsersService(userContext)

      await usersService.deleteUser(targetUser.user_id)

      // Verify soft deletion (user should not be retrievable)
      const result = await usersService.getUserById(targetUser.user_id)
      expect(result).toBeNull()
    })

    it('should deny user deletion without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const targetUser = await createCommittedUser({
        firstName: 'Protected',
        lastName: 'User',
        scope: scopeId
      })

      const userContext = await buildUserContext(user)
      const usersService = createRBACUsersService(userContext)

      await expect(
        usersService.deleteUser(targetUser.user_id)
      ).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('Organization Association Operations', () => {
    it('should get users in organization', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId })
      const org = await createCommittedOrganization({ scope: scopeId })

      // Assign admin to organization
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org))

      const role = await createTestRole({
        name: 'user_admin',
        permissions: ['users:read:organization' as PermissionName],
        organizationId: org.organization_id
      })
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org))

      const orgUser = await createCommittedUser({
        firstName: 'Org',
        lastName: 'Member',
        scope: scopeId
      })
      await assignUserToOrganization(orgUser, mapDatabaseOrgToOrg(org))

      const userContext = await buildUserContext(adminUser, org.organization_id)
      const userOrgService = createUserOrganizationService(userContext)
      const result = await userOrgService.getUsersInOrganization(org.organization_id)

      const userIds = result.map(u => u.user_id)
      expect(userIds).toContain(orgUser.user_id)
    })

    it('should remove user from organization', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId })
      const org = await createCommittedOrganization({ scope: scopeId })

      // Assign admin to organization
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org))

      const role = await createTestRole({
        name: 'user_admin',
        permissions: [
          'users:delete:organization' as PermissionName,
          'users:read:organization' as PermissionName
        ],
        organizationId: org.organization_id
      })
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org))

      const orgUser = await createCommittedUser({
        firstName: 'Org',
        lastName: 'Member',
        scope: scopeId
      })
      await assignUserToOrganization(orgUser, mapDatabaseOrgToOrg(org))

      const userContext = await buildUserContext(adminUser, org.organization_id)
      const userOrgService = createUserOrganizationService(userContext)

      await userOrgService.removeUserFromOrganization(orgUser.user_id, org.organization_id)

      // Verify removal
      const result = await userOrgService.getUsersInOrganization(org.organization_id)
      const userIds = result.map(u => u.user_id)
      expect(userIds).not.toContain(orgUser.user_id)
    })
  })
})
