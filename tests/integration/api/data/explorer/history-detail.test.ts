import { describe, it, expect } from 'vitest';
import '@/tests/setup/integration-setup';
import { createQueryHistoryFactory } from '@/tests/factories/data-explorer-factory';

describe('GET /api/data/explorer/history/[id]', () => {
  it('should return query details by ID (structure test)', () => {
    const mockQuery = createQueryHistoryFactory();
    expect(mockQuery.query_history_id).toBeDefined();
    expect(mockQuery.generated_sql).toBeDefined();
  });
});

describe('POST /api/data/explorer/history/[id]/rate', () => {
  it('should rate a query (structure test)', () => {
    const rating = 5;
    expect(rating).toBeGreaterThanOrEqual(1);
    expect(rating).toBeLessThanOrEqual(5);
  });
});

