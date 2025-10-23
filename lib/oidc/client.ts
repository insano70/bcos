/**
 * OIDC Client Implementation
 *
 * OpenID Connect client with security enhancements:
 * - Singleton pattern for client instance (resource efficiency)
 * - Discovery document cached per container lifecycle (eliminates 200ms network call)
 * - Explicit ID token validation (defense-in-depth)
 * - PKCE support (code_challenge/code_verifier)
 * - Nonce validation
 * - State validation
 *
 * Uses openid-client v6.8.1 API
 *
 * @module lib/oidc/client
 */

import * as oauth from 'openid-client';
import { log } from '@/lib/logger';
import { buildOIDCConfig } from './config';
import { DiscoveryError, TokenExchangeError, TokenValidationError } from './errors';
import type { OIDCAuthorizationResult, OIDCConfig, OIDCUserInfo } from './types';

/**
 * OIDC Configuration Caching Strategy
 *
 * The oauth.Configuration instance IS cached via the singleton pattern (see getOIDCClient below).
 *
 * In ECS Fargate (long-running containers):
 * - Discovery happens once per container lifecycle (~200ms first request)
 * - All subsequent OIDC requests use the cached configuration (0ms overhead)
 * - Containers typically run for hours/days, amortizing the discovery cost across thousands of requests
 *
 * In serverless environments (Lambda/Vercel):
 * - Each cold start would trigger discovery (~200ms per cold start)
 * - This is acceptable because:
 *   1. Discovery documents are public, cryptographically validated data
 *   2. Microsoft's discovery endpoint is highly available (<10ms p99)
 *   3. Configuration class instances cannot be serialized to external cache stores
 *   4. Warm starts still benefit from the singleton
 *
 * In development with hot reloads:
 * - Singleton is cleared on code changes
 * - Fresh discovery ensures configuration stays in sync with code
 */

/**
 * OIDC Client Class
 *
 * Manages OpenID Connect authentication flow with Microsoft Entra ID.
 */
export class OIDCClient {
  private config: OIDCConfig | null = null;
  private oauthConfig: oauth.Configuration | null = null;

