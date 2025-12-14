/**
 * Account Lockout Security Tests
 *
 * Tests the account lockout mechanism that protects against brute force attacks.
 * Uses progressive lockout timeouts based on failed login attempts:
 * - 3 attempts: 1 minute lockout
 * - 4 attempts: 5 minutes lockout
 * - 5+ attempts: 15 minutes lockout
 *
 * Part of wide coverage strategy - core security features.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { nanoid } from 'nanoid';
import {
  clearFailedAttempts,
  getFailedAttemptCount,
  isAccountLocked,
  PROGRESSIVE_LOCKOUT_TIMEOUTS,
  recordFailedAttempt,
} from '@/lib/auth/security';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import { createCommittedUser } from '@/tests/factories/committed';
import { rollbackTransaction } from '@/tests/helpers/db-helper';

describe('Account Lockout Security', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;

  beforeEach(() => {
    scopeId = `lockout-test-${nanoid(8)}`;
    scope = createTestScope(scopeId);
  });

  afterEach(async () => {
    await rollbackTransaction();
    await scope.cleanup();
  });

  describe('Failed Attempt Tracking', () => {
    it('should track failed login attempts', async () => {
      const user = await createCommittedUser({
        email: `lockout-track-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      // Initial count should be 0
      const initialCount = await getFailedAttemptCount(user.email);
      expect(initialCount).toBe(0);

      // Record first failed attempt
      await recordFailedAttempt(user.email);
      const countAfterFirst = await getFailedAttemptCount(user.email);
      expect(countAfterFirst).toBe(1);

      // Record second failed attempt
      await recordFailedAttempt(user.email);
      const countAfterSecond = await getFailedAttemptCount(user.email);
      expect(countAfterSecond).toBe(2);
    });

    it('should reset failed attempts after successful login', async () => {
      const user = await createCommittedUser({
        email: `lockout-reset-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      // Record some failed attempts
      await recordFailedAttempt(user.email);
      await recordFailedAttempt(user.email);
      const countBefore = await getFailedAttemptCount(user.email);
      expect(countBefore).toBe(2);

      // Clear failed attempts (simulates successful login)
      await clearFailedAttempts(user.email);

      // Count should be reset
      const countAfter = await getFailedAttemptCount(user.email);
      expect(countAfter).toBe(0);

      // Account should not be locked
      const lockStatus = await isAccountLocked(user.email);
      expect(lockStatus.locked).toBe(false);
    });
  });

  describe('Account Lockout Behavior', () => {
    it('should not lock account after 2 failed attempts', async () => {
      const user = await createCommittedUser({
        email: `lockout-two-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      // Record 2 failed attempts
      await recordFailedAttempt(user.email);
      const result = await recordFailedAttempt(user.email);

      // Should not be locked after 2 attempts
      expect(result.locked).toBe(false);
      expect(result.lockedUntil).toBeUndefined();

      // Verify with separate check
      const lockStatus = await isAccountLocked(user.email);
      expect(lockStatus.locked).toBe(false);
    });

    it('should lock account after 3 failed attempts', async () => {
      const user = await createCommittedUser({
        email: `lockout-three-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      // Record 3 failed attempts
      await recordFailedAttempt(user.email);
      await recordFailedAttempt(user.email);
      const result = await recordFailedAttempt(user.email);

      // Should be locked after 3 attempts
      expect(result.locked).toBe(true);
      expect(result.lockedUntil).toBeDefined();

      // Lockout should be approximately 1 minute (first tier)
      const expectedLockout = PROGRESSIVE_LOCKOUT_TIMEOUTS[0] ?? 60000; // 1 minute
      const lockoutDuration = (result.lockedUntil ?? 0) - Date.now();
      expect(lockoutDuration).toBeLessThanOrEqual(expectedLockout);
      expect(lockoutDuration).toBeGreaterThan(expectedLockout - 5000); // Allow 5s tolerance

      // Verify with separate check
      const lockStatus = await isAccountLocked(user.email);
      expect(lockStatus.locked).toBe(true);
    });

    it('should apply progressive lockout timeouts', async () => {
      const user = await createCommittedUser({
        email: `lockout-progressive-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      // Record 4 failed attempts (should get 5-minute lockout)
      await recordFailedAttempt(user.email);
      await recordFailedAttempt(user.email);
      await recordFailedAttempt(user.email);
      const result4 = await recordFailedAttempt(user.email);

      // Should be locked with 5-minute timeout
      expect(result4.locked).toBe(true);
      const expectedLockout4 = PROGRESSIVE_LOCKOUT_TIMEOUTS[1] ?? 300000; // 5 minutes
      const lockoutDuration4 = (result4.lockedUntil ?? 0) - Date.now();
      expect(lockoutDuration4).toBeLessThanOrEqual(expectedLockout4);
      expect(lockoutDuration4).toBeGreaterThan(expectedLockout4 - 5000);
    });

    it('should reject login attempts on locked account', async () => {
      const user = await createCommittedUser({
        email: `lockout-reject-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      // Lock the account
      await recordFailedAttempt(user.email);
      await recordFailedAttempt(user.email);
      await recordFailedAttempt(user.email);

      // Check that account is locked
      const lockStatus = await isAccountLocked(user.email);
      expect(lockStatus.locked).toBe(true);
      expect(lockStatus.lockedUntil).toBeDefined();
      expect(lockStatus.lockedUntil).toBeGreaterThan(Date.now());
    });
  });

  describe('Lockout Expiration', () => {
    it('should return unlocked for non-existent user', async () => {
      const nonExistentEmail = `nonexistent-${nanoid(8)}@test.local`;

      const lockStatus = await isAccountLocked(nonExistentEmail);
      expect(lockStatus.locked).toBe(false);
    });

    it('should handle failed attempts for non-existent user gracefully', async () => {
      const nonExistentEmail = `nonexistent-attempt-${nanoid(8)}@test.local`;

      // Should not throw and should return unlocked
      const result = await recordFailedAttempt(nonExistentEmail);
      expect(result.locked).toBe(false);
    });
  });

  describe('Progressive Lockout Tiers', () => {
    it('should verify progressive lockout timeout configuration', () => {
      // Verify the progressive lockout configuration is correct
      expect(PROGRESSIVE_LOCKOUT_TIMEOUTS).toHaveLength(3);
      expect(PROGRESSIVE_LOCKOUT_TIMEOUTS[0]).toBe(1 * 60 * 1000); // 1 minute
      expect(PROGRESSIVE_LOCKOUT_TIMEOUTS[1]).toBe(5 * 60 * 1000); // 5 minutes
      expect(PROGRESSIVE_LOCKOUT_TIMEOUTS[2]).toBe(15 * 60 * 1000); // 15 minutes
    });

    it('should apply maximum lockout for 5+ failed attempts', async () => {
      const user = await createCommittedUser({
        email: `lockout-max-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      // Record 5 failed attempts (should get maximum 15-minute lockout)
      await recordFailedAttempt(user.email);
      await recordFailedAttempt(user.email);
      await recordFailedAttempt(user.email);
      await recordFailedAttempt(user.email);
      const result5 = await recordFailedAttempt(user.email);

      // Should be locked with 15-minute timeout (maximum tier)
      expect(result5.locked).toBe(true);
      const expectedLockout5 = PROGRESSIVE_LOCKOUT_TIMEOUTS[2] ?? 900000; // 15 minutes
      const lockoutDuration5 = (result5.lockedUntil ?? 0) - Date.now();
      expect(lockoutDuration5).toBeLessThanOrEqual(expectedLockout5);
      expect(lockoutDuration5).toBeGreaterThan(expectedLockout5 - 5000);

      // Record 6th attempt - should still be max lockout
      const result6 = await recordFailedAttempt(user.email);
      expect(result6.locked).toBe(true);
    });
  });
});
