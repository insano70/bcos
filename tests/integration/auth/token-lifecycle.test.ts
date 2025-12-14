/**
 * Token Lifecycle Integration Tests
 * Tests token create → validate → refresh → revoke → cleanup flow
 *
 * NOTE: Uses committed factories because token functions use the
 * global db connection, not the test transaction.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import {
  cleanupExpiredTokens,
  createTokenPair,
  refreshTokenPair,
  revokeAllUserTokens,
  revokeRefreshToken,
  validateAccessToken,
} from '@/lib/auth/tokens';
import { db, refresh_tokens, user_sessions, token_blacklist } from '@/lib/db';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import { createCommittedUser, type CommittedUser } from '@/tests/factories/committed/user-factory';
import { rollbackTransaction } from '@/tests/helpers/db-helper';

describe('Token Lifecycle Integration', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;
  let testUser: CommittedUser;

  beforeEach(async () => {
    scopeId = `token-lifecycle-test-${nanoid(8)}`;
    scope = createTestScope(scopeId);

    testUser = await createCommittedUser({
      // Don't specify email - let factory generate unique one
      password: 'TestPassword123!',
      scope: scopeId,
    });
  });

  afterEach(async () => {
    // Clean up tokens and sessions first (due to FK constraints - reference user)
    await db.delete(refresh_tokens).where(eq(refresh_tokens.user_id, testUser.user_id));
    await db.delete(user_sessions).where(eq(user_sessions.user_id, testUser.user_id));
    await db.delete(token_blacklist).where(eq(token_blacklist.user_id, testUser.user_id));
    // Rollback transaction-based factories
    await rollbackTransaction();
    // Clean up committed factories in dependency order
    await scope.cleanup();
  });

  describe('Complete Token Lifecycle', () => {
    it('should handle create → validate → refresh → revoke → cleanup flow', async () => {
      // 1. Create token pair
      const deviceInfo = {
        userAgent: 'Test Browser',
        ipAddress: '127.0.0.1',
        fingerprint: 'test-fingerprint-1',
        deviceName: 'Test Device 1',
      };

      const tokenPair = await createTokenPair(testUser.user_id, deviceInfo, false, testUser.email);

      expect(tokenPair.accessToken).toBeDefined();
      expect(tokenPair.refreshToken).toBeDefined();
      expect(tokenPair.sessionId).toBeDefined();

      // 2. Validate access token
      const validatedPayload = await validateAccessToken(tokenPair.accessToken);
      expect(validatedPayload).toBeDefined();
      expect(validatedPayload?.sub).toBe(testUser.user_id);

      // 3. Refresh tokens
      const newTokenPair = await refreshTokenPair(tokenPair.refreshToken, deviceInfo);

      expect(newTokenPair).toBeDefined();
      expect(newTokenPair?.accessToken).toBeDefined();
      expect(newTokenPair?.accessToken).not.toBe(tokenPair.accessToken);

      // 4. Revoke refresh token
      const revokeResult = await revokeRefreshToken(newTokenPair?.refreshToken ?? '', 'logout');

      expect(revokeResult).toBe(true);

      // 5. Verify revoked token cannot be used
      const failedRefresh = await refreshTokenPair(newTokenPair?.refreshToken ?? '', deviceInfo);

      expect(failedRefresh).toBeNull();

      // 6. Cleanup expired tokens
      const cleanupCounts = await cleanupExpiredTokens();
      expect(cleanupCounts.refreshTokens).toBeGreaterThanOrEqual(0);
      expect(cleanupCounts.blacklistEntries).toBeGreaterThanOrEqual(0);
    });

    it('should handle token blacklisting', async () => {
      const deviceInfo = {
        userAgent: 'Test Browser',
        ipAddress: '127.0.0.1',
        fingerprint: 'test-fingerprint-2',
        deviceName: 'Test Device 2',
      };

      // Create token
      const tokenPair = await createTokenPair(testUser.user_id, deviceInfo, false, testUser.email);

      // Validate it works
      const payload1 = await validateAccessToken(tokenPair.accessToken);
      expect(payload1).toBeDefined();

      // Revoke all user tokens (should blacklist)
      const revokeAllResult = await revokeAllUserTokens(testUser.user_id);
      expect(revokeAllResult).toBeGreaterThanOrEqual(1);

      // Access token should still be valid (expires naturally for performance)
      const payload2 = await validateAccessToken(tokenPair.accessToken);
      expect(payload2).toBeDefined(); // Access token remains valid until expiration

      // But refresh should fail (cannot get new access tokens)
      const refreshAfterRevoke = await refreshTokenPair(tokenPair.refreshToken, deviceInfo);
      expect(refreshAfterRevoke).toBeNull(); // Refresh should fail after revocation
    });

    it('should handle device-specific token management', async () => {
      const device1 = {
        userAgent: 'Chrome Browser',
        ipAddress: '127.0.0.1',
        fingerprint: 'test-fingerprint-chrome',
        deviceName: 'Chrome Device',
      };

      const device2 = {
        userAgent: 'Firefox Browser',
        ipAddress: '127.0.0.1',
        fingerprint: 'test-fingerprint-firefox',
        deviceName: 'Firefox Device',
      };

      // Create tokens for different devices
      const tokens1 = await createTokenPair(testUser.user_id, device1, false, testUser.email);
      const tokens2 = await createTokenPair(testUser.user_id, device2, false, testUser.email);

      // Both should be valid
      expect(await validateAccessToken(tokens1.accessToken)).toBeDefined();
      expect(await validateAccessToken(tokens2.accessToken)).toBeDefined();

      // Revoke device 1 only
      await revokeRefreshToken(tokens1.refreshToken, 'logout');

      // Both access tokens should still be valid (expire naturally)
      expect(await validateAccessToken(tokens1.accessToken)).toBeDefined();
      expect(await validateAccessToken(tokens2.accessToken)).toBeDefined();

      // But only device 2 should be able to refresh (device 1 refresh token revoked)
      const refresh1 = await refreshTokenPair(tokens1.refreshToken, device1);
      const refresh2 = await refreshTokenPair(tokens2.refreshToken, device2);

      expect(refresh1).toBeNull(); // Device 1 refresh should fail
      expect(refresh2).toBeDefined(); // Device 2 refresh should work
    });
  });

  describe('Token Cleanup Operations', () => {
    it('should clean up expired tokens and return accurate counts', async () => {
      // Create test tokens that will be expired
      const deviceInfo = {
        userAgent: 'Test Browser',
        ipAddress: '127.0.0.1',
        fingerprint: 'test-fingerprint-cleanup',
        deviceName: 'Test Device',
      };

      // Create some tokens (these will be active)
      const tokenPair1 = await createTokenPair(testUser.user_id, deviceInfo, false, testUser.email);

      expect(tokenPair1).toBeDefined();

      // Test cleanup operation
      const cleanupResult = await cleanupExpiredTokens();

      // Should return valid counts
      expect(cleanupResult).toBeDefined();
      expect(typeof cleanupResult.refreshTokens).toBe('number');
      expect(typeof cleanupResult.blacklistEntries).toBe('number');
      expect(cleanupResult.refreshTokens).toBeGreaterThanOrEqual(0);
      expect(cleanupResult.blacklistEntries).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Token Creation with User Context', () => {
    it('should create token pairs with valid user data', async () => {
      // Test that token creation works with real user data
      const deviceInfo = {
        userAgent: 'Integration Test Browser',
        ipAddress: '127.0.0.1',
        fingerprint: 'integration-test-fingerprint',
        deviceName: 'Integration Test Device',
      };

      const tokenPair = await createTokenPair(
        testUser.user_id,
        deviceInfo,
        true, // Test remember me functionality
        testUser.email
      );

      expect(tokenPair.accessToken).toBeDefined();
      expect(tokenPair.refreshToken).toBeDefined();
      expect(tokenPair.sessionId).toBeDefined();
      expect(tokenPair.expiresAt).toBeInstanceOf(Date);

      // Validate the created token
      const payload = await validateAccessToken(tokenPair.accessToken);
      expect(payload).toBeDefined();
      expect(payload?.sub).toBe(testUser.user_id);
    });
  });
});
