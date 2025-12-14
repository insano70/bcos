import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuerySecurityService } from '@/lib/services/data-explorer/query-security-service';
import type { UserContext } from '@/lib/types/rbac';

// Mock the database
vi.mock('@/lib/db', () => ({ db: {} }));

// Mock the table allow-list service to return a controlled set of tables
vi.mock('@/lib/services/data-explorer/table-allowlist-service', () => ({
  getAllowedTables: vi.fn().mockResolvedValue(
    new Set([
      'ih.patients',
      'patients',
      'ih.appointments',
      'appointments',
      'ih.claims',
      'claims',
      '"ih"."patients"',
      '"patients"',
      '"ih"."appointments"',
      '"appointments"',
      '"ih"."claims"',
      '"claims"',
    ])
  ),
}));

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
    it('should add practice_uid filter to simple query', async () => {
      const sql = 'SELECT * FROM ih.patients';
      const secured = await service.addSecurityFilters(sql);

      expect(secured.toLowerCase()).toContain('where');
      expect(secured).toContain('practice_uid');
      expect(secured).toContain('1');
      expect(secured).toContain('2');
      expect(secured).toContain('3');
    });

    it('should AND with existing WHERE clause', async () => {
      const sql = 'SELECT * FROM ih.patients WHERE status = "active"';
      const secured = await service.addSecurityFilters(sql);

      expect(secured.toLowerCase()).toContain('and');
      expect(secured).toContain('practice_uid');
    });

    it('should preserve GROUP BY clause', async () => {
      const sql = 'SELECT status, COUNT(*) FROM ih.patients GROUP BY status';
      const secured = await service.addSecurityFilters(sql);

      expect(secured.toLowerCase()).toContain('group by');
      expect(secured).toContain('practice_uid');
    });

    it('should preserve ORDER BY clause', async () => {
      const sql = 'SELECT * FROM ih.patients ORDER BY created_at DESC';
      const secured = await service.addSecurityFilters(sql);

      expect(secured.toLowerCase()).toContain('order by');
      expect(secured).toContain('practice_uid');
    });

    it('should preserve LIMIT clause', async () => {
      const sql = 'SELECT * FROM ih.patients LIMIT 10';
      const secured = await service.addSecurityFilters(sql);

      expect(secured.toLowerCase()).toContain('limit');
      expect(secured).toContain('practice_uid');
    });

    it('should handle complex query with all clauses', async () => {
      const sql =
        'SELECT status, COUNT(*) FROM ih.patients WHERE created_at > "2024-01-01" GROUP BY status ORDER BY status LIMIT 10';
      const secured = await service.addSecurityFilters(sql);

      expect(secured.toLowerCase()).toContain('where');
      expect(secured.toLowerCase()).toContain('and');
      expect(secured.toLowerCase()).toContain('group by');
      expect(secured.toLowerCase()).toContain('order by');
      expect(secured.toLowerCase()).toContain('limit');
      expect(secured).toContain('practice_uid');
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

    it('should reject UNION queries', async () => {
      const sql = 'SELECT * FROM ih.patients UNION SELECT * FROM ih.claims';

      await expect(service.addSecurityFilters(sql)).rejects.toThrow('UNION');
    });

    it('should reject subqueries', async () => {
      const sql = 'SELECT * FROM ih.patients WHERE id IN (SELECT patient_id FROM ih.appointments)';

      await expect(service.addSecurityFilters(sql)).rejects.toThrow('Subqueries');
    });

    it('should reject tables not in allow-list', async () => {
      const sql = 'SELECT * FROM public.users';

      await expect(service.addSecurityFilters(sql)).rejects.toThrow('Table access denied');
    });

    it('should reject invalid SQL', async () => {
      const sql = 'NOT VALID SQL';

      await expect(service.addSecurityFilters(sql)).rejects.toThrow('validation failed');
    });
  });

  describe('validateQuery', () => {
    it('should validate simple SELECT query', async () => {
      const result = await service.validateQuery('SELECT * FROM ih.patients');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.tables).toHaveLength(1);
    });

    it('should flag destructive operations', async () => {
      const result = await service.validateQuery('DROP TABLE ih.patients');

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Destructive'))).toBe(true);
    });

    it('should flag UNION queries', async () => {
      const result = await service.validateQuery(
        'SELECT * FROM ih.patients UNION SELECT * FROM ih.claims'
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('UNION'))).toBe(true);
    });

    it('should flag subqueries', async () => {
      const result = await service.validateQuery(
        'SELECT * FROM ih.patients WHERE id IN (SELECT id FROM ih.appointments)'
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Subqueries'))).toBe(true);
    });

    it('should flag tables not in allow-list', async () => {
      const result = await service.validateQuery('SELECT * FROM public.secrets');

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('not in allow-list'))).toBe(true);
    });

    it('should indicate filter bypass for super admin', async () => {
      const superAdminContext = { ...mockUserContext, is_super_admin: true };
      const superService = new QuerySecurityService(superAdminContext);

      const result = await superService.validateQuery('SELECT * FROM ih.patients');

      expect(result.isValid).toBe(true);
      expect(result.requiresPracticeFilter).toBe(false);
      expect(result.warnings.some((w) => w.includes('Super admin'))).toBe(true);
    });

    it('should extract table references correctly', async () => {
      const result = await service.validateQuery(
        'SELECT p.*, a.* FROM ih.patients p JOIN ih.appointments a ON p.id = a.patient_id'
      );

      expect(result.isValid).toBe(true);
      expect(result.tables).toHaveLength(2);
      expect(result.tables.map((t) => t.table)).toContain('patients');
      expect(result.tables.map((t) => t.table)).toContain('appointments');
    });
  });

  describe('secureQuery (legacy method)', () => {
    it('should return secured SQL with filter info', async () => {
      const result = await service.secureQuery('SELECT * FROM ih.patients');

      expect(result.filtered).toBe(true);
      expect(result.practiceCount).toBe(3);
      expect(result.sql).toContain('practice_uid');
    });

    it('should return unfiltered SQL for super admin', async () => {
      const superAdminContext = { ...mockUserContext, is_super_admin: true };
      const superService = new QuerySecurityService(superAdminContext);

      const result = await superService.secureQuery('SELECT * FROM ih.patients');

      expect(result.filtered).toBe(false);
      expect(result.practiceCount).toBe(0);
      expect(result.sql).not.toContain('practice_uid');
    });

    it('should throw on invalid queries', async () => {
      await expect(service.secureQuery('SELECT * FROM public.secrets')).rejects.toThrow();
    });
  });
});
