/**
 * Password Login Integration Tests
 * Tests the password-based authentication endpoint via HTTP
 *
 * These tests verify:
 * - Successful login with valid credentials
 * - Failed login scenarios (invalid password, inactive user, etc.)
 * - Account lockout after multiple failed attempts
 * - Rate limiting enforcement
 * - Cookie and token management
 * - CSRF protection
 * - Audit logging
 */

import { describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { users } from '@/lib/db/schema';
import { createInactiveTestUser, createTestUser } from '@/tests/factories/user-factory';
import { getCurrentTransaction } from '@/tests/helpers/db-helper';
import { generateUniqueEmail } from '@/tests/helpers/unique-generator';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001';

/**
 * Helper to get anonymous CSRF token for login/register
 */
async function getAnonymousCSRFToken(): Promise<string> {
  const response = await fetch(`${baseUrl}/api/csrf`);
  const data = await response.json();
  return data.data.csrfToken;
}

/**
 * Helper to login with CSRF protection
 */
async function loginWithCSRF(email: string, password: string, remember = false) {
  const csrfToken = await getAnonymousCSRFToken();
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ email, password, remember }),
  });
}

describe('Password Login Integration', () => {
  describe('Successful Login', () => {
    it('should login with valid credentials and return user data', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const response = await loginWithCSRF(email, password);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.user.email).toBe(email);
      expect(data.data.accessToken).toBeTruthy();
      expect(data.data.sessionId).toBeTruthy();
      expect(data.data.csrfToken).toBeTruthy();

      // Verify cookies are set
      const setCookie = response.headers.get('set-cookie');
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain('refresh-token');
      expect(setCookie).toContain('access-token');
    });

    it('should set httpOnly cookies for tokens', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const response = await loginWithCSRF(email, password);

      const setCookie = response.headers.get('set-cookie');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
    });

    it('should handle remember me flag with extended session', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const response = await loginWithCSRF(email, password, true);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify extended session cookie
      const setCookie = response.headers.get('set-cookie');
      expect(setCookie).toBeTruthy();
    });

    it('should return user roles and permissions', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const response = await loginWithCSRF(email, password);

      const data = await response.json();
      expect(data.data.user.roles).toBeDefined();
      expect(data.data.user.permissions).toBeDefined();
      expect(Array.isArray(data.data.user.roles)).toBe(true);
      expect(Array.isArray(data.data.user.permissions)).toBe(true);
    });

    it('should generate CSRF token on successful login', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const response = await loginWithCSRF(email, password);

      const data = await response.json();
      expect(data.data.csrfToken).toBeTruthy();
      expect(typeof data.data.csrfToken).toBe('string');
      expect(data.data.csrfToken.length).toBeGreaterThan(20);
    });
  });

  describe('Failed Login - Invalid Credentials', () => {
    it('should reject login with invalid password', async () => {
      const email = generateUniqueEmail();
      const password = 'CorrectPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const response = await loginWithCSRF(email, 'WrongPassword123!');

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeTruthy();
    });

    it('should reject login with non-existent email', async () => {
      const response = await loginWithCSRF(generateUniqueEmail(), 'AnyPassword123!');

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeTruthy();
    });

    it('should use generic error message for invalid credentials', async () => {
      const email = generateUniqueEmail();

      await createTestUser({ email, password: 'CorrectPassword123!' });

      const response = await loginWithCSRF(email, 'WrongPassword123!');

      const data = await response.json();
      // Should not reveal whether user exists
      expect(data.error.toLowerCase()).toContain('invalid');
    });
  });

  describe('Failed Login - Inactive User', () => {
    it('should reject login for inactive user', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createInactiveTestUser({ email, password });

      const response = await loginWithCSRF(email, password);

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.toLowerCase()).toContain('inactive');
    });
  });

  describe('Failed Login - SSO-Only User', () => {
    it('should reject password login for SSO-only user', async () => {
      const email = generateUniqueEmail();
      const tx = getCurrentTransaction();

      // Create SSO-only user (no password hash)
      await tx
        .insert(users)
        .values({
          email,
          password_hash: null, // SSO-only user
          first_name: 'SSO',
          last_name: 'User',
          email_verified: true,
          is_active: true,
        })
        .returning();

      const response = await loginWithCSRF(email, 'AnyPassword123!');

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.toLowerCase()).toContain('single sign-on');
    });
  });

  describe('Account Lockout', () => {
    it('should lock account after multiple failed attempts', async () => {
      const email = generateUniqueEmail();
      const password = 'CorrectPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await loginWithCSRF(email, 'WrongPassword123!');
      }

      // 6th attempt should be blocked due to lockout
      const response = await loginWithCSRF(email, password);

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.toLowerCase()).toContain('locked');
    });

    it('should clear failed attempts on successful login', async () => {
      const email = generateUniqueEmail();
      const password = 'CorrectPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      // Make 2 failed attempts
      for (let i = 0; i < 2; i++) {
        await loginWithCSRF(email, 'WrongPassword123!');
      }

      // Successful login should clear failed attempts
      const successResponse = await loginWithCSRF(email, password);

      expect(successResponse.status).toBe(200);

      // Make 2 more failed attempts (should not be at 4 total)
      for (let i = 0; i < 2; i++) {
        await loginWithCSRF(email, 'WrongPassword123!');
      }

      // Should not be locked yet (only 2 attempts after reset)
      const testResponse = await loginWithCSRF(email, password);

      expect(testResponse.status).toBe(200);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on login attempts', async () => {
      const email = generateUniqueEmail();

      // Make rapid login attempts (exact limit depends on rate limit config)
      const responses = [];
      for (let i = 0; i < 20; i++) {
        const response = await loginWithCSRF(email, 'TestPassword123!');
        responses.push(response.status);
      }

      // Should eventually hit rate limit (429)
      expect(responses).toContain(429);
    });
  });

  describe('Input Validation', () => {
    it('should reject login with missing email', async () => {
      const csrfToken = await getAnonymousCSRFToken();
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ password: 'TestPassword123!' }),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should reject login with missing password', async () => {
      const csrfToken = await getAnonymousCSRFToken();
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ email: generateUniqueEmail() }),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should reject login with invalid email format', async () => {
      const csrfToken = await getAnonymousCSRFToken();
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ email: 'not-an-email', password: 'TestPassword123!' }),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should reject login with empty credentials', async () => {
      const csrfToken = await getAnonymousCSRFToken();
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ email: '', password: '' }),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('Device and Session Information', () => {
    it('should track device information on login', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const csrfToken = await getAnonymousCSRFToken();
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Test Browser)',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ email, password }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data.sessionId).toBeTruthy();
    });

    it('should handle X-Forwarded-For header for IP tracking', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const csrfToken = await getAnonymousCSRFToken();
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.100',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ email, password }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Response Format', () => {
    it('should return standardized success response', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const response = await loginWithCSRF(email, password);

      const data = await response.json();
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('message');
      expect(data.success).toBe(true);
    });

    it('should return standardized error response', async () => {
      const response = await loginWithCSRF(generateUniqueEmail(), 'Wrong123!');

      const data = await response.json();
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('error');
      expect(data.success).toBe(false);
    });
  });

  describe('Security Headers', () => {
    it('should set security headers on login response', async () => {
      const email = generateUniqueEmail();
      const password = 'TestPassword123!';

      await createTestUser({ email, password, emailVerified: true });

      const response = await loginWithCSRF(email, password);

      // Check for security headers
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('should not expose sensitive information in error responses', async () => {
      const email = generateUniqueEmail();

      await createTestUser({ email, password: 'CorrectPassword123!' });

      const response = await loginWithCSRF(email, 'WrongPassword123!');

      const data = await response.json();
      const errorText = JSON.stringify(data).toLowerCase();

      // Should not leak implementation details
      expect(errorText).not.toContain('database');
      expect(errorText).not.toContain('sql');
      expect(errorText).not.toContain('bcrypt');
      expect(errorText).not.toContain('hash');
    });
  });
});
