import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BedrockService } from '@/lib/services/data-explorer/bedrock-service';
import type { UserContext } from '@/lib/types/rbac';

// Mock Bedrock client
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn(() => ({
    send: mockSend,
  })),
  InvokeModelCommand: vi.fn((input) => input),
}));

vi.mock('@/lib/db', () => ({ db: {} }));

vi.mock('@/lib/services/data-explorer', () => ({
  createRBACExplorerMetadataService: vi.fn(() => ({
    getTableMetadata: vi.fn(async () => [
      {
        table_name: 'patients',
        description: 'Patient demographic information',
      },
      {
        table_name: 'encounters',
        description: 'Patient visit records',
      },
    ]),
  })),
}));

describe('BedrockService', () => {
  let service: BedrockService;
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
      roles: [{
        role_id: 'role-1',
        name: 'analyst',
        description: 'Data Analyst',
        organization_id: 'test-org',
        is_system_role: false,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: undefined,
        permissions: [{
          permission_id: '1',
          name: 'data-explorer:query:organization',
          description: 'Query data for organization',
          resource: 'data-explorer',
          action: 'query',
          scope: 'organization',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        }],
      }],
      organizations: [{
        organization_id: 'test-org',
        name: 'Test Org',
        slug: 'test-org',
        parent_organization_id: null,
        practice_uids: [1, 2, 3],
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: undefined,
      }],
      accessible_organizations: [{
        organization_id: 'test-org',
        name: 'Test Org',
        slug: 'test-org',
        parent_organization_id: null,
        practice_uids: [1, 2, 3],
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: undefined,
      }],
      user_roles: [{
        user_role_id: 'ur-1',
        user_id: 'test-user-id',
        role_id: 'role-1',
        organization_id: 'test-org',
        granted_by: 'admin',
        granted_at: new Date(),
        is_active: true,
        created_at: new Date(),
      }],
      user_organizations: [{
        user_organization_id: 'uo-1',
        user_id: 'test-user-id',
        organization_id: 'test-org',
        is_active: true,
        joined_at: new Date(),
        created_at: new Date(),
      }],
      current_organization_id: 'test-org',
      all_permissions: [
        {
          permission_id: '1',
          name: 'data-explorer:query:organization',
          description: 'Query data for organization',
          resource: 'data-explorer',
          action: 'query',
          scope: 'organization',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      organization_admin_for: [],
      accessible_practices: [1, 2, 3],
    };

    service = new BedrockService(mockUserContext);

    // Mock Bedrock response
    mockSend.mockResolvedValue({
      body: new TextEncoder().encode(
        JSON.stringify({
          content: [{ text: '```sql\nSELECT COUNT(*) FROM ih.patients\n```' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        })
      ),
    });
  });

  describe('generateSQL', () => {
    it('should generate SQL from natural language query', async () => {
      const result = await service.generateSQL('How many patients?');

      expect(result.sql).toContain('SELECT');
      expect(result.sql).toContain('ih.patients');
      expect(result.tables_used).toContain('patients');
      expect(result.model_used).toBeDefined();
      expect(result.prompt_tokens).toBeGreaterThan(0);
      expect(result.completion_tokens).toBeGreaterThan(0);
    });

    it('should extract SQL from markdown code blocks', async () => {
      const result = await service.generateSQL('Show all patients');

      expect(result.sql).not.toContain('```sql');
      expect(result.sql).not.toContain('```');
    });

    it('should include explanation when requested', async () => {
      mockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [
              {
                text: 'This query counts patients.\n\n```sql\nSELECT COUNT(*) FROM ih.patients\n```',
              },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          })
        ),
      });

      const result = await service.generateSQL('How many patients?', {
        include_explanation: true,
      });

      expect(result.explanation).toBeDefined();
      expect(result.explanation).toContain('This query counts patients');
    });

    it('should estimate query complexity correctly', async () => {
      // Simple query - no joins
      mockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ text: 'SELECT COUNT(*) FROM ih.patients' }],
            usage: { input_tokens: 100, output_tokens: 50 },
          })
        ),
      });

      const simpleResult = await service.generateSQL('Count patients');
      expect(simpleResult.estimated_complexity).toBe('simple');

      // Moderate query - 1-3 joins
      mockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [
              {
                text: 'SELECT * FROM ih.patients JOIN ih.encounters JOIN ih.claims',
              },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          })
        ),
      });

      const moderateResult = await service.generateSQL('Show patient encounters with claims');
      expect(moderateResult.estimated_complexity).toBe('moderate');

      // Complex query - 4+ joins or subqueries
      mockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [
              {
                text: 'SELECT * FROM ih.patients JOIN ih.encounters JOIN ih.claims JOIN ih.payments WHERE patient_id IN (SELECT patient_id FROM ih.diagnoses)',
              },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          })
        ),
      });

      const complexResult = await service.generateSQL('Complex nested query');
      expect(complexResult.estimated_complexity).toBe('complex');
    });
  });
});

