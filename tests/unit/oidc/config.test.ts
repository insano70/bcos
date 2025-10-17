/**
 * OIDC Configuration Unit Tests
 *
 * Tests OIDC configuration loading and validation:
 * - Environment variable validation
 * - Server-side enforcement
 * - Configuration defaults
 * - OIDC enabled checks
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOIDCConfig, isOIDCEnabled } from '@/lib/env';
import { log } from '@/lib/logger';
import { buildOIDCConfig, checkOIDCEnabled } from '@/lib/oidc/config';
import { ConfigurationError } from '@/lib/oidc/errors';

vi.mock('@/lib/env');
vi.mock('@/lib/logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('OIDC Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildOIDCConfig', () => {
    it('should load valid configuration from environment', () => {
      vi.mocked(getOIDCConfig).mockReturnValue({
        tenantId: 'production-tenant-id',
        clientId: 'production-client-id',
        clientSecret: 'production-client-secret',
        redirectUri: 'https://app.example.com/api/auth/oidc/callback',
        sessionSecret: 'production-session-secret-32-chars',
        scopes: ['openid', 'profile', 'email'],
        allowedEmailDomains: ['example.com', 'partner.com'],
        successRedirect: '/app/dashboard',
        strictFingerprint: true,
      });

      const config = buildOIDCConfig();

      expect(config).toEqual({
        tenantId: 'production-tenant-id',
        clientId: 'production-client-id',
        clientSecret: 'production-client-secret',
        redirectUri: 'https://app.example.com/api/auth/oidc/callback',
        scopes: ['openid', 'profile', 'email'],
        allowedEmailDomains: ['example.com', 'partner.com'],
        successRedirect: '/app/dashboard',
      });

      expect(log.debug).toHaveBeenCalledWith(
        'OIDC configuration loaded',
        expect.objectContaining({
          tenantId: 'production-tenant-id',
          clientId: expect.stringContaining('producti'),
          scopes: ['openid', 'profile', 'email'],
          allowedDomains: ['example.com', 'partner.com'],
        })
      );
    });

    it('should throw ConfigurationError when OIDC not configured', () => {
      vi.mocked(getOIDCConfig).mockReturnValue(undefined);

      expect(() => buildOIDCConfig()).toThrow(ConfigurationError);
      expect(() => buildOIDCConfig()).toThrow('OIDC is not configured');
    });

    it('should include required environment variables in error', () => {
      vi.mocked(getOIDCConfig).mockReturnValue(undefined);

      try {
        buildOIDCConfig();
        expect.fail('Should have thrown ConfigurationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        const configError = error as ConfigurationError;
        expect(configError.details).toEqual({
          required: [
            'ENTRA_TENANT_ID',
            'ENTRA_APP_ID (client_id)',
            'ENTRA_CLIENT_SECRET',
            'OIDC_REDIRECT_URI',
            'OIDC_SESSION_SECRET',
          ],
        });
      }
    });

    it('should handle minimal configuration', () => {
      vi.mocked(getOIDCConfig).mockReturnValue({
        tenantId: 'minimal-tenant',
        clientId: 'minimal-client',
        clientSecret: 'minimal-secret',
        redirectUri: 'http://localhost:3000/api/auth/oidc/callback',
        sessionSecret: 'minimal-session-secret-32-chars',
        scopes: ['openid'],
        allowedEmailDomains: [],
        successRedirect: '/dashboard',
        strictFingerprint: false,
      });

      const config = buildOIDCConfig();

      expect(config.scopes).toEqual(['openid']);
      expect(config.allowedEmailDomains).toEqual([]);
    });

    it('should handle single allowed domain', () => {
      vi.mocked(getOIDCConfig).mockReturnValue({
        tenantId: 'test-tenant',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/api/auth/oidc/callback',
        sessionSecret: 'test-session-secret-32-chars-long',
        scopes: ['openid', 'profile', 'email'],
        allowedEmailDomains: ['single-domain.com'],
        successRedirect: '/dashboard',
        strictFingerprint: false,
      });

      const config = buildOIDCConfig();

      expect(config.allowedEmailDomains).toEqual(['single-domain.com']);
    });

    it('should mask client ID in debug logs', () => {
      vi.mocked(getOIDCConfig).mockReturnValue({
        tenantId: 'test-tenant',
        clientId: 'very-long-client-id-that-should-be-masked',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/api/auth/oidc/callback',
        sessionSecret: 'test-session-secret-32-chars-long',
        scopes: ['openid'],
        allowedEmailDomains: [],
        successRedirect: '/dashboard',
        strictFingerprint: false,
      });

      buildOIDCConfig();

      expect(log.debug).toHaveBeenCalledWith(
        'OIDC configuration loaded',
        expect.objectContaining({
          clientId: expect.stringMatching(/^.{8}\.\.\.$/),
        })
      );
    });
  });

  describe('Server-Side Enforcement', () => {
    it('should throw error when used on client side', () => {
      // Simulate browser environment
      const originalWindow = global.window;
      global.window = {} as never;

      expect(() => buildOIDCConfig()).toThrow(ConfigurationError);
      expect(() => buildOIDCConfig()).toThrow('server side');

      // Restore
      global.window = originalWindow;
    });

    it('should work on server side', () => {
      // Ensure we're in server context (no window)
      expect(typeof window).toBe('undefined');

      vi.mocked(getOIDCConfig).mockReturnValue({
        tenantId: 'test-tenant',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/api/auth/oidc/callback',
        sessionSecret: 'test-session-secret-32-chars-long',
        scopes: ['openid'],
        allowedEmailDomains: [],
        successRedirect: '/dashboard',
        strictFingerprint: false,
      });

      const config = buildOIDCConfig();

      expect(config.tenantId).toBe('test-tenant');
    });
  });

  describe('checkOIDCEnabled', () => {
    it('should return true when OIDC is configured', () => {
      vi.mocked(isOIDCEnabled).mockReturnValue(true);

      expect(checkOIDCEnabled()).toBe(true);
    });

    it('should return false when OIDC is not configured', () => {
      vi.mocked(isOIDCEnabled).mockReturnValue(false);

      expect(checkOIDCEnabled()).toBe(false);
    });

    it('should return false on client side', () => {
      // Simulate browser environment
      const originalWindow = global.window;
      global.window = {} as never;

      expect(checkOIDCEnabled()).toBe(false);

      // Restore
      global.window = originalWindow;
    });

    it('should call isOIDCEnabled from env module', () => {
      vi.mocked(isOIDCEnabled).mockReturnValue(true);

      checkOIDCEnabled();

      expect(isOIDCEnabled).toHaveBeenCalled();
    });
  });

  describe('Configuration Variants', () => {
    it('should handle development configuration', () => {
      vi.mocked(getOIDCConfig).mockReturnValue({
        tenantId: 'dev-tenant',
        clientId: 'dev-client',
        clientSecret: 'dev-secret',
        redirectUri: 'http://localhost:4001/api/auth/oidc/callback',
        sessionSecret: 'dev-session-secret-32-chars-long',
        scopes: ['openid', 'profile', 'email', 'offline_access'],
        allowedEmailDomains: ['dev.test.com'],
        successRedirect: '/dev/dashboard',
        strictFingerprint: false,
      });

      const config = buildOIDCConfig();

      expect(config.redirectUri).toContain('localhost');
      expect(config.scopes).toContain('offline_access');
    });

    it('should handle production configuration with multiple domains', () => {
      vi.mocked(getOIDCConfig).mockReturnValue({
        tenantId: 'prod-tenant',
        clientId: 'prod-client',
        clientSecret: 'prod-secret',
        redirectUri: 'https://app.example.com/api/auth/oidc/callback',
        sessionSecret: 'prod-session-secret-32-chars-long',
        scopes: ['openid', 'profile', 'email'],
        allowedEmailDomains: ['example.com', 'partner1.com', 'partner2.com'],
        successRedirect: '/dashboard',
        strictFingerprint: true,
      });

      const config = buildOIDCConfig();

      expect(config.redirectUri).toContain('https://');
      expect(config.allowedEmailDomains).toHaveLength(3);
    });

    it('should handle custom scopes', () => {
      vi.mocked(getOIDCConfig).mockReturnValue({
        tenantId: 'test-tenant',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/api/auth/oidc/callback',
        sessionSecret: 'test-session-secret-32-chars-long',
        scopes: ['openid', 'profile', 'email', 'custom_scope'],
        allowedEmailDomains: [],
        successRedirect: '/dashboard',
        strictFingerprint: false,
      });

      const config = buildOIDCConfig();

      expect(config.scopes).toContain('custom_scope');
    });

    it('should handle custom success redirect', () => {
      vi.mocked(getOIDCConfig).mockReturnValue({
        tenantId: 'test-tenant',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/api/auth/oidc/callback',
        sessionSecret: 'test-session-secret-32-chars-long',
        scopes: ['openid'],
        allowedEmailDomains: [],
        successRedirect: '/custom/success/page',
        strictFingerprint: false,
      });

      const config = buildOIDCConfig();

      expect(config.successRedirect).toBe('/custom/success/page');
    });
  });

  describe('Security Considerations', () => {
    it('should never log client secret', () => {
      vi.mocked(getOIDCConfig).mockReturnValue({
        tenantId: 'test-tenant',
        clientId: 'test-client',
        clientSecret: 'super-secret-value-that-should-never-be-logged',
        redirectUri: 'http://localhost:3000/api/auth/oidc/callback',
        sessionSecret: 'test-session-secret-32-chars-long',
        scopes: ['openid'],
        allowedEmailDomains: [],
        successRedirect: '/dashboard',
        strictFingerprint: false,
      });

      buildOIDCConfig();

      const logCalls = vi.mocked(log.debug).mock.calls;
      logCalls.forEach((call) => {
        const args = JSON.stringify(call);
        expect(args).not.toContain('super-secret-value');
        expect(args).not.toContain('clientSecret');
      });
    });

    it('should validate redirect URI format in logs', () => {
      vi.mocked(getOIDCConfig).mockReturnValue({
        tenantId: 'test-tenant',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'https://app.example.com/api/auth/oidc/callback',
        sessionSecret: 'test-session-secret-32-chars-long',
        scopes: ['openid'],
        allowedEmailDomains: [],
        successRedirect: '/dashboard',
        strictFingerprint: false,
      });

      buildOIDCConfig();

      expect(log.debug).toHaveBeenCalledWith(
        'OIDC configuration loaded',
        expect.objectContaining({
          redirectUri: 'https://app.example.com/api/auth/oidc/callback',
        })
      );
    });
  });
});
