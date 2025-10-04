/**
 * OIDC Type Definitions
 *
 * Type definitions for OpenID Connect authentication flow.
 * These types ensure type safety throughout the OIDC implementation.
 */

import type * as oauth from 'openid-client';

/**
 * OIDC Configuration Interface
 *
 * Contains all configuration needed for OIDC authentication with Microsoft Entra ID.
 * Configuration is built from environment variables and discovery metadata.
 */
export interface OIDCConfig {
  // Microsoft Entra Tenant
  readonly tenantId: string;

  // Client credentials
  readonly clientId: string;
  readonly clientSecret: string;

  // Redirect configuration
  readonly redirectUri: string;

  // Application settings
  readonly scopes: readonly string[];
  readonly allowedEmailDomains: readonly string[];
  readonly successRedirect: string;
}

/**
 * OIDC Session Data
 *
 * Data stored in encrypted session cookie during OIDC flow.
 * This data is encrypted with iron-session to protect the PKCE code_verifier.
 */
export interface OIDCSessionData {
  readonly state: string;
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly returnUrl: string;
  readonly fingerprint: string;
  readonly timestamp: number;
}

/**
 * OIDC User Info
 *
 * User information extracted from validated ID token claims.
 */
export interface OIDCUserInfo {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string | undefined;
  readonly givenName: string | undefined;
  readonly familyName: string | undefined;
  readonly claims: oauth.IDToken;
}

/**
 * OIDC Authorization URL Result
 *
 * Contains the authorization URL and associated cryptographic parameters.
 */
export interface OIDCAuthorizationResult {
  readonly url: string;
  readonly state: string;
  readonly codeVerifier: string;
  readonly nonce: string;
}

/**
 * OIDC Callback Parameters
 *
 * Parameters received from the identity provider during callback.
 */
export interface OIDCCallbackParams {
  readonly code: string;
  readonly state: string;
  readonly error?: string;
  readonly error_description?: string;
}

/**
 * State Manager Data
 *
 * Internal state tracking for one-time use validation.
 */
export interface StateData {
  readonly timestamp: number;
  used: boolean;
}

/**
 * Extended ID Token Claims
 *
 * Extends the openid-client IDToken type to include Microsoft Entra ID specific claims.
 * Microsoft Entra ID uses xms_edov (Email Domain Owner Verified) instead of the standard
 * email_verified claim. This indicates the email domain has been verified by the tenant admin.
 */
declare module 'openid-client' {
  interface IDToken {
    xms_edov?: boolean; // Email Domain Owner Verified (Microsoft Entra ID)
  }
}
