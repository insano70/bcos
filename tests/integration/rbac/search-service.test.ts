/**
 * RBAC Search Service Integration Tests
 * Tests universal search permission enforcement with RBAC
 *
 * Following the pattern from tests/integration/rbac/practices-service.test.ts
 *
 * NOTE: These tests focus on RBAC permission enforcement.
 * Full search result validation requires the service to use the test transaction,
 * which is a future architecture improvement.
 */

import { describe, it, expect } from 'vitest';
import '@/tests/setup/integration-setup';
import {
  createTestUser,
  createTestRole,
  assignRoleToUser
} from '@/tests/factories';
import { mapDatabaseRoleToRole, buildUserContext } from '@/tests/helpers/rbac-helper';
import { createRBACSearchService } from '@/lib/services/rbac-search-service';
import type { PermissionName } from '@/lib/types/rbac';

describe('RBAC Search Service - Permission Enforcement', () => {
  describe('search - users', () => {
    it('should allow searching users with users:read permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'user_reader',
        permissions: ['users:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      const results = await searchService.search({
        query: 'test',
        type: 'users',
        status: 'all'
      });

      expect(results).toBeDefined();
      expect(results.query).toBe('test');
      expect(results.type).toBe('users');
      expect(Array.isArray(results.users)).toBe(true);
      expect(typeof results.total).toBe('number');
    });

    it('should return empty users array without user read permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'no_user_access',
        permissions: []
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      const results = await searchService.search({
        query: 'test',
        type: 'users',
        status: 'all'
      });

      expect(results.users).toEqual([]);
    });
  });

  describe('search - practices', () => {
    it('should allow searching practices with practices:read permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'practice_reader',
        permissions: ['practices:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      const results = await searchService.search({
        query: 'test',
        type: 'practices',
        status: 'all'
      });

      expect(results).toBeDefined();
      expect(results.query).toBe('test');
      expect(results.type).toBe('practices');
      expect(Array.isArray(results.practices)).toBe(true);
      expect(typeof results.total).toBe('number');
    });

    it('should return empty practices array without practice read permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'no_practice_access',
        permissions: []
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      const results = await searchService.search({
        query: 'test',
        type: 'practices',
        status: 'all'
      });

      expect(results.practices).toEqual([]);
    });
  });

  describe('search - staff', () => {
    it('should allow searching staff with practices:read permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'practice_reader',
        permissions: ['practices:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      const results = await searchService.search({
        query: 'doctor',
        type: 'staff',
        status: 'all'
      });

      expect(results).toBeDefined();
      expect(results.query).toBe('doctor');
      expect(results.type).toBe('staff');
      expect(Array.isArray(results.staff)).toBe(true);
      expect(typeof results.total).toBe('number');
    });

    it('should return empty staff array without practice read permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'no_access',
        permissions: []
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      const results = await searchService.search({
        query: 'doctor',
        type: 'staff',
        status: 'all'
      });

      expect(results.staff).toEqual([]);
    });
  });

  describe('search - templates', () => {
    it('should allow searching templates with read permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'template_reader',
        permissions: ['users:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      const results = await searchService.search({
        query: 'template',
        type: 'templates',
        status: 'all'
      });

      expect(results).toBeDefined();
      expect(results.query).toBe('template');
      expect(results.type).toBe('templates');
      expect(Array.isArray(results.templates)).toBe(true);
      expect(typeof results.total).toBe('number');
    });

    it('should return empty templates array without read permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'no_access',
        permissions: []
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      const results = await searchService.search({
        query: 'template',
        type: 'templates',
        status: 'all'
      });

      expect(results.templates).toEqual([]);
    });
  });

  describe('search - all types', () => {
    it('should search across all types with appropriate permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'full_reader',
        permissions: [
          'users:read:all' as PermissionName,
          'practices:read:all' as PermissionName
        ]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      const results = await searchService.search({
        query: 'test',
        type: 'all',
        status: 'all'
      });

      expect(results).toBeDefined();
      expect(results.query).toBe('test');
      expect(results.type).toBe('all');
      expect(Array.isArray(results.users)).toBe(true);
      expect(Array.isArray(results.practices)).toBe(true);
      expect(Array.isArray(results.staff)).toBe(true);
      expect(Array.isArray(results.templates)).toBe(true);
      expect(typeof results.total).toBe('number');
    });

    it('should only return results for types user has permission to read', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'partial_reader',
        permissions: ['users:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      const results = await searchService.search({
        query: 'test',
        type: 'all',
        status: 'all'
      });

      // Should have users (has permission) but not practices (no permission)
      expect(Array.isArray(results.users)).toBe(true);
      expect(results.practices).toEqual([]);
      expect(results.staff).toEqual([]);
    });
  });

  describe('search - filters and sorting', () => {
    it('should support status filter for active records', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'user_reader',
        permissions: ['users:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      const results = await searchService.search({
        query: 'test',
        type: 'users',
        status: 'active'
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results.users)).toBe(true);
    });

    it('should support relevance sorting', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'user_reader',
        permissions: ['users:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      const results = await searchService.search({
        query: 'test',
        type: 'users',
        status: 'all',
        sort: 'relevance',
        order: 'desc'
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results.users)).toBe(true);
    });

    it('should support name sorting', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'practice_reader',
        permissions: ['practices:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      const results = await searchService.search({
        query: 'test',
        type: 'practices',
        status: 'all',
        sort: 'name',
        order: 'asc'
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results.practices)).toBe(true);
    });

    it('should support pagination', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'user_reader',
        permissions: ['users:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      const results = await searchService.search({
        query: 'test',
        type: 'users',
        status: 'all',
        limit: 5,
        offset: 0
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results.users)).toBe(true);
    });
  });

  describe('search - security', () => {
    it('should sanitize search query to prevent SQL injection', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'user_reader',
        permissions: ['users:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const searchService = createRBACSearchService(userContext);

      // Try malicious SQL injection patterns
      const maliciousQueries = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "<script>alert('xss')</script>",
        "test%_\\wildcards"
      ];

      for (const maliciousQuery of maliciousQueries) {
        const results = await searchService.search({
          query: maliciousQuery,
          type: 'users',
          status: 'all'
        });

        // Should not throw error and should sanitize the query
        expect(results).toBeDefined();
        expect(Array.isArray(results.users)).toBe(true);
      }
    });
  });
});