  /**
   * Initialize Client
   *
   * Discovers OIDC configuration from Microsoft Entra ID.
   * This method is only called once per container lifecycle via the singleton pattern.
   *
   * @throws DiscoveryError if discovery fails
   */
  async initialize(): Promise<void> {
    this.config = buildOIDCConfig();

    // Perform discovery (cached at singleton level, not per-call level)
    log.debug('Fetching OIDC discovery document', {
      tenantId: this.config.tenantId,
    });

    try {
      const issuerUrl = new URL(`https://login.microsoftonline.com/${this.config.tenantId}/v2.0`);

      // Discover OIDC configuration from well-known endpoint
      this.oauthConfig = await oauth.discovery(
        issuerUrl,
        this.config.clientId,
        this.config.clientSecret
      );

      log.debug('OIDC configuration discovered successfully', {
        issuer: issuerUrl.href,
      });
    } catch (error) {
      log.error('Failed to discover OIDC configuration', error, {
        tenantId: this.config.tenantId,
      });
      throw new DiscoveryError('OIDC discovery failed', {
        tenantId: this.config.tenantId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Create Authorization URL
   *
   * Generates authorization URL with PKCE, state, and nonce.
   * Returns the URL and associated cryptographic parameters.
   *
   * @returns Authorization URL and parameters (state, codeVerifier, nonce)
   */
  async createAuthUrl(): Promise<OIDCAuthorizationResult> {
    if (!this.oauthConfig || !this.config) {
      await this.initialize();
    }

    // After initialization, config and oauthConfig are guaranteed to be set
    if (!this.config || !this.oauthConfig) {
      throw new Error('OIDC client not properly initialized');
    }

    // Generate PKCE parameters
    const codeVerifier = oauth.randomPKCECodeVerifier();
    const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
    const state = oauth.randomState();
    const nonce = oauth.randomNonce();

    // Build authorization URL manually (v6 doesn't have helper for this)
    const metadata = this.oauthConfig.serverMetadata();
    if (!metadata.authorization_endpoint) {
      throw new Error('Authorization endpoint not found in OIDC configuration');
    }

    const authUrl = new URL(metadata.authorization_endpoint);

    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', this.config.scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    log.debug('Authorization URL created', {
      state: `${state.substring(0, 8)}...`,
      nonce: `${nonce.substring(0, 8)}...`,
      scopes: this.config.scopes,
    });

    return {
      url: authUrl.href,
      state,
      codeVerifier,
      nonce,
    };
  }

  /**
   * Handle Callback
   *
   * Exchanges authorization code for tokens and validates ID token.
   * Implements explicit defense-in-depth validation on top of library validation.
   *
   * @param callbackUrl - Full callback URL from the request (must include code and state params)
   * @param expectedState - Expected state value for CSRF protection
   * @param expectedNonce - Expected nonce value for ID token validation
   * @param codeVerifier - PKCE code verifier
   * @returns User information extracted from validated ID token
   * @throws TokenExchangeError if code exchange fails
   * @throws TokenValidationError if token validation fails
   */
  async handleCallback(
    callbackUrl: URL,
    expectedState: string,
    expectedNonce: string,
    codeVerifier: string
  ): Promise<OIDCUserInfo> {
    if (!this.oauthConfig || !this.config) {
      await this.initialize();
    }

    // After initialization, config and oauthConfig are guaranteed to be set
    if (!this.config || !this.oauthConfig) {
      throw new Error('OIDC client not properly initialized');
    }

    // Check for provider errors in URL params
    const errorParam = callbackUrl.searchParams.get('error');
    if (errorParam) {
      const errorDescription = callbackUrl.searchParams.get('error_description');
      log.error('OIDC provider error', {
        error: errorParam,
        errorDescription,
      });
      throw new TokenExchangeError('Identity provider returned an error', {
        error: errorParam,
        description: errorDescription || undefined,
      });
    }

    // Exchange code for tokens (library validates JWT signature, exp, etc.)
    let tokenSet: oauth.TokenEndpointResponse & oauth.TokenEndpointResponseHelpers;
    try {
      // Construct corrected callback URL using configured redirect_uri
      // This is needed because Next.js behind a load balancer sees internal hostnames
      // but Microsoft validates against the public redirect_uri we registered
      const correctedCallbackUrl = new URL(this.config.redirectUri);
      // Preserve query parameters (code, state, session_state) from actual callback
      callbackUrl.searchParams.forEach((value, key) => {
        correctedCallbackUrl.searchParams.set(key, value);
      });

      // Perform authorization code grant with PKCE
      tokenSet = await oauth.authorizationCodeGrant(this.oauthConfig, correctedCallbackUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedState,
        expectedNonce,
      });

      log.debug('Token exchange successful', {
        hasAccessToken: !!tokenSet.access_token,
        hasIdToken: !!tokenSet.id_token,
        hasRefreshToken: !!tokenSet.refresh_token,
      });
    } catch (error) {
      // Log token exchange error for debugging
      log.error('oidc token exchange error', error, {
        errorType: error?.constructor?.name,
        component: 'oidc',
        operation: 'exchange_authorization_code',
      });

      // Serialize error details for logging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error?.constructor?.name || 'Unknown';
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Extract additional properties from the error object
      const errorProps: Record<string, unknown> = {};
      if (error && typeof error === 'object') {
        for (const [key, value] of Object.entries(error)) {
          if (key !== 'stack' && key !== 'message' && key !== 'name') {
            errorProps[key] = value;
          }
        }
      }

      log.error('Token exchange failed', {
        message: errorMessage,
        errorType: errorName,
        errorProperties: errorProps,
        stack: errorStack,
      });

      throw new TokenExchangeError('OIDC token exchange failed', {
        error: errorMessage,
        type: errorName,
        details: errorProps,
      });
    }

    // Get ID token claims (library has already validated signature, exp, etc.)
    const claims = tokenSet.claims();

    if (!claims) {
      log.error('No ID token claims returned from token exchange');
      throw new TokenValidationError('No ID token claims in response');
    }

    // ===== Explicit Validation (Defense in Depth) =====

    // 1. Email claim required
    if (!claims.email || typeof claims.email !== 'string') {
      log.error('ID token missing email claim', {
        claims: Object.keys(claims),
      });
      throw new TokenValidationError('ID token missing required email claim');
    }

    // 2. Email domain verification
    // Microsoft Entra ID uses xms_edov (Email Domain Owner Verified) instead of email_verified.
    // This claim indicates the email domain has been verified by the tenant administrator.
    // Standard OIDC providers use email_verified. We check both for compatibility.
    const isEmailVerified = claims.email_verified === true || claims.xms_edov === true;

    if (!isEmailVerified) {
      log.warn('Email domain not verified by identity provider', {
        email: claims.email.replace(/(.{2}).*@/, '$1***@'),
        hasEmailVerified: claims.email_verified === true,
        hasXmsEdov: claims.xms_edov === true,
        issuer: claims.iss,
      });
      throw new TokenValidationError('Email domain not verified by identity provider', {
        email: claims.email.replace(/(.{2}).*@/, '$1***@'),
      });
    }

    // 3. Nonce validation (verify library check)
    if (claims.nonce !== expectedNonce) {
      log.error('Nonce mismatch in ID token', {
        expected: expectedNonce.substring(0, 8),
        received: claims.nonce ? String(claims.nonce).substring(0, 8) : 'none',
      });
      throw new TokenValidationError('ID token nonce validation failed');
    }

    // 4. Issuer validation (verify library check)
    const expectedIssuer = `https://login.microsoftonline.com/${this.config.tenantId}/v2.0`;
    if (claims.iss !== expectedIssuer) {
      log.error('Issuer mismatch in ID token', {
        expected: expectedIssuer,
        received: claims.iss,
      });
      throw new TokenValidationError('ID token issuer validation failed', {
        expected: expectedIssuer,
        received: claims.iss,
      });
    }

    // 5. Audience validation (verify library check)
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(this.config.clientId)) {
      log.error('Audience mismatch in ID token', {
        expected: this.config.clientId,
        received: aud,
      });
      throw new TokenValidationError('ID token audience validation failed', {
        expected: this.config.clientId,
        received: aud,
      });
    }

    // 6. Check token age (issued_at time)
    const now = Math.floor(Date.now() / 1000);
    const iat = claims.iat || 0;
    const tokenAge = now - iat;

    if (tokenAge < 0) {
      log.error('ID token issued in the future', {
        iat,
        now,
      });
      throw new TokenValidationError('ID token timestamp invalid');
    }

    if (tokenAge > 300) {
      // 5 minutes
      log.warn('ID token is stale', {
        tokenAge,
        iat: new Date(iat * 1000).toISOString(),
      });
      // Warning only - might be legitimate if clock skew or slow network
    }

    // 7. Check expiration (verify library check)
    const exp = claims.exp || 0;
    if (now >= exp) {
      log.error('ID token expired', {
        exp: new Date(exp * 1000).toISOString(),
        now: new Date(now * 1000).toISOString(),
      });
      throw new TokenValidationError('ID token has expired');
    }

    log.info('ID token validation successful', {
      email: claims.email.replace(/(.{2}).*@/, '$1***@'),
      iat: new Date(iat * 1000).toISOString(),
      exp: new Date(exp * 1000).toISOString(),
      tokenAge,
    });

    // Extract user info
    return {
      email: claims.email as string,
      emailVerified: claims.email_verified as boolean,
      name: claims.name ? (claims.name as string) : undefined,
      givenName: claims.given_name ? (claims.given_name as string) : undefined,
      familyName: claims.family_name ? (claims.family_name as string) : undefined,
      claims,
    };
  }
}

// ===== Singleton Pattern for Client Instance =====

let clientInstance: OIDCClient | null = null;
let clientInitializing: Promise<OIDCClient> | null = null;

/**
 * Get Singleton OIDC Client Instance
 *
 * Thread-safe initialization with promise caching.
 * Ensures only one client instance exists and prevents duplicate initialization.
 *
 * @returns Initialized OIDC client instance
 */
export async function getOIDCClient(): Promise<OIDCClient> {
  // Return existing instance
  if (clientInstance) {
    return clientInstance;
  }

  // Wait for ongoing initialization
  if (clientInitializing) {
    return clientInitializing;
  }

  // Initialize new instance
  clientInitializing = (async () => {
    const client = new OIDCClient();
    await client.initialize();
    clientInstance = client;
    clientInitializing = null;
    return client;
  })();

  return clientInitializing;
}

/**
 * Reset Client Instance
 *
 * Resets the singleton instance and clears cache.
 * Use for testing or when configuration changes.
 */
export function resetOIDCClient(): void {
  clientInstance = null;
  clientInitializing = null;
  log.info('OIDC client instance reset');
}
