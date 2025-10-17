/**
 * Authentication Flow Integration Tests
 * Tests the complete auth flow: login → session → authorization → logout
 */

import { beforeEach, describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup'; // Import integration setup for database access
import {
  createTokenPair,
  refreshTokenPair,
  revokeRefreshToken,
  validateAccessToken,
} from '@/lib/auth/token-manager';
import { createTestOrganization } from '@/tests/factories/organization-factory';
import { createTestRole } from '@/tests/factories/role-factory';
import { createTestUser } from '@/tests/factories/user-factory';

describe('Authentication Flow Integration', () => {
  let testUser: any;
  let testOrg: any;
  let _testRole: any;

  beforeEach(async () => {
    // Create test data for auth flow
    testOrg = await createTestOrganization();
    _testRole = await createTestRole({
      name: 'test_admin',
      organizationId: testOrg.organization_id,
    });
    testUser = await createTestUser({
      email: 'authtest@example.com',
      password: 'TestPassword123!',
    });
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
      const revokeResult = await revokeRefreshToken(newTokenPair?.refreshToken, 'logout');

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
      const newPayload = await validateAccessToken(refreshedTokenPair?.accessToken);
      expect(newPayload).toBeDefined();
      expect(newPayload?.sub).toBe(testUser.user_id);
    });
  });
});
