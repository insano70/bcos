/**
 * OIDC Test Factory
 *
 * Factory functions for creating OIDC test data that follows existing patterns.
 * Provides consistent, realistic test data for OIDC authentication flows.
 */

import { nanoid } from 'nanoid';
import type * as oauth from 'openid-client';
import type { OIDCSessionData, OIDCUserInfo } from '@/lib/oidc/types';

/**
 * Create mock OIDC session data
 * Used for testing encrypted session storage during OIDC flow
 */
export function createMockOIDCSession(overrides?: Partial<OIDCSessionData>): OIDCSessionData {
  return {
    state: nanoid(32),
    codeVerifier: nanoid(43), // Base64URL(32 bytes) = 43 characters
    nonce: nanoid(32),
    returnUrl: '/dashboard',
    fingerprint: nanoid(64), // SHA-256 hash length
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Create mock ID token claims
 * Mimics Microsoft Entra ID token structure with all required claims
 */
export function createMockIDTokenClaims(overrides?: Partial<oauth.IDToken>): oauth.IDToken {
  const now = Math.floor(Date.now() / 1000);

  return {
    email: 'test@test.com',
    email_verified: true,
    xms_edov: true, // Microsoft Entra Email Domain Owner Verified
    nonce: nanoid(32),
    iss: 'https://login.microsoftonline.com/test-tenant-id/v2.0',
    aud: 'test-client-id',
    sub: 'test-user-subject-id',
    iat: now,
    exp: now + 3600,
    name: 'Test User',
    given_name: 'Test',
    family_name: 'User',
    tid: 'test-tenant-id',
    ...overrides,
  } as oauth.IDToken;
}

/**
 * Create mock OIDC user info
 * User information extracted from validated ID token
 */
export function createMockOIDCUserInfo(overrides?: Partial<OIDCUserInfo>): OIDCUserInfo {
  const claims = createMockIDTokenClaims();

  return {
    email: 'test@test.com',
    emailVerified: true,
    name: 'Test User',
    givenName: 'Test',
    familyName: 'User',
    claims,
    ...overrides,
  };
}

/**
 * Create mock authorization code grant response
 * Mimics openid-client token response
 */
export function createMockTokenResponse(overrides?: {
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  claims?: Partial<oauth.IDToken>;
}) {
  const claims = createMockIDTokenClaims(overrides?.claims);

  return {
    access_token: overrides?.accessToken || 'mock-access-token',
    id_token: overrides?.idToken || 'mock-id-token',
    refresh_token: overrides?.refreshToken || 'mock-refresh-token',
    token_type: 'Bearer',
    expires_in: 3600,
    claims: () => claims,
  };
}

/**
 * Create mock OIDC configuration
 * Server metadata from discovery endpoint
 */
export function createMockServerMetadata(overrides?: {
  tenantId?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  issuer?: string;
}) {
  const tenantId = overrides?.tenantId || 'test-tenant-id';

  return {
    authorization_endpoint:
      overrides?.authorizationEndpoint ||
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    token_endpoint:
      overrides?.tokenEndpoint || `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    issuer: overrides?.issuer || `https://login.microsoftonline.com/${tenantId}/v2.0`,
    jwks_uri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
    userinfo_endpoint: `https://graph.microsoft.com/oidc/userinfo`,
  };
}

/**
 * Create mock OIDC discovery configuration
 * Full Configuration object from openid-client
 */
export function createMockOIDCConfiguration(overrides?: {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}) {
  const tenantId = overrides?.tenantId || 'test-tenant-id';
  const metadata = createMockServerMetadata({ tenantId });

  return {
    serverMetadata: () => metadata,
    clientId: overrides?.clientId || 'test-client-id',
    clientSecret: overrides?.clientSecret || 'test-client-secret',
  };
}
