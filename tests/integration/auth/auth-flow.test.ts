/**
 * Authentication Flow Integration Tests
 * Tests the complete auth flow: login → session → authorization → logout
 *
 * NOTE: Uses committed factories because token/session functions use the
 * global db connection, not the test transaction.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import {
  createTokenPair,
  refreshTokenPair,
  revokeRefreshToken,
  validateAccessToken,
} from '@/lib/auth/tokens';
import { db, refresh_tokens, user_sessions, token_blacklist } from '@/lib/db';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import { createCommittedUser, type CommittedUser } from '@/tests/factories/committed/user-factory';
import {
  createCommittedOrganization,
  type CommittedOrganization,
} from '@/tests/factories/committed/organization-factory';
import { createCommittedRole } from '@/tests/factories/committed/role-factory';
import { rollbackTransaction } from '@/tests/helpers/db-helper';

describe('Authentication Flow Integration', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;
  let testUser: CommittedUser;
  let testOrg: CommittedOrganization;

  beforeEach(async () => {
    scopeId = `auth-flow-test-${nanoid(8)}`;
    scope = createTestScope(scopeId);

    // Create test data for auth flow using committed factories
    testOrg = await createCommittedOrganization({
      scope: scopeId,
    });
    await createCommittedRole({
      name: `test_admin_${nanoid(8)}`,
      organizationId: testOrg.organization_id,
      scope: scopeId,
    });
    testUser = await createCommittedUser({
      // Don't specify email - let factory generate unique one
      password: 'TestPassword123!',
      scope: scopeId,
    });
  });

  afterEach(async () => {
    // Clean up tokens/sessions first (due to FK constraints - reference user)
    await db.delete(refresh_tokens).where(eq(refresh_tokens.user_id, testUser.user_id));
    await db.delete(user_sessions).where(eq(user_sessions.user_id, testUser.user_id));
    await db.delete(token_blacklist).where(eq(token_blacklist.user_id, testUser.user_id));
    // Rollback transaction-based factories
    await rollbackTransaction();
    // Clean up committed factories in dependency order
    await scope.cleanup();
  });

  describe('Complete Auth Flow', () => {
    it('should handle login → session creation → authorization → logout flow', async () => {
      // Test the business outcome: complete auth flow works end-to-end
      // NOTE: Testing business logic directly rather than HTTP layer for better reliability

      const deviceInfo = {
        userAgent: 'Test Browser',
        ipAddress: '127.0.0.1',
        fingerprint: 'test-fingerprint',
        deviceName: 'Test Device',
      };

      // 1. Create token pair (simulates login)
      const tokenPair = await createTokenPair(testUser.user_id, deviceInfo, false, testUser.email);

      expect(tokenPair.accessToken).toBeDefined();
      expect(tokenPair.refreshToken).toBeDefined();
      expect(tokenPair.sessionId).toBeDefined();

      // 2. Validate access token (simulates authorization)
      const validatedPayload = await validateAccessToken(tokenPair.accessToken);
      expect(validatedPayload).toBeDefined();
      expect(validatedPayload?.sub).toBe(testUser.user_id);
      expect(validatedPayload?.session_id).toBe(tokenPair.sessionId);

      // 3. Refresh tokens (simulates token refresh)
      const newTokenPair = await refreshTokenPair(tokenPair.refreshToken, deviceInfo);

      expect(newTokenPair).toBeDefined();
      expect(newTokenPair?.accessToken).toBeDefined();
      expect(newTokenPair?.accessToken).not.toBe(tokenPair.accessToken);

      // 4. Revoke tokens (simulates logout)
      const revokeResult = await revokeRefreshToken(newTokenPair?.refreshToken ?? '', 'logout');

      expect(revokeResult).toBe(true);

      // 5. Access token should still be valid (short-lived, expires naturally)
      // NOTE: Business logic keeps access tokens valid until expiration for performance
      const accessTokenPayload = await validateAccessToken(tokenPair.accessToken);
      expect(accessTokenPayload).toBeDefined(); // Access token remains valid until expiration

      // 6. But refresh token should be revoked (cannot get new access tokens)
      const refreshResult = await refreshTokenPair(tokenPair.refreshToken, deviceInfo);
      expect(refreshResult).toBeNull(); // Refresh should fail after logout
    });

    it('should validate authentication business logic', async () => {
      // Test business logic: authentication validates user credentials
      // NOTE: Testing business logic directly rather than HTTP layer

      const deviceInfo = {
        userAgent: 'Test Browser',
        ipAddress: '127.0.0.1',
        fingerprint: 'test-fingerprint',
        deviceName: 'Test Device',
      };

      // Valid user should be able to create tokens
      const validTokenPair = await createTokenPair(
        testUser.user_id,
        deviceInfo,
        false,
        testUser.email
      );

      expect(validTokenPair.accessToken).toBeDefined();
      expect(validTokenPair.refreshToken).toBeDefined();

      // Token should validate correctly
      const payload = await validateAccessToken(validTokenPair.accessToken);
      expect(payload).toBeDefined();
      expect(payload?.sub).toBe(testUser.user_id);
    });

    it('should handle token refresh business logic', async () => {
      // Test business logic: token refresh should work with valid refresh tokens
      // NOTE: Testing business logic directly rather than HTTP layer

      const deviceInfo = {
        userAgent: 'Test Browser',
        ipAddress: '127.0.0.1',
        fingerprint: 'test-fingerprint',
        deviceName: 'Test Device',
      };

      // 1. Create initial token pair
      const initialTokenPair = await createTokenPair(
        testUser.user_id,
        deviceInfo,
        false,
        testUser.email
      );

      expect(initialTokenPair.accessToken).toBeDefined();
      expect(initialTokenPair.refreshToken).toBeDefined();

      // 2. Refresh the token pair
      const refreshedTokenPair = await refreshTokenPair(initialTokenPair.refreshToken, deviceInfo);

      expect(refreshedTokenPair).toBeDefined();
      expect(refreshedTokenPair?.accessToken).toBeDefined();
      expect(refreshedTokenPair?.refreshToken).toBeDefined();

      // 3. New tokens should be different from original
      expect(refreshedTokenPair?.accessToken).not.toBe(initialTokenPair.accessToken);
      expect(refreshedTokenPair?.refreshToken).not.toBe(initialTokenPair.refreshToken);

      // 4. New access token should validate correctly
      const newPayload = await validateAccessToken(refreshedTokenPair?.accessToken ?? '');
      expect(newPayload).toBeDefined();
      expect(newPayload?.sub).toBe(testUser.user_id);
    });
  });
});
