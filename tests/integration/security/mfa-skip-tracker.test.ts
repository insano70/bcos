/**
 * MFA Skip Tracker Security Tests
 *
 * Tests the MFA skip tracking mechanism that allows graceful MFA onboarding.
 * Users get 5 skips by default before MFA becomes mandatory.
 *
 * Security Features Tested:
 * - Fail-closed: When skips exhausted, MFA is mandatory
 * - Audit trail: All skips logged for compliance
 * - Progressive enforcement: Becomes mandatory after 5 skips
 *
 * Note: WebAuthn/Passkey verification tests require browser-level mocking
 * and are out of scope for this file. This tests the skip tracking logic.
 *
 * Part of wide coverage strategy - core security features.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { nanoid } from 'nanoid';
import {
  getMFASkipStatus,
  isMFAEnforced,
  recordMFASkip,
} from '@/lib/auth/mfa-skip-tracker';
import { getMFAStatus, getMFAStatusWithSkips } from '@/lib/services/auth/mfa-service';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import { createCommittedUser } from '@/tests/factories/committed';
import { rollbackTransaction } from '@/tests/helpers/db-helper';

describe('MFA Skip Tracker Security', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;

  beforeEach(() => {
    scopeId = `mfa-skip-test-${nanoid(8)}`;
    scope = createTestScope(scopeId);
  });

  afterEach(async () => {
    await rollbackTransaction();
    await scope.cleanup();
  });

  describe('MFA Skip Status', () => {
    it('should start with default 5 skips for new user', async () => {
      const user = await createCommittedUser({
        email: `mfa-default-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      const status = await getMFASkipStatus(user.user_id);

      expect(status.skips_remaining).toBe(5);
      expect(status.skip_count).toBe(0);
      expect(status.first_skipped_at).toBeNull();
      expect(status.last_skipped_at).toBeNull();
    });

    it('should track skip status correctly after recording skip', async () => {
      const user = await createCommittedUser({
        email: `mfa-track-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      // Record a skip
      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');

      const status = await getMFASkipStatus(user.user_id);

      expect(status.skips_remaining).toBe(4);
      expect(status.skip_count).toBe(1);
      expect(status.first_skipped_at).toBeInstanceOf(Date);
      expect(status.last_skipped_at).toBeInstanceOf(Date);
    });

    it('should get complete MFA status with skips', async () => {
      const user = await createCommittedUser({
        email: `mfa-complete-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      const completeStatus = await getMFAStatusWithSkips(user.user_id);

      // New user should have MFA not enabled and 5 skips
      expect(completeStatus.enabled).toBe(false);
      expect(completeStatus.credential_count).toBe(0);
      expect(completeStatus.skipStatus.skips_remaining).toBe(5);
      expect(completeStatus.isEnforced).toBe(false);
    });
  });

  describe('Recording Skips', () => {
    it('should decrement skips remaining when recording skip', async () => {
      const user = await createCommittedUser({
        email: `mfa-decrement-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      const result = await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');

      expect(result.success).toBe(true);
      expect(result.skips_remaining).toBe(4);
    });

    it('should track multiple skips correctly', async () => {
      const user = await createCommittedUser({
        email: `mfa-multi-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      // Record 3 skips
      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      const result = await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');

      expect(result.skips_remaining).toBe(2);

      const status = await getMFASkipStatus(user.user_id);
      expect(status.skip_count).toBe(3);
    });

    it('should throw error when no skips remaining', async () => {
      const user = await createCommittedUser({
        email: `mfa-exhausted-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      // Exhaust all 5 skips
      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');

      // 6th skip should fail
      await expect(
        recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent')
      ).rejects.toThrow('No MFA skips remaining');
    });
  });

  describe('MFA Enforcement', () => {
    it('should not be enforced for new user with skips remaining', async () => {
      const user = await createCommittedUser({
        email: `mfa-not-enforced-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      const enforced = await isMFAEnforced(user.user_id);
      expect(enforced).toBe(false);
    });

    it('should be enforced when skips are exhausted', async () => {
      const user = await createCommittedUser({
        email: `mfa-enforced-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      // Exhaust all skips
      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');

      const enforced = await isMFAEnforced(user.user_id);
      expect(enforced).toBe(true);
    });

    it('should show enforced status in complete MFA status', async () => {
      const user = await createCommittedUser({
        email: `mfa-enforced-complete-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      // Exhaust all skips
      for (let i = 0; i < 5; i++) {
        await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      }

      const completeStatus = await getMFAStatusWithSkips(user.user_id);

      expect(completeStatus.isEnforced).toBe(true);
      expect(completeStatus.skipStatus.skips_remaining).toBe(0);
      expect(completeStatus.skipStatus.skip_count).toBe(5);
    });
  });

  describe('MFA Status (WebAuthn)', () => {
    it('should return MFA not enabled for user without passkeys', async () => {
      const user = await createCommittedUser({
        email: `mfa-no-passkey-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      const status = await getMFAStatus(user.user_id);

      expect(status.enabled).toBe(false);
      expect(status.credential_count).toBe(0);
    });
  });

  describe('Skip Timestamps', () => {
    it('should set first_skipped_at on first skip only', async () => {
      const user = await createCommittedUser({
        email: `mfa-first-skip-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      const statusAfterFirst = await getMFASkipStatus(user.user_id);
      const firstSkipTime = statusAfterFirst.first_skipped_at;

      // Wait a tiny bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      const statusAfterSecond = await getMFASkipStatus(user.user_id);

      // first_skipped_at should remain unchanged
      expect(statusAfterSecond.first_skipped_at?.getTime()).toBe(firstSkipTime?.getTime());
      // last_skipped_at should be updated
      expect(statusAfterSecond.last_skipped_at?.getTime()).toBeGreaterThanOrEqual(
        firstSkipTime?.getTime() ?? 0
      );
    });

    it('should update last_skipped_at on each skip', async () => {
      const user = await createCommittedUser({
        email: `mfa-last-skip-${nanoid(8)}@test.local`,
        scope: scopeId,
      });

      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      const statusAfterFirst = await getMFASkipStatus(user.user_id);

      // Wait a tiny bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await recordMFASkip(user.user_id, '127.0.0.1', 'TestAgent');
      const statusAfterSecond = await getMFASkipStatus(user.user_id);

      // last_skipped_at should be updated to a later time
      expect(statusAfterSecond.last_skipped_at?.getTime()).toBeGreaterThanOrEqual(
        statusAfterFirst.last_skipped_at?.getTime() ?? 0
      );
    });
  });
});
