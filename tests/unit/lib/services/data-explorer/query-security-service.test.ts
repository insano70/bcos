import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuerySecurityService } from '@/lib/services/data-explorer/query-security-service';
import type { UserContext } from '@/lib/types/rbac';

vi.mock('@/lib/db', () => ({ db: {} }));

describe('QuerySecurityService', () => {
  let service: QuerySecurityService;
  let mockUserContext: UserContext;

  beforeEach(() => {
    mockUserContext = {
      user_id: 'test-user-id',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      is_active: true,
      email_verified: true,
      is_super_admin: false,
      roles: [],
      organizations: [],
      accessible_organizations: [],
      user_roles: [],
      user_organizations: [],
      current_organization_id: 'test-org',
      all_permissions: [],
      organization_admin_for: [],
      accessible_practices: [1, 2, 3],
      accessible_providers: [100],
    };

    service = new QuerySecurityService(mockUserContext);
  });

  describe('addSecurityFilters', () => {
    it('should add practice_uid IN clause to query without WHERE', async () => {
      const sql = 'SELECT * FROM ih.patients';
      const secured = await service.addSecurityFilters(sql);

      expect(secured).toContain('WHERE practice_uid IN (1,2,3)');
    });

    it('should add practice_uid AND clause to query with existing WHERE', async () => {
      const sql = 'SELECT * FROM ih.patients WHERE created_at > "2024-01-01"';
      const secured = await service.addSecurityFilters(sql);

      expect(secured).toContain('AND practice_uid IN (1,2,3)');
    });

    it('should bypass filtering for super admin', async () => {
      const superAdminContext = { ...mockUserContext, is_super_admin: true };
      const superService = new QuerySecurityService(superAdminContext);

      const sql = 'SELECT * FROM ih.patients';
      const secured = await superService.addSecurityFilters(sql);

      expect(secured).toBe(sql);
      expect(secured).not.toContain('practice_uid');
    });

    it('should throw error if no accessible practices', async () => {
      const noAccessContext = { ...mockUserContext, accessible_practices: [] };
      const noAccessService = new QuerySecurityService(noAccessContext);

      const sql = 'SELECT * FROM ih.patients';

      await expect(noAccessService.addSecurityFilters(sql)).rejects.toThrow(
        'No accessible practices found for user'
      );
    });

    it('should handle queries ending with semicolon', async () => {
      const sql = 'SELECT * FROM ih.patients;';
      const secured = await service.addSecurityFilters(sql);

      expect(secured).toContain('practice_uid IN (1,2,3)');
      expect(secured).not.toMatch(/;.*WHERE/); // Semicolon shouldn't interfere
    });
  });
});

