/**
 * OIDC Database State Manager Unit Tests
 *
 * Tests the PostgreSQL-backed state token validation logic:
 * - State registration with atomic constraints
 * - One-time use enforcement via SELECT FOR UPDATE
 * - State expiration (TTL validation)
 * - Cleanup operations
 * - Security logging
 * - Horizontal scaling support
 *
 * CRITICAL: This component prevents replay attacks in distributed systems
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { log } from '@/lib/logger';
import { databaseStateManager } from '@/lib/oidc/database-state-manager';

// Mock dependencies
vi.mock('@/lib/logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
  oidc_states: {
    state: 'state',
    nonce: 'nonce',
    user_fingerprint: 'user_fingerprint',
    is_used: 'is_used',
    created_at: 'created_at',
    expires_at: 'expires_at',
    used_at: 'used_at',
  },
  oidc_nonces: {
    nonce: 'nonce',
    state: 'state',
    created_at: 'created_at',
    expires_at: 'expires_at',
  },
}));

describe('DatabaseStateManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registerState', () => {
    it('should register state successfully', async () => {
      const state = 'test-state-token-123';
      const nonce = 'test-nonce-456';
      const fingerprint = 'test-fingerprint-789';

      // Mock successful database insert - Drizzle returns object with values method
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as never);

      await databaseStateManager.registerState(state, nonce, fingerprint);

      expect(db.insert).toHaveBeenCalledTimes(1); // Only one insert for oidc_states
      // Implementation uses log.debug, not log.info
      expect(log.debug).toHaveBeenCalledWith(
        'State token registered in database',
        expect.objectContaining({
          state: expect.stringContaining('test-sta'),
        })
      );
    });

    it('should reject empty state token', async () => {
      await expect(databaseStateManager.registerState('', 'nonce', 'fingerprint')).rejects.toThrow(
        'Invalid state token'
      );

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should reject empty nonce', async () => {
      await expect(databaseStateManager.registerState('state', '', 'fingerprint')).rejects.toThrow(
        'Invalid nonce'
      );

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should handle database constraint violation (duplicate state)', async () => {
      const state = 'duplicate-state';
      const nonce = 'nonce';
      const fingerprint = 'fingerprint';

      // Mock database constraint error - Drizzle returns object with values method
      vi.mocked(db.insert).mockReturnValue({
        values: vi
          .fn()
          .mockRejectedValue(new Error('duplicate key value violates unique constraint')),
      } as never);

      await expect(databaseStateManager.registerState(state, nonce, fingerprint)).rejects.toThrow();

      expect(log.error).toHaveBeenCalledWith(
        'Failed to register state token',
        expect.any(Error),
        expect.objectContaining({ state: expect.any(String) })
      );
    });

    it('should handle optional fingerprint parameter', async () => {
      const state = 'state';
      const nonce = 'nonce';

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as never);

      await databaseStateManager.registerState(state, nonce);

      expect(db.insert).toHaveBeenCalledTimes(1); // Only one insert for oidc_states
    });
  });

  describe('validateAndMarkUsed - One-Time Use Enforcement', () => {
    it('should validate unused state within TTL', async () => {
      const state = 'valid-state-token';

      // Mock transaction that finds valid unused state
      const mockTransaction = vi
        .fn()
        .mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
          const mockTx = {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  for: vi.fn().mockResolvedValue([
                    {
                      state,
                      nonce: 'test-nonce',
                      is_used: false,
                      created_at: new Date(),
                      expires_at: new Date(Date.now() + 10 * 60 * 1000),
                    },
                  ]),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined),
              }),
            }),
          };
          return callback(mockTx);
        });

      vi.mocked(db.transaction).mockImplementation(mockTransaction as never);

      const result = await databaseStateManager.validateAndMarkUsed(state);

      expect(result).toBe(true);
      expect(log.info).toHaveBeenCalledWith(
        'State token validated and marked as used',
        expect.objectContaining({
          state: expect.stringContaining('valid-st'),
        })
      );
    });

    it('should reject replay attack - already-used state', async () => {
      const state = 'replay-attack-state';

      // Mock transaction that finds already-used state
      const mockTransaction = vi
        .fn()
        .mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
          const mockTx = {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  for: vi.fn().mockResolvedValue([
                    {
                      state,
                      nonce: 'test-nonce',
                      is_used: true, // Already used
                      created_at: new Date(),
                      expires_at: new Date(Date.now() + 10 * 60 * 1000),
                    },
                  ]),
                }),
              }),
            }),
          };
          return callback(mockTx);
        });

      vi.mocked(db.transaction).mockImplementation(mockTransaction as never);

      const result = await databaseStateManager.validateAndMarkUsed(state);

      expect(result).toBe(false);
      expect(log.error).toHaveBeenCalledWith(
        'State token replay attempt detected',
        expect.objectContaining({
          state: expect.stringContaining('replay-a'),
        })
      );
    });

    it('should reject expired state', async () => {
      const state = 'expired-state-token';

      // Mock transaction that finds no states (expired states filtered by WHERE clause)
      const mockTransaction = vi
        .fn()
        .mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
          const mockTx = {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  for: vi.fn().mockResolvedValue([]), // No results due to expiration filter
                }),
              }),
            }),
          };
          return callback(mockTx);
        });

      vi.mocked(db.transaction).mockImplementation(mockTransaction as never);

      const result = await databaseStateManager.validateAndMarkUsed(state);

      expect(result).toBe(false);
      expect(log.warn).toHaveBeenCalledWith(
        'State token not found or expired',
        expect.objectContaining({
          state: expect.stringContaining('expired-'),
        })
      );
    });

    it('should reject non-existent state token', async () => {
      const state = 'non-existent-state';

      // Mock transaction that finds no states
      const mockTransaction = vi
        .fn()
        .mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
          const mockTx = {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  for: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          };
          return callback(mockTx);
        });

      vi.mocked(db.transaction).mockImplementation(mockTransaction as never);

      const result = await databaseStateManager.validateAndMarkUsed(state);

      expect(result).toBe(false);
      expect(log.warn).toHaveBeenCalledWith('State token not found or expired', expect.any(Object));
    });

    it('should handle database transaction errors gracefully', async () => {
      const state = 'error-state';

      // Mock transaction failure
      vi.mocked(db.transaction).mockRejectedValue(new Error('Database connection failed'));

      const result = await databaseStateManager.validateAndMarkUsed(state);

      expect(result).toBe(false);
      // Implementation uses "State validation transaction failed"
      expect(log.error).toHaveBeenCalledWith(
        'State validation transaction failed',
        expect.any(Error),
        expect.objectContaining({ state: expect.any(String) })
      );
    });

    it('should use row-level locking for atomicity', async () => {
      const state = 'locked-state';

      const mockFor = vi.fn().mockResolvedValue([
        {
          state,
          nonce: 'nonce',
          is_used: false,
          created_at: new Date(),
          expires_at: new Date(Date.now() + 10 * 60 * 1000),
        },
      ]);

      const mockTransaction = vi
        .fn()
        .mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
          const mockTx = {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  for: mockFor,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined),
              }),
            }),
          };
          return callback(mockTx);
        });

      vi.mocked(db.transaction).mockImplementation(mockTransaction as never);

      await databaseStateManager.validateAndMarkUsed(state);

      // Verify SELECT FOR UPDATE was called
      expect(mockFor).toHaveBeenCalledWith('update');
    });
  });

  describe('getNonce', () => {
    it('should retrieve nonce for valid state', async () => {
      const state = 'state-with-nonce';
      const expectedNonce = 'expected-nonce-value';

      // db.select().from().where().limit() chain
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ nonce: expectedNonce }]),
          }),
        }),
      } as never);

      const nonce = await databaseStateManager.getNonce(state);

      expect(nonce).toBe(expectedNonce);
    });

    it('should return null for non-existent state', async () => {
      const state = 'non-existent-state';

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const nonce = await databaseStateManager.getNonce(state);

      expect(nonce).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      const state = 'error-state';

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error('Database error')),
          }),
        }),
      } as never);

      const nonce = await databaseStateManager.getNonce(state);

      expect(nonce).toBeNull();
      expect(log.error).toHaveBeenCalledWith(
        'Failed to retrieve nonce for state',
        expect.any(Error),
        expect.objectContaining({ state: expect.any(String) })
      );
    });
  });

  describe('cleanupExpired', () => {
    it('should cleanup expired states from oidc_states table', async () => {
      // Mock delete with .where() - returns array of deleted items
      const mockDeleteResult = [{ id: 1 }, { id: 2 }, { id: 3 }]; // 3 items deleted

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(mockDeleteResult),
      } as never);

      const cleaned = await databaseStateManager.cleanupExpired();

      expect(cleaned).toBe(3); // Only oidc_states, no separate nonces table
      expect(db.delete).toHaveBeenCalledTimes(1);
      expect(log.info).toHaveBeenCalledWith(
        'Expired OIDC states cleaned up',
        expect.objectContaining({
          deleted: 3,
        })
      );
    });

    it('should handle no expired entries gracefully', async () => {
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue([]), // Empty array
      } as never);

      const cleaned = await databaseStateManager.cleanupExpired();

      expect(cleaned).toBe(0);
      // log.info is NOT called when deleted === 0
      expect(log.info).not.toHaveBeenCalled();
    });

    it('should handle database errors during cleanup', async () => {
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('Cleanup failed')),
      } as never);

      const cleaned = await databaseStateManager.cleanupExpired();

      expect(cleaned).toBe(0);
      expect(log.error).toHaveBeenCalledWith('Failed to cleanup expired states', expect.any(Error));
    });
  });

  describe('clearAll', () => {
    it('should clear all states from oidc_states table', async () => {
      // Implementation: db.delete(oidc_states) returns array directly (no .where())
      const mockDeleteResult = Array.from({ length: 10 }, (_, i) => ({ id: i }));

      // clearAll doesn't use .where(), it's a simple delete
      vi.mocked(db.delete).mockResolvedValue(mockDeleteResult as never);

      const cleared = await databaseStateManager.clearAll();

      expect(cleared).toBe(10); // Only oidc_states, no separate nonces table
      expect(log.warn).toHaveBeenCalledWith(
        'All OIDC states cleared from database',
        expect.objectContaining({
          deleted: 10,
        })
      );
    });

    it('should handle empty database gracefully', async () => {
      vi.mocked(db.delete).mockResolvedValue([] as never);

      const cleared = await databaseStateManager.clearAll();

      expect(cleared).toBe(0);
    });

    it('should handle database errors during clearAll', async () => {
      vi.mocked(db.delete).mockRejectedValue(new Error('Clear failed'));

      const cleared = await databaseStateManager.clearAll();

      expect(cleared).toBe(0);
      expect(log.error).toHaveBeenCalledWith('Failed to clear all states', expect.any(Error));
    });
  });

  describe('getStateCount', () => {
    it('should return current number of active states', async () => {
      // Drizzle db.select() returns an object with .from() method
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([{}, {}, {}]), // 3 states
      } as never);

      const count = await databaseStateManager.getStateCount();

      expect(count).toBe(3);
    });

    it('should return 0 for empty database', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([]),
      } as never);

      const count = await databaseStateManager.getStateCount();

      expect(count).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockRejectedValue(new Error('Count failed')),
      } as never);

      const count = await databaseStateManager.getStateCount();

      expect(count).toBe(0);
      expect(log.error).toHaveBeenCalledWith('Failed to get state count', expect.any(Error));
    });
  });

  describe('Security and Concurrency', () => {
    it('should handle concurrent validation attempts safely', async () => {
      const state = 'concurrent-state';

      // First call succeeds, second finds already-used state
      let callCount = 0;
      const mockTransaction = vi
        .fn()
        .mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
          callCount++;
          const mockTx = {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  for: vi.fn().mockResolvedValue(
                    callCount === 1
                      ? [
                          {
                            state,
                            nonce: 'nonce',
                            is_used: false,
                            created_at: new Date(),
                            expires_at: new Date(Date.now() + 10 * 60 * 1000),
                          },
                        ]
                      : [
                          {
                            state,
                            nonce: 'nonce',
                            is_used: true, // Already marked as used
                            created_at: new Date(),
                            expires_at: new Date(Date.now() + 10 * 60 * 1000),
                          },
                        ]
                  ),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined),
              }),
            }),
          };
          return callback(mockTx);
        });

      vi.mocked(db.transaction).mockImplementation(mockTransaction as never);

      // First validation succeeds
      const result1 = await databaseStateManager.validateAndMarkUsed(state);
      expect(result1).toBe(true);

      // Second validation fails (replay attack)
      const result2 = await databaseStateManager.validateAndMarkUsed(state);
      expect(result2).toBe(false);

      expect(log.error).toHaveBeenCalledWith(
        'State token replay attempt detected',
        expect.any(Object)
      );
    });

    it('should log security alerts on replay attempts', async () => {
      const state = 'security-test-state';

      const mockTransaction = vi
        .fn()
        .mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
          const mockTx = {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  for: vi.fn().mockResolvedValue([
                    {
                      state,
                      nonce: 'nonce',
                      is_used: true,
                      created_at: new Date(),
                      expires_at: new Date(Date.now() + 10 * 60 * 1000),
                    },
                  ]),
                }),
              }),
            }),
          };
          return callback(mockTx);
        });

      vi.mocked(db.transaction).mockImplementation(mockTransaction as never);

      await databaseStateManager.validateAndMarkUsed(state);

      expect(log.error).toHaveBeenCalledWith(
        'State token replay attempt detected',
        expect.objectContaining({
          state: expect.stringContaining('security'),
        })
      );
    });
  });
});
