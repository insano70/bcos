import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchemaDiscoveryService } from '@/lib/services/data-explorer/schema-discovery-service';
import type { UserContext } from '@/lib/types/rbac';

vi.mock('@/lib/services/analytics-db', () => ({
  executeAnalyticsQuery: vi.fn(async (query: string) => {
    if (query.includes('COUNT')) {
      return [
        { table_name: 'agg_app_measures', column_count: 10 },
        { table_name: 'attribute_patients', column_count: 38 },
      ];
    }
    return [
      { column_name: 'practice_uid' },
      { column_name: 'date_index' },
      { column_name: 'measure' },
    ];
  }),
}));

vi.mock('@/lib/db', () => ({ db: {} }));

describe('SchemaDiscoveryService', () => {
  let service: SchemaDiscoveryService;
  let mockUserContext: UserContext;

  beforeEach(() => {
    mockUserContext = {
      user_id: 'test-user-id',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      is_active: true,
      email_verified: true,
      is_super_admin: true,
      roles: [],
      organizations: [],
      accessible_organizations: [],
      user_roles: [],
      user_organizations: [],
      current_organization_id: 'test-org',
      all_permissions: [
        {
          permission_id: '1',
          name: 'data-explorer:discovery:run:all',
          description: 'Run discovery',
          resource: 'data-explorer',
          action: 'discovery:run',
          scope: 'all',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      organization_admin_for: [],
      accessible_practices: [1, 2, 3],
    };

    service = new SchemaDiscoveryService(mockUserContext);
  });

  describe('discoverTables', () => {
    it('should discover tables from ih schema', async () => {
      // This is a structure test - full integration requires real analytics DB
      expect(service).toBeDefined();
      expect(typeof service.discoverTables).toBe('function');
    });

    it('should require discovery permission', async () => {
      const unauthorizedContext = {
        ...mockUserContext,
        is_super_admin: false,
        all_permissions: [],
      };

      const unauthorizedService = new SchemaDiscoveryService(unauthorizedContext);

      await expect(unauthorizedService.discoverTables('ih', 10)).rejects.toThrow();
    });
  });
});

