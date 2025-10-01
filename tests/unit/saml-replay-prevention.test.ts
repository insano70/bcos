/**
 * SAML Replay Prevention Tests
 * 
 * Tests for replay attack detection and prevention
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkAndTrackAssertion, cleanupExpiredEntries } from '@/lib/saml/replay-prevention';
import { db, samlReplayPrevention } from '@/lib/db';
import { eq } from 'drizzle-orm';

describe('SAML Replay Prevention', () => {
  // Clean up test data before each test
  beforeEach(async () => {
    await db.delete(samlReplayPrevention);
  });

  afterEach(async () => {
    await db.delete(samlReplayPrevention);
  });

  describe('checkAndTrackAssertion', () => {
    it('should allow first use of assertion', async () => {
      const result = await checkAndTrackAssertion(
        'assertion-id-1',
        'request-id-1',
        'user@example.com',
        '192.168.1.1',
        'Mozilla/5.0',
        new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
      );

      expect(result.safe).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should block duplicate assertion (replay attack)', async () => {
      const assertionId = 'assertion-id-2';
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      // First use - should succeed
      const firstResult = await checkAndTrackAssertion(
        assertionId,
        'request-id-2',
        'user@example.com',
        '192.168.1.1',
        'Mozilla/5.0',
        expiresAt
      );
      expect(firstResult.safe).toBe(true);

      // Second use - should block (replay attack)
      const secondResult = await checkAndTrackAssertion(
        assertionId,
        'request-id-2',
        'user@example.com',
        '192.168.1.1',
        'Mozilla/5.0',
        expiresAt
      );

      expect(secondResult.safe).toBe(false);
      expect(secondResult.reason).toContain('already been used');
      expect(secondResult.details).toBeDefined();
      expect(secondResult.details?.existingIpAddress).toBe('192.168.1.1');
    });

    it('should allow different assertions from same user', async () => {
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const result1 = await checkAndTrackAssertion(
        'assertion-id-3',
        'request-id-3a',
        'user@example.com',
        '192.168.1.1',
        'Mozilla/5.0',
        expiresAt
      );

      const result2 = await checkAndTrackAssertion(
        'assertion-id-4',
        'request-id-3b',
        'user@example.com',
        '192.168.1.1',
        'Mozilla/5.0',
        expiresAt
      );

      expect(result1.safe).toBe(true);
      expect(result2.safe).toBe(true);
    });

    it('should track security context (IP, user agent)', async () => {
      const assertionId = 'assertion-id-5';
      
      await checkAndTrackAssertion(
        assertionId,
        'request-id-5',
        'user@example.com',
        '10.0.0.1',
        'Chrome/91.0',
        new Date(Date.now() + 5 * 60 * 1000)
      );

      // Verify database entry
      const [entry] = await db
        .select()
        .from(samlReplayPrevention)
        .where(eq(samlReplayPrevention.replayId, assertionId));

      expect(entry).toBeDefined();
      expect(entry?.ipAddress).toBe('10.0.0.1');
      expect(entry?.userAgent).toBe('Chrome/91.0');
      expect(entry?.userEmail).toBe('user@example.com');
    });

    it('should set expiry with safety margin', async () => {
      const assertionExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 min
      const assertionId = 'assertion-id-6';

      await checkAndTrackAssertion(
        assertionId,
        'request-id-6',
        'user@example.com',
        '192.168.1.1',
        'Mozilla/5.0',
        assertionExpiry
      );

      const [entry] = await db
        .select()
        .from(samlReplayPrevention)
        .where(eq(samlReplayPrevention.replayId, assertionId));

      // Should have 1 hour safety margin
      const expectedExpiry = new Date(assertionExpiry.getTime() + 60 * 60 * 1000);
      const actualExpiry = entry!.expiresAt.getTime();
      
      // Allow 1 second tolerance for test execution time
      expect(Math.abs(actualExpiry - expectedExpiry.getTime())).toBeLessThan(1000);
    });
  });

  describe('cleanupExpiredEntries', () => {
    it('should delete expired entries', async () => {
      const now = Date.now();
      const expiredDate = new Date(now - 1000); // 1 second ago
      const futureDate = new Date(now + 5 * 60 * 1000); // 5 minutes from now

      // Insert expired entry
      await db.insert(samlReplayPrevention).values({
        replayId: 'expired-1',
        inResponseTo: 'request-1',
        userEmail: 'user1@example.com',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        expiresAt: expiredDate,
        sessionId: null
      });

      // Insert non-expired entry
      await db.insert(samlReplayPrevention).values({
        replayId: 'active-1',
        inResponseTo: 'request-2',
        userEmail: 'user2@example.com',
        ipAddress: '192.168.1.2',
        userAgent: 'Mozilla/5.0',
        expiresAt: futureDate,
        sessionId: null
      });

      // Run cleanup
      await cleanupExpiredEntries();

      // Verify expired entry deleted
      const expiredEntry = await db
        .select()
        .from(samlReplayPrevention)
        .where(eq(samlReplayPrevention.replayId, 'expired-1'));
      expect(expiredEntry).toHaveLength(0);

      // Verify non-expired entry still exists
      const activeEntry = await db
        .select()
        .from(samlReplayPrevention)
        .where(eq(samlReplayPrevention.replayId, 'active-1'));
      expect(activeEntry).toHaveLength(1);
    });
  });
});

