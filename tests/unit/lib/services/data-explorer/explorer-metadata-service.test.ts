import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExplorerMetadataService } from '@/lib/services/data-explorer/explorer-metadata-service';
import type { UserContext } from '@/lib/types/rbac';
import { createTableMetadataFactory } from '@/tests/factories/data-explorer-factory';

// Mock the database
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

describe('ExplorerMetadataService', () => {
  let service: ExplorerMetadataService;
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
          name: 'data-explorer:metadata:read:organization',
          resource: 'data-explorer',
          action: 'metadata:read',
          scope: 'organization',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      organization_admin_for: [],
      accessible_practices: [1, 2, 3],
      accessible_providers: [100, 200],
    };

    service = new ExplorerMetadataService(mockUserContext);
  });

  describe('calculateCompleteness', () => {
    it('should calculate 100% completeness when all fields are populated', () => {
      const metadata = createTableMetadataFactory({
        display_name: 'Patients',
        description: 'Patient demographic data',
        row_meaning: 'Each row is a patient',
        primary_entity: 'patient',
        common_filters: ['practice_uid'],
        sample_questions: ['How many patients?'],
      });

      const completeness = service.calculateCompleteness(metadata);
      expect(completeness).toBe(100);
    });

    it('should calculate partial completeness when some fields are missing', () => {
      const metadata = createTableMetadataFactory({
        display_name: 'Patients',
        description: null,
        row_meaning: null,
        primary_entity: null,
        common_filters: null,
        sample_questions: null,
      });

      const completeness = service.calculateCompleteness(metadata);
      expect(completeness).toBeLessThan(100);
      expect(completeness).toBeGreaterThanOrEqual(0);
    });

    it('should return 0% completeness when all fields are empty', () => {
      const metadata = createTableMetadataFactory({
        display_name: null,
        description: null,
        row_meaning: null,
        primary_entity: null,
        common_filters: null,
        sample_questions: null,
      });

      const completeness = service.calculateCompleteness(metadata);
      expect(completeness).toBe(0);
    });
  });

  describe('RBAC enforcement', () => {
    it('should throw error if user lacks metadata:read permission', () => {
      const unauthorizedContext = {
        ...mockUserContext,
        all_permissions: [],
      };

      const unauthorizedService = new ExplorerMetadataService(unauthorizedContext);

      expect(() => unauthorizedService.getTableMetadata()).rejects.toThrow();
    });
  });
});

