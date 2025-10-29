import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryExecutorService } from '@/lib/services/data-explorer/query-executor-service';
import type { UserContext } from '@/lib/types/rbac';

// Mock dependencies
vi.mock('@/lib/services/analytics-db', () => ({
  executeAnalyticsQuery: vi.fn(async (_sql: string) => {
    return [{ count: 100 }];
  }),
  checkAnalyticsDbHealth: vi.fn(async () => ({
    isHealthy: true,
    latency: 50,
    error: null,
  })),
}));

vi.mock('@/lib/db', () => ({ db: {} }));

describe('QueryExecutorService', () => {
  let service: QueryExecutorService;
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
      all_permissions: [
        {
          permission_id: '1',
          name: 'data-explorer:execute:organization',
          resource: 'data-explorer',
          action: 'execute',
          scope: 'organization',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      organization_admin_for: [],
      accessible_practices: [1, 2, 3],
      accessible_providers: [100],
    };

    service = new QueryExecutorService(mockUserContext);
  });

  describe('validateSQL', () => {
    it('should allow valid SELECT queries with ih schema', async () => {
      const result = await service.validateSQL('SELECT * FROM ih.patients LIMIT 10');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject queries without ih schema prefix', async () => {
      const result = await service.validateSQL('SELECT * FROM patients');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Query must reference tables using "ih." schema prefix');
    });

    it('should reject DROP statements', async () => {
      const result = await service.validateSQL('DROP TABLE ih.patients');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Destructive operation'))).toBe(true);
    });

    it('should reject DELETE statements', async () => {
      const result = await service.validateSQL('DELETE FROM ih.patients WHERE id = 1');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Destructive operation'))).toBe(true);
    });

    it('should reject INSERT statements', async () => {
      const result = await service.validateSQL('INSERT INTO ih.patients VALUES (1, 2, 3)');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Destructive operation'))).toBe(true);
    });

    it('should reject UPDATE statements', async () => {
      const result = await service.validateSQL('UPDATE ih.patients SET name = "test"');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Destructive operation'))).toBe(true);
    });
  });
});

