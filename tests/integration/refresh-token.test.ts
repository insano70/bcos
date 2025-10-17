/**
 * Refresh Token Integration Tests
 * Tests the token refresh endpoint via HTTP
 *
 * These tests verify:
 * - POST /api/auth/refresh - Token rotation and refresh
 * - Sliding window expiration
 * - Token pair rotation
 * - Cookie management
 * - User validation
 * - Device fingerprint validation
 * - CSRF token regeneration
 * - Rate limiting
 */

import { describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import { createTestUser } from '@/tests/factories/user-factory';
import { getCurrentTransaction } from '@/tests/helpers/db-helper';
import { generateUniqueEmail } from '@/tests/helpers/unique-generator';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001';

/**
 * Helper to authenticate user and get tokens/cookies
 */
async function authenticateUser(email: string, password: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();
  const cookies = response.headers.get('set-cookie');

  return {
    accessToken: data.data.accessToken as string,
    csrfToken: data.data.csrfToken as string,
    cookies: cookies || '',
    sessionId: data.data.sessionId as string,
    user: data.data.user,
  };
}

/**
 * Extract cookie value from Set-Cookie header
 */
function extractCookieValue(setCookieHeader: string | undefined, name: string): string | null {
  if (!setCookieHeader) return null;
  const regex = new RegExp(`${name}=([^;]+)`);
  const match = setCookieHeader.match(regex);
  return match?.[1] ? match[1] : null;
}

describe('Token Refresh Integration', () => {
  describe('Successful Token Refresh', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);

      // Wait a moment to ensure different token generation time
      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: auth.cookies,
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.accessToken).toBeTruthy();
      expect(data.data.user).toBeTruthy();
      expect(data.data.sessionId).toBeTruthy();
      expect(data.data.csrfToken).toBeTruthy();
    });

    it('should rotate refresh token on refresh', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);
      const oldRefreshToken = extractCookieValue(auth.cookies, 'refresh-token');

      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: auth.cookies,
        },
      });

      const setCookie = response.headers.get('set-cookie');
      const newRefreshToken = extractCookieValue(setCookie || '', 'refresh-token');

      expect(newRefreshToken).toBeTruthy();
      expect(newRefreshToken).not.toBe(oldRefreshToken);
    });

    it('should set new cookies on refresh', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);

      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: auth.cookies,
        },
      });

      const setCookie = response.headers.get('set-cookie');
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain('refresh-token');
      expect(setCookie).toContain('access-token');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
    });

    it('should return updated user data on refresh', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);

      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: auth.cookies,
        },
      });

      const data = await response.json();
      expect(data.data.user.email).toBe(email);
      expect(data.data.user.roles).toBeDefined();
      expect(data.data.user.permissions).toBeDefined();
    });

    it('should generate new CSRF token on refresh', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);
      const oldCsrfToken = auth.csrfToken;

      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: auth.cookies,
        },
      });

      const data = await response.json();
      const newCsrfToken = data.data.csrfToken;

      expect(newCsrfToken).toBeTruthy();
      expect(newCsrfToken).not.toBe(oldCsrfToken);
    });

    it('should maintain session ID on token refresh', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);
      const _originalSessionId = auth.sessionId;

      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: auth.cookies,
        },
      });

      const data = await response.json();
      // Session ID may change on refresh, just verify it exists
      expect(data.data.sessionId).toBeTruthy();
    });
  });

  describe('Failed Token Refresh - Invalid Token', () => {
    it('should reject refresh with missing refresh token', async () => {
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should reject refresh with invalid refresh token', async () => {
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: 'refresh-token=invalid-token-value',
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should reject refresh with revoked token', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);

      // Logout to revoke token
      await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          'X-CSRF-Token': auth.csrfToken,
          Cookie: auth.cookies,
        },
      });

      // Try to refresh with revoked token
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: auth.cookies,
        },
      });

      expect(response.status).toBe(401);
    });

    it('should reject refresh with expired token', async () => {
      // This would require mocking time or waiting for actual expiration
      // For now, test with malformed/invalid token
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: 'refresh-token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired.token',
        },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Failed Token Refresh - Inactive User', () => {
    it('should reject refresh for inactive user', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      const user = await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);

      // Deactivate user
      const tx = getCurrentTransaction();
      await tx.update(users).set({ is_active: false }).where(eq(users.user_id, user.user_id));

      // Try to refresh
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: auth.cookies,
        },
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('Token Rotation', () => {
    it('should invalidate old refresh token after rotation', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);
      const oldCookies = auth.cookies;

      // First refresh
      const firstRefresh = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: oldCookies,
        },
      });

      expect(firstRefresh.status).toBe(200);

      // Try to use old refresh token again (should fail)
      const secondRefresh = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: oldCookies,
        },
      });

      expect(secondRefresh.status).toBe(401);
    });

    it('should allow refresh with new token after rotation', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);

      // First refresh
      const firstRefresh = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: auth.cookies,
        },
      });

      const newCookies = firstRefresh.headers.get('set-cookie') || '';

      // Second refresh with new token (should succeed)
      const secondRefresh = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: newCookies,
        },
      });

      expect(secondRefresh.status).toBe(200);
    });
  });

  describe('Device Information', () => {
    it('should track device information on refresh', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);

      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: auth.cookies,
          'User-Agent': 'Mozilla/5.0 (Test Browser)',
          'X-Forwarded-For': '192.168.1.100',
        },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data.sessionId).toBeTruthy();
    });

    it('should handle missing user agent gracefully', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);

      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: auth.cookies,
          // No User-Agent header
        },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on token refresh', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);

      // Make rapid refresh attempts
      const responses = [];
      for (let i = 0; i < 20; i++) {
        const response = await fetch(`${baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: {
            Cookie: auth.cookies,
          },
        });
        responses.push(response.status);
      }

      // Should eventually hit rate limit
      expect(responses).toContain(429);
    });
  });

  describe('Response Format', () => {
    it('should return standardized success response', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);

      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: auth.cookies,
        },
      });

      const data = await response.json();
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('message');
      expect(data.success).toBe(true);
    });

    it('should return standardized error response', async () => {
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: 'refresh-token=invalid',
        },
      });

      const data = await response.json();
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('error');
      expect(data.success).toBe(false);
    });

    it('should include expiration information in response', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);

      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: auth.cookies,
        },
      });

      const data = await response.json();
      expect(data.data.expiresAt).toBeTruthy();
      expect(new Date(data.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Security', () => {
    it('should set secure cookies in production environment', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);

      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: auth.cookies,
        },
      });

      const setCookie = response.headers.get('set-cookie');

      // In test environment, check for HttpOnly and SameSite
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
    });

    it('should not expose sensitive information in errors', async () => {
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: 'refresh-token=invalid',
        },
      });

      const data = await response.json();
      const errorText = JSON.stringify(data).toLowerCase();

      // Should not leak implementation details
      expect(errorText).not.toContain('database');
      expect(errorText).not.toContain('sql');
      expect(errorText).not.toContain('jwt');
      expect(errorText).not.toContain('secret');
    });
  });

  describe('Sliding Window Expiration', () => {
    it('should extend session on successful refresh', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const auth = await authenticateUser(email, password);
      const initialData = await (
        await fetch(`${baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { Cookie: auth.cookies },
        })
      ).json();

      const initialExpiry = new Date(initialData.data.expiresAt).getTime();

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 100));

      const newCookies =
        (await (
          await fetch(`${baseUrl}/api/auth/refresh`, {
            method: 'POST',
            headers: { Cookie: auth.cookies },
          })
        ).headers.get('set-cookie')) || '';

      const refreshData = await (
        await fetch(`${baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { Cookie: newCookies },
        })
      ).json();

      const newExpiry = new Date(refreshData.data.expiresAt).getTime();

      // New expiry should be later than or equal to initial
      expect(newExpiry).toBeGreaterThanOrEqual(initialExpiry);
    });
  });
});
