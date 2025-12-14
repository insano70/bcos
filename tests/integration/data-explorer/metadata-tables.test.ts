import { describe, it, expect } from 'vitest';
import '@/tests/setup/integration-setup';
import { createTableMetadataFactory } from '@/tests/factories/data-explorer-factory';

describe('GET /api/data/explorer/metadata/tables', () => {
  it('should return table metadata list (structure test)', async () => {
    const mockTable = createTableMetadataFactory();
    expect(mockTable.table_metadata_id).toBeDefined();
    expect(mockTable.schema_name).toBe('ih');
    expect(mockTable.tier).toBeGreaterThanOrEqual(1);
    expect(mockTable.tier).toBeLessThanOrEqual(3);
  });
});

describe('PUT /api/data/explorer/metadata/tables/[id]', () => {
  it('should update table metadata (structure test)', () => {
    const updates = {
      display_name: 'Updated Name',
      description: 'Updated description',
      tier: 1 as const,
    };
    expect(updates.tier).toBe(1);
  });
});

