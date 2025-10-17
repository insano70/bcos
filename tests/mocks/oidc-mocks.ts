/**
 * OIDC Mock Factory
 *
 * Provides standardized OIDC mocking following existing auth mock patterns.
 * Ensures consistent mocking across all OIDC tests.
 */

import { vi } from 'vitest';
import {
  createMockIDTokenClaims,
  createMockOIDCConfiguration,
  createMockTokenResponse,
} from '@/tests/factories/oidc-factory';

/**
 * OIDC Client Mocks
 * Mocks for openid-client module functions
 */
export interface OIDCClientMocks {
  discovery: ReturnType<typeof vi.fn>;
  randomPKCECodeVerifier: ReturnType<typeof vi.fn>;
  calculatePKCECodeChallenge: ReturnType<typeof vi.fn>;
  randomState: ReturnType<typeof vi.fn>;
  randomNonce: ReturnType<typeof vi.fn>;
  authorizationCodeGrant: ReturnType<typeof vi.fn>;
  getValidatedIdTokenClaims: ReturnType<typeof vi.fn>;
}

/**
 * Iron Session Mocks
 * Mocks for iron-session encryption functions
 */
export interface IronSessionMocks {
  sealData: ReturnType<typeof vi.fn>;
  unsealData: ReturnType<typeof vi.fn>;
}

/**
 * OIDC Module Mocks
 * Mocks for @/lib/oidc modules
 */
export interface OIDCModuleMocks {
  buildOIDCConfig: ReturnType<typeof vi.fn>;
  checkOIDCEnabled: ReturnType<typeof vi.fn>;
  isOIDCEnabled: ReturnType<typeof vi.fn>;
  getOIDCClient: ReturnType<typeof vi.fn>;
  resetOIDCClient: ReturnType<typeof vi.fn>;
}

/**
 * Complete OIDC Mock Suite
 */
export interface OIDCMockSuite {
  client: OIDCClientMocks;
  session: IronSessionMocks;
  modules: OIDCModuleMocks;
  _helpers: {
    resetAllMocks: () => void;
    setDefaultTokenResponse: (response: ReturnType<typeof createMockTokenResponse>) => void;
    setDefaultClaims: (claims: ReturnType<typeof createMockIDTokenClaims>) => void;
  };
}

/**
 * Create OIDC client mocks
 * Mocks openid-client module
 */
export function createOIDCClientMocks(): OIDCClientMocks {
  const mockConfiguration = createMockOIDCConfiguration();
  const mockTokenResponse = createMockTokenResponse();

  return {
    discovery: vi.fn().mockResolvedValue(mockConfiguration),
    randomPKCECodeVerifier: vi
      .fn()
      .mockReturnValue('test-code-verifier-43-chars-base64url-encoded'),
    calculatePKCECodeChallenge: vi.fn().mockResolvedValue('test-code-challenge-base64url'),
    randomState: vi.fn().mockReturnValue('test-state-token-32-characters'),
    randomNonce: vi.fn().mockReturnValue('test-nonce-token-32-characters'),
    authorizationCodeGrant: vi.fn().mockResolvedValue(mockTokenResponse),
    getValidatedIdTokenClaims: vi.fn().mockReturnValue(createMockIDTokenClaims()),
  };
}

/**
 * Create iron-session mocks
 * Mocks session encryption functions
 */
export function createIronSessionMocks(): IronSessionMocks {
  return {
    sealData: vi.fn().mockResolvedValue('encrypted-session-data-sealed-with-aes256gcm'),
    unsealData: vi.fn().mockImplementation(async (_sealed: string) => {
      // Return mock session data by default
      return {
        state: 'test-state-token',
        codeVerifier: 'test-code-verifier',
        nonce: 'test-nonce-token',
        returnUrl: '/dashboard',
        fingerprint: 'test-fingerprint-hash',
        timestamp: Date.now(),
      };
    }),
  };
}

/**
 * Create OIDC module mocks
 * Mocks @/lib/oidc modules
 */
export function createOIDCModuleMocks(): OIDCModuleMocks {
  return {
    buildOIDCConfig: vi.fn().mockReturnValue({
      tenantId: 'test-tenant-id',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost:4001/api/auth/oidc/callback',
      scopes: ['openid', 'profile', 'email'],
      allowedEmailDomains: ['test.com'],
      successRedirect: '/dashboard',
    }),
    checkOIDCEnabled: vi.fn().mockReturnValue(true),
    isOIDCEnabled: vi.fn().mockReturnValue(true),
    getOIDCClient: vi.fn().mockResolvedValue({
      initialize: vi.fn().mockResolvedValue(undefined),
      createAuthUrl: vi.fn().mockResolvedValue({
        url: 'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/authorize?client_id=test',
        state: 'test-state',
        codeVerifier: 'test-verifier',
        nonce: 'test-nonce',
      }),
      handleCallback: vi.fn().mockResolvedValue({
        email: 'test@test.com',
        emailVerified: true,
        name: 'Test User',
        givenName: 'Test',
        familyName: 'User',
        claims: createMockIDTokenClaims(),
      }),
    }),
    resetOIDCClient: vi.fn(),
  };
}

/**
 * Create complete OIDC mock suite
 * Standardized mock set for OIDC tests
 */
export function createOIDCMockSuite(): OIDCMockSuite {
  const client = createOIDCClientMocks();
  const session = createIronSessionMocks();
  const modules = createOIDCModuleMocks();

  let defaultTokenResponse = createMockTokenResponse();
  let defaultClaims = createMockIDTokenClaims();

  const helpers = {
    resetAllMocks: () => {
      vi.clearAllMocks();

      // Reset to defaults
      client.authorizationCodeGrant.mockResolvedValue(defaultTokenResponse);
      client.getValidatedIdTokenClaims.mockReturnValue(defaultClaims);
    },
    setDefaultTokenResponse: (response: ReturnType<typeof createMockTokenResponse>) => {
      defaultTokenResponse = response;
      client.authorizationCodeGrant.mockResolvedValue(response);
    },
    setDefaultClaims: (claims: ReturnType<typeof createMockIDTokenClaims>) => {
      defaultClaims = claims;
      client.getValidatedIdTokenClaims.mockReturnValue(claims);
    },
  };

  return {
    client,
    session,
    modules,
    _helpers: helpers,
  };
}

/**
 * Vi.mock factory for openid-client module
 */
export function createOpenIDClientModuleMock() {
  const mocks = createOIDCClientMocks();

  return () => ({
    discovery: mocks.discovery,
    randomPKCECodeVerifier: mocks.randomPKCECodeVerifier,
    calculatePKCECodeChallenge: mocks.calculatePKCECodeChallenge,
    randomState: mocks.randomState,
    randomNonce: mocks.randomNonce,
    authorizationCodeGrant: mocks.authorizationCodeGrant,
    getValidatedIdTokenClaims: mocks.getValidatedIdTokenClaims,
  });
}

/**
 * Vi.mock factory for iron-session module
 */
export function createIronSessionModuleMock() {
  const mocks = createIronSessionMocks();

  return () => ({
    sealData: mocks.sealData,
    unsealData: mocks.unsealData,
  });
}

/**
 * Vi.mock factory for OIDC config module
 */
export function createOIDCConfigModuleMock() {
  const mocks = createOIDCModuleMocks();

  return () => ({
    buildOIDCConfig: mocks.buildOIDCConfig,
    checkOIDCEnabled: mocks.checkOIDCEnabled,
  });
}
