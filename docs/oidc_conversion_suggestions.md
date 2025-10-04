OIDC Conversion - Technical Review & Recommendations
Document Version: 1.1
Review Date: 2025-10-03
Reviewer: Technical Architecture Review
Status: Recommendations for Implementation

Executive Summary
This document provides technical recommendations for the OIDC conversion design (v1.0). The overall design is architecturally sound and demonstrates good understanding of OIDC protocols. However, several critical security vulnerabilities must be addressed before implementation, and important architectural improvements should be incorporated during Phase 1.
Critical Issues Found: 4 (must fix before deployment)
Important Improvements: 4 (incorporate in Phase 1)
Nice-to-Have Enhancements: 7 (consider for Phase 2)
Revised Effort Estimate: +12-16 hours for critical security fixes

Critical Security Issues (Must Fix)
1. OIDC Session Cookie Encryption
Severity: HIGH - Security Vulnerability
Current Issue: The OIDC session cookie stores the PKCE codeVerifier in plaintext JSON:
typescript// Current implementation (INSECURE)
const sessionData = JSON.stringify({ state, codeVerifier, nonce, returnUrl });
cookieStore.set('oidc-session', sessionData, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 10,
  path: '/',
});
Problem: The codeVerifier is a cryptographic secret that proves possession of the authorization code in PKCE flow. Storing it unencrypted in a cookie (even with httpOnly) exposes it to potential XSS or cookie theft attacks.
Solution: Encrypt the session data using iron-session or similar:
typescriptimport { sealData, unsealData } from 'iron-session';

// app/api/auth/oidc/login/route.ts
const oidcLoginHandler = async (request: NextRequest) => {
  const returnUrl = request.nextUrl.searchParams.get('returnUrl') || '/dashboard';
  
  const oidcClient = new OIDCClient();
  const { url, state, codeVerifier, nonce } = await oidcClient.createAuthUrl(returnUrl);

  // Encrypt session data before storing
  const sealed = await sealData(
    { state, codeVerifier, nonce, returnUrl },
    {
      password: process.env.OIDC_SESSION_SECRET!, // 32+ character secret
      ttl: 60 * 10, // 10 minutes
    }
  );

  const cookieStore = await cookies();
  cookieStore.set('oidc-session', sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });

  return NextResponse.redirect(url);
};

// app/api/auth/oidc/callback/route.ts
const oidcCallbackHandler = async (request: NextRequest) => {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('oidc-session');
  
  if (!sessionCookie) {
    log.error('OIDC session cookie not found');
    return NextResponse.redirect(
      new URL('/signin?error=session_expired', request.url)
    );
  }

  // Decrypt session data
  const sessionData = await unsealData<{
    state: string;
    codeVerifier: string;
    nonce: string;
    returnUrl: string;
  }>(sessionCookie.value, {
    password: process.env.OIDC_SESSION_SECRET!,
  });

  // Continue with existing logic...
};
Required Environment Variable:
bash# Add to environment variables section
OIDC_SESSION_SECRET=<32+ character random string>
Implementation Notes:

Use iron-session (already battle-tested) or Web Crypto API for encryption
Generate OIDC_SESSION_SECRET using openssl rand -base64 32
Rotate secret during security maintenance windows
Consider using same secret as CSRF_SECRET if appropriate


2. State Token Replay Prevention
Severity: HIGH - OIDC Specification Violation
Current Issue: State tokens can be reused within the 5-minute window:
typescript// Current validation (INSUFFICIENT)
if (Date.now() - state.timestamp > 5 * 60 * 1000) return false;
Problem: OIDC specification requires state parameters to be single-use to prevent replay attacks. The current implementation allows the same state to be used multiple times within 5 minutes.
Solution: Implement one-time use state tokens with in-memory tracking:
typescript// lib/oidc/state-manager.ts
interface StateData {
  timestamp: number;
  used: boolean;
}

class StateManager {
  private states = new Map<string, StateData>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired states every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [state, data] of this.states.entries()) {
        if (now - data.timestamp > 10 * 60 * 1000) { // 10 minutes
          this.states.delete(state);
        }
      }
    }, 60 * 1000);
  }

  registerState(state: string): void {
    this.states.set(state, {
      timestamp: Date.now(),
      used: false,
    });
  }

  validateAndMarkUsed(state: string): boolean {
    const data = this.states.get(state);
    
    if (!data) {
      log.warn('State token not found or expired', { state: state.substring(0, 8) });
      return false;
    }

    if (data.used) {
      log.error('State token replay attempt detected', { 
        state: state.substring(0, 8),
        originalTimestamp: data.timestamp 
      });
      return false;
    }

    // Check age (5 minutes + 30s clock skew)
    const age = Date.now() - data.timestamp;
    if (age > 5 * 60 * 1000 + 30 * 1000) {
      log.warn('State token expired', { state: state.substring(0, 8), age });
      this.states.delete(state);
      return false;
    }

    // Mark as used
    data.used = true;
    
    // Schedule cleanup after 10 minutes
    setTimeout(() => this.states.delete(state), 10 * 60 * 1000);

    return true;
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.states.clear();
  }
}

// Singleton instance
export const stateManager = new StateManager();

// Usage in login route
const { url, state, codeVerifier, nonce } = await oidcClient.createAuthUrl(returnUrl);
stateManager.registerState(state);

// Usage in callback route
if (!stateManager.validateAndMarkUsed(state)) {
  log.error('Invalid or reused state token');
  return NextResponse.redirect(
    new URL('/signin?error=invalid_state', request.url)
  );
}
Alternative for Distributed Systems: If running multiple Node.js instances, use Redis:
typescript// lib/oidc/state-manager-redis.ts
import { redis } from '@/lib/redis';

export async function registerState(state: string): Promise<void> {
  await redis.setex(`oidc:state:${state}`, 600, 'pending'); // 10 minutes TTL
}

export async function validateAndMarkUsed(state: string): Promise<boolean> {
  const key = `oidc:state:${state}`;
  const value = await redis.get(key);
  
  if (!value) {
    log.warn('State token not found or expired');
    return false;
  }
  
  if (value === 'used') {
    log.error('State token replay attempt detected');
    return false;
  }
  
  // Mark as used (atomic operation)
  const result = await redis.set(key, 'used', 'EX', 600, 'XX');
  return result === 'OK';
}

3. Session Fingerprint Binding
Severity: MEDIUM-HIGH - Session Hijacking Prevention
Current Issue: No binding between OIDC session and device fingerprint
Problem: If an attacker steals the oidc-session cookie (even encrypted), they can complete the authentication flow from their own device.
Solution: Bind session to device fingerprint:
typescript// app/api/auth/oidc/login/route.ts
const oidcLoginHandler = async (request: NextRequest) => {
  const returnUrl = request.nextUrl.searchParams.get('returnUrl') || '/dashboard';
  
  // Generate device fingerprint
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const fingerprint = generateDeviceFingerprint(ipAddress, userAgent);
  
  const oidcClient = new OIDCClient();
  const { url, state, codeVerifier, nonce } = await oidcClient.createAuthUrl(returnUrl);

  // Include fingerprint in session data
  const sealed = await sealData(
    { 
      state, 
      codeVerifier, 
      nonce, 
      returnUrl,
      fingerprint // Add fingerprint binding
    },
    { password: process.env.OIDC_SESSION_SECRET!, ttl: 60 * 10 }
  );

  // ... rest of implementation
};

// app/api/auth/oidc/callback/route.ts
const oidcCallbackHandler = async (request: NextRequest) => {
  // ... decrypt session data
  
  // Validate fingerprint matches
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const currentFingerprint = generateDeviceFingerprint(ipAddress, userAgent);
  
  if (sessionData.fingerprint !== currentFingerprint) {
    log.error('OIDC session fingerprint mismatch', {
      expected: sessionData.fingerprint.substring(0, 16),
      received: currentFingerprint.substring(0, 16),
      ipAddress,
    });
    
    await AuditLogger.logAuth({
      action: 'oidc_session_hijack_attempt',
      ipAddress,
      userAgent,
      metadata: {
        reason: 'fingerprint_mismatch',
      },
    });
    
    return NextResponse.redirect(
      new URL('/signin?error=session_hijack', request.url)
    );
  }
  
  // Continue with existing validation...
};
Note: This is a defense-in-depth measure. IP addresses can change (mobile networks, VPNs), so log warnings but consider making this configurable:
typescriptconst STRICT_FINGERPRINT_VALIDATION = process.env.OIDC_STRICT_FINGERPRINT === 'true';

if (sessionData.fingerprint !== currentFingerprint) {
  if (STRICT_FINGERPRINT_VALIDATION) {
    // Reject
    return NextResponse.redirect(...);
  } else {
    // Log warning and allow
    log.warn('OIDC session fingerprint changed', { ... });
  }
}

4. Explicit ID Token Validation
Severity: MEDIUM - Defense in Depth
Current Issue: Complete reliance on library validation without explicit checks
Problem: While openid-client is reliable, defense-in-depth principles require explicit validation of critical claims.
Solution: Add explicit validation layer:
typescript// lib/oidc/client.ts
import { TokenSet } from 'openid-client';

export class OIDCClient {
  // ... existing methods

  /**
   * Handle callback and validate tokens with explicit checks
   */
  async handleCallback(
    params: { code: string; state: string },
    expectedState: string,
    expectedNonce: string,
    codeVerifier: string
  ): Promise<{
    email: string;
    emailVerified: boolean;
    name?: string;
    givenName?: string;
    familyName?: string;
    claims: Record<string, unknown>;
  }> {
    if (!this.client) await this.initialize();

    // Exchange code for tokens (library validates JWT signature, exp, etc.)
    let tokenSet: TokenSet;
    try {
      tokenSet = await this.client!.callback(
        this.config!.redirectUri,
        params,
        {
          code_verifier: codeVerifier,
          state: expectedState,
          nonce: expectedNonce,
        }
      );
    } catch (error) {
      log.error('Token exchange failed', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw new Error('OIDC token exchange failed');
    }

    const claims = tokenSet.claims();

    // ===== Explicit Validation (Defense in Depth) =====

    // 1. Email claim required
    if (!claims.email || typeof claims.email !== 'string') {
      log.error('ID token missing email claim', { claims: Object.keys(claims) });
      throw new Error('ID token missing required email claim');
    }

    // 2. Email verification required
    if (!claims.email_verified) {
      log.warn('Email not verified by IDP', { 
        email: claims.email.replace(/(.{2}).*@/, '$1***@') 
      });
      throw new Error('Email not verified by identity provider');
    }

    // 3. Nonce validation (should be done by library, but verify)
    if (claims.nonce !== expectedNonce) {
      log.error('Nonce mismatch in ID token', {
        expected: expectedNonce.substring(0, 8),
        received: claims.nonce ? String(claims.nonce).substring(0, 8) : 'none',
      });
      throw new Error('ID token nonce validation failed');
    }

    // 4. Issuer validation (should be done by library, but verify)
    const expectedIssuer = `https://login.microsoftonline.com/${this.config!.tenantId}/v2.0`;
    if (claims.iss !== expectedIssuer) {
      log.error('Issuer mismatch in ID token', {
        expected: expectedIssuer,
        received: claims.iss,
      });
      throw new Error('ID token issuer validation failed');
    }

    // 5. Audience validation (should be done by library, but verify)
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(this.config!.clientId)) {
      log.error('Audience mismatch in ID token', {
        expected: this.config!.clientId,
        received: aud,
      });
      throw new Error('ID token audience validation failed');
    }

    // 6. Check token age (issued_at time)
    const now = Math.floor(Date.now() / 1000);
    const iat = claims.iat || 0;
    const tokenAge = now - iat;
    
    if (tokenAge < 0) {
      log.error('ID token issued in the future', { iat, now });
      throw new Error('ID token timestamp invalid');
    }
    
    if (tokenAge > 300) { // 5 minutes
      log.warn('ID token is stale', { 
        tokenAge,
        iat: new Date(iat * 1000).toISOString(),
      });
      // Warning only - might be legitimate if clock skew or slow network
    }

    // 7. Check expiration (should be done by library, but verify)
    const exp = claims.exp || 0;
    if (now >= exp) {
      log.error('ID token expired', {
        exp: new Date(exp * 1000).toISOString(),
        now: new Date(now * 1000).toISOString(),
      });
      throw new Error('ID token has expired');
    }

    log.info('ID token validation successful', {
      email: claims.email.replace(/(.{2}).*@/, '$1***@'),
      iat: new Date(iat * 1000).toISOString(),
      exp: new Date(exp * 1000).toISOString(),
      tokenAge,
    });

    return {
      email: claims.email as string,
      emailVerified: claims.email_verified as boolean,
      name: claims.name as string | undefined,
      givenName: claims.given_name as string | undefined,
      familyName: claims.family_name as string | undefined,
      claims: claims as Record<string, unknown>,
    };
  }
}
Benefits:

Catches library bugs or misconfiguration
Provides detailed error logging for debugging
Documents expected claims explicitly
Adds audit trail for compliance


Important Architecture Improvements (Phase 1)
5. Discovery Document Caching
Severity: MEDIUM - Performance Optimization
Current Issue: Discovery document fetched on every OIDCClient.initialize() call
Problem: Adds 100-300ms latency and creates unnecessary dependency on Microsoft Entra during every authentication flow.
Solution: Cache the OIDC issuer with appropriate TTL:
typescript// lib/oidc/client.ts
import { Issuer } from 'openid-client';

// Module-level cache
let cachedIssuer: Issuer | null = null;
let issuerCachedAt = 0;
const ISSUER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export class OIDCClient {
  private client: Client | null = null;
  private config: OIDCConfig | null = null;

  async initialize(): Promise<void> {
    this.config = await buildOIDCConfig();
    
    const now = Date.now();
    const cacheAge = now - issuerCachedAt;

    // Use cached issuer if valid
    if (cachedIssuer && cacheAge < ISSUER_CACHE_TTL) {
      log.debug('Using cached OIDC issuer', { cacheAge: Math.floor(cacheAge / 1000) });
      this.client = new cachedIssuer.Client({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uris: [this.config.redirectUri],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_post',
      });
      return;
    }

    // Fetch and cache new issuer
    log.info('Fetching OIDC discovery document', {
      tenantId: this.config.tenantId,
    });

    try {
      const issuer = await Issuer.discover(
        `https://login.microsoftonline.com/${this.config.tenantId}/v2.0`
      );

      cachedIssuer = issuer;
      issuerCachedAt = now;

      this.client = new issuer.Client({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uris: [this.config.redirectUri],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_post',
      });

      log.info('OIDC issuer cached successfully', {
        issuer: issuer.issuer,
        endpoints: {
          authorization: issuer.metadata.authorization_endpoint,
          token: issuer.metadata.token_endpoint,
          jwks: issuer.metadata.jwks_uri,
        },
      });
    } catch (error) {
      log.error('Failed to discover OIDC issuer', {
        error: error instanceof Error ? error.message : 'Unknown',
        tenantId: this.config.tenantId,
      });
      throw new Error('OIDC issuer discovery failed');
    }
  }

  /**
   * Force refresh of cached issuer (for maintenance)
   */
  static clearCache(): void {
    cachedIssuer = null;
    issuerCachedAt = 0;
    log.info('OIDC issuer cache cleared');
  }
}
Benefits:

Reduces login latency by ~200ms
Reduces external dependencies during authentication
Still refreshes daily to catch endpoint changes

Monitoring: Add cache hit rate metric to track effectiveness.

6. Client Singleton Pattern
Severity: LOW-MEDIUM - Code Quality & Performance
Current Issue: New OIDCClient instance created per request
Solution: Implement singleton pattern:
typescript// lib/oidc/client.ts

let clientInstance: OIDCClient | null = null;
let clientInitializing: Promise<OIDCClient> | null = null;

/**
 * Get singleton OIDC client instance
 * Thread-safe initialization with promise caching
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
 * Reset client instance (for testing or configuration changes)
 */
export function resetOIDCClient(): void {
  clientInstance = null;
  clientInitializing = null;
  OIDCClient.clearCache();
}

// Usage in routes
const oidcClient = await getOIDCClient();
const { url, state, codeVerifier, nonce } = await oidcClient.createAuthUrl(returnUrl);
Update All Routes:
typescript// app/api/auth/oidc/login/route.ts
import { getOIDCClient } from '@/lib/oidc/client';

const oidcLoginHandler = async (request: NextRequest) => {
  const oidcClient = await getOIDCClient(); // Use singleton
  // ... rest of implementation
};

// app/api/auth/oidc/callback/route.ts
import { getOIDCClient } from '@/lib/oidc/client';

const oidcCallbackHandler = async (request: NextRequest) => {
  const oidcClient = await getOIDCClient(); // Use singleton
  // ... rest of implementation
};

7. OIDC Logout Implementation
Severity: MEDIUM - Feature Completeness
Current Issue: No RP-initiated logout endpoint
Problem: Users logging out locally remain authenticated at Microsoft Entra, allowing immediate re-login without credentials.
Solution: Implement OIDC logout flow:
typescript// app/api/auth/oidc/logout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { protectedRoute } from '@/lib/api/route-handler';
import { buildOIDCConfig } from '@/lib/oidc/config';
import { log } from '@/lib/logger';

const oidcLogoutHandler = async (request: NextRequest) => {
  try {
    const config = await buildOIDCConfig();
    
    // Build logout URL
    const logoutUrl = new URL(
      `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/logout`
    );
    
    // Add post-logout redirect
    logoutUrl.searchParams.set(
      'post_logout_redirect_uri',
      `${process.env.NEXT_PUBLIC_APP_URL}/signin?logout=success`
    );

    // Optional: Add id_token_hint if you store it temporarily
    // This helps the IDP identify which session to end
    // logoutUrl.searchParams.set('id_token_hint', idToken);

    log.info('Initiating OIDC logout');

    // Clear local session cookies
    const cookieStore = await cookies();
    cookieStore.delete('access-token');
    cookieStore.delete('refresh-token');
    cookieStore.delete('oidc-session');

    // Redirect to Entra logout
    return NextResponse.redirect(logoutUrl.toString());
  } catch (error) {
    log.error('OIDC logout failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    
    // Fallback to local logout
    return NextResponse.redirect(
      new URL('/signin?error=logout_failed', request.url)
    );
  }
};

export const GET = protectedRoute(
  oidcLogoutHandler,
  'OIDC logout',
  { skipPermissionCheck: true } // Anyone can logout
);

export const POST = GET; // Support both GET and POST
Update Logout Button:
typescript// components/logout-button.tsx
async function handleLogout() {
  // Call logout API
  const response = await fetch('/api/auth/oidc/logout', {
    method: 'POST',
    credentials: 'include',
  });
  
  if (response.redirected) {
    window.location.href = response.url;
  }
}
Configuration Update:
Add post-logout redirect URI to Entra app registration:

Azure Portal → App Registrations → Your App → Authentication
Add: https://app.bendcare.com/signin (all environments)

Note: This provides full logout. For partial logout (keep Entra session but clear app session), just delete cookies without redirecting to Entra.

8. Specific Error Handling
Severity: LOW-MEDIUM - Developer Experience
Current Issue: Generic catch-all error handling makes debugging difficult
Solution: Handle specific error types:
typescript// lib/oidc/errors.ts
export class OIDCError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OIDCError';
  }
}

export class TokenExchangeError extends OIDCError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'token_exchange_failed', details);
    this.name = 'TokenExchangeError';
  }
}

export class TokenValidationError extends OIDCError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'token_validation_failed', details);
    this.name = 'TokenValidationError';
  }
}

export class StateValidationError extends OIDCError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'state_validation_failed', details);
    this.name = 'StateValidationError';
  }
}

// app/api/auth/oidc/callback/route.ts
import {
  OIDCError,
  TokenExchangeError,
  TokenValidationError,
  StateValidationError,
} from '@/lib/oidc/errors';

const oidcCallbackHandler = async (request: NextRequest) => {
  try {
    // ... existing logic
  } catch (error) {
    // Handle specific error types
    if (error instanceof StateValidationError) {
      log.error('OIDC state validation failed', {
        error: error.message,
        details: error.details,
      });
      
      await AuditLogger.logAuth({
        action: 'oidc_state_validation_failed',
        metadata: {
          error: error.message,
          code: error.code,
        },
      });
      
      return NextResponse.redirect(
        new URL('/signin?error=invalid_state', request.url)
      );
    }

    if (error instanceof TokenExchangeError) {
      log.error('OIDC token exchange failed', {
        error: error.message,
        details: error.details,
      });
      
      return NextResponse.redirect(
        new URL('/signin?error=auth_code_invalid', request.url)
      );
    }

    if (error instanceof TokenValidationError) {
      log.error('OIDC token validation failed', {
        error: error.message,
        details: error.details,
      });
      
      return NextResponse.redirect(
        new URL('/signin?error=token_invalid', request.url)
      );
    }

    // Handle openid-client library errors
    if (error instanceof Error && error.name === 'RPError') {
      const rpError = error as any;
      log.error('OIDC RP error from provider', {
        error: rpError.error,
        errorDescription: rpError.error_description,
      });
      
      if (rpError.error === 'invalid_grant') {
        return NextResponse.redirect(
          new URL('/signin?error=auth_code_expired', request.url)
        );
      }
      
      if (rpError.error === 'invalid_client') {
        return NextResponse.redirect(
          new URL('/signin?error=client_config_error', request.url)
        );
      }
    }

    // Generic fallback
    log.error('Unexpected OIDC callback error', {
      error: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.redirect(
      new URL('/signin?error=oidc_callback_failed', request.url)
    );
  }
};

Additional Improvements (Consider for Phase 1-2)
9. Stronger TypeScript Types
Use more precise types throughout:
typescript// lib/oidc/config.ts
interface OIDCConfig {
  // Tenant configuration
  readonly tenantId: string;
  
  // Client credentials
  readonly clientId: string;
  readonly clientSecret: string;
  
  // Endpoint URLs (use URL type for validation)
  readonly issuer: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly jwksUri: string;
  readonly endSessionEndpoint: string;
  readonly userinfoEndpoint: string;
  
  // Redirect configuration
  readonly redirectUri: string;
  
  // Scopes (non-empty array, at least 'openid' required)
  readonly scopes: readonly [string, ...string[]];
  
  // Domain allowlist (immutable)
  readonly allowedEmailDomains: readonly string[];
  
  // Application settings
  readonly successRedirect: string;
}

// Validation function
export async function buildOIDCConfig(): Promise<OIDCConfig> {
  const tenantId = getRequiredEnv('ENTRA_TENANT_ID');
  const clientId = getRequiredEnv('ENTRA_CLIENT_ID');
  const clientSecret = getRequiredEnv('ENTRA_CLIENT_SECRET');
  
  // Validate redirect URI is valid URL
  const redirectUri = getRequiredEnv('OIDC_REDIRECT_URI');
  try {
    new URL(redirectUri); // Validates URL format
  } catch {
    throw new Error(`Invalid OIDC_REDIRECT_URI: ${redirectUri}`);
  }

  // Parse scopes (ensure 'openid' is included)
  const scopesStr = getEnv('OIDC_SCOPES', 'openid profile email');
  const scopes = scopesStr.split(' ').filter(Boolean);
  if (!scopes.includes('openid')) {
    scopes.unshift('openid'); // Ensure openid is first
  }

  // ... rest of implementation
  
  return Object.freeze({ // Make config immutable
    tenantId,
    clientId,
    clientSecret,
    issuer: discovery.issuer,
    authorizationEndpoint: discovery.authorization_endpoint,
    tokenEndpoint: discovery.token_endpoint,
    jwksUri: discovery.jwks_uri,
    endSessionEndpoint: discovery.end_session_endpoint,
    userinfoEndpoint: discovery.userinfo_endpoint,
    redirectUri,
    scopes: scopes as [string, ...string[]],
    allowedEmailDomains: Object.freeze(
      getEnv('OIDC_ALLOWED_DOMAINS', '').split(',').filter(Boolean)
    ),
    successRedirect: getEnv('OIDC_SUCCESS_REDIRECT', '/dashboard'),
  });
}

10. Standardized Error Response Format
Create consistent error responses:
typescript// lib/oidc/error-response.ts
interface AuthErrorDetails {
  code: string;
  message: string;
  timestamp: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

export function createAuthErrorRedirect(
  baseUrl: string,
  error: AuthErrorDetails
): NextResponse {
  // Encode error as base64url JSON
  const errorJson = JSON.stringify(error);
  const errorParam = Buffer.from(errorJson).toString('base64url');
  
  const url = new URL('/signin', baseUrl);
  url.searchParams.set('error', errorParam);
  
  return NextResponse.redirect(url);
}

export function parseAuthError(errorParam: string): AuthErrorDetails | null {
  try {
    const errorJson = Buffer.from(errorParam, 'base64url').toString('utf8');
    return JSON.parse(errorJson);
  } catch {
    return null;
  }
}

// Usage
return createAuthErrorRedirect(request.url, {
  code: 'invalid_state',
  message: 'Authentication state validation failed',
  timestamp: new Date().toISOString(),
  requestId: request.headers.get('x-correlation-id') || undefined,
});
Sign-in Page Error Display:
typescript// app/signin/page.tsx
export default function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const error = searchParams.error 
    ? parseAuthError(searchParams.error)
    : null;

  return (
    <div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Authentication Failed</AlertTitle>
          <AlertDescription>
            {error.message}
            {error.code && <div className="text-xs mt-1">Error code: {error.code}</div>}
          </AlertDescription>
        </Alert>
      )}
      {/* ... rest of sign-in form */}
    </div>
  );
}

11. Session Age-Based Re-authentication
Implement forced re-authentication for stale sessions:
typescript// lib/auth/token-manager.ts
export interface JWTPayload {
  user_id: string;
  email: string;
  iat: number;
  exp: number;
  auth_time?: number; // Time of original authentication
  auth_method?: 'password' | 'oidc' | 'saml';
}

// When creating tokens after OIDC auth
export async function createTokenPair(
  userId: string,
  deviceInfo: DeviceInfo,
  rememberMe: boolean,
  email: string,
  authTime?: number // Pass ID token's auth_time or current time
): Promise<TokenPair> {
  const now = Math.floor(Date.now() / 1000);
  
  // ... existing token creation logic
  
  const accessTokenPayload: JWTPayload = {
    user_id: userId,
    email,
    iat: now,
    exp: now + 15 * 60,
    auth_time: authTime || now, // Track original authentication time
    auth_method: 'oidc',
  };
  
  // ... rest of implementation
}

// In protected routes requiring fresh authentication
export async function requireFreshAuth(
  request: NextRequest,
  maxAge: number = 24 * 60 * 60 // 24 hours default
): Promise<boolean> {
  const token = await getAccessToken(request);
  if (!token) return false;
  
  const payload = await verifyAccessToken(token);
  const authAge = Math.floor(Date.now() / 1000) - (payload.auth_time || payload.iat);
  
  if (authAge > maxAge) {
    log.info('Authentication too old, re-auth required', {
      userId: payload.user_id,
      authAge,
      maxAge,
    });
    return false;
  }
  
  return true;
}

// Usage in sensitive routes
export const POST = protectedRoute(
  async (request: NextRequest) => {
    // Require authentication within last hour for sensitive operations
    if (!await requireFreshAuth(request, 60 * 60)) {
      return NextResponse.json(
        { error: 'Fresh authentication required' },
        { status: 401 }
      );
    }
    
    // ... proceed with sensitive operation
  },
  'Sensitive operation',
  { requiredPermissions: ['admin.sensitive.action'] }
);

12. Concurrent Login Detection
Prevent race conditions from multiple simultaneous logins:
typescript// lib/oidc/concurrent-login.ts
import { redis } from '@/lib/redis'; // Or in-memory Map for single instance

export async function registerPendingAuth(
  fingerprint: string,
  state: string
): Promise<void> {
  const key = `oidc:pending:${fingerprint}`;
  
  // Check for existing pending auth
  const existing = await redis.get(key);
  if (existing && existing !== state) {
    log.warn('Concurrent OIDC login detected', {
      fingerprint: fingerprint.substring(0, 16),
      existingState: existing.substring(0, 8),
      newState: state.substring(0, 8),
    });
  }
  
  // Store with 10 minute TTL
  await redis.setex(key, 600, state);
}

export async function validatePendingAuth(
  fingerprint: string,
  state: string
): Promise<boolean> {
  const key = `oidc:pending:${fingerprint}`;
  const stored = await redis.get(key);
  
  if (!stored) {
    log.warn('No pending auth found for fingerprint', {
      fingerprint: fingerprint.substring(0, 16),
    });
    return false;
  }
  
  if (stored !== state) {
    log.error('State mismatch for fingerprint', {
      fingerprint: fingerprint.substring(0, 16),
      expected: stored.substring(0, 8),
      received: state.substring(0, 8),
    });
    return false;
  }
  
  // Clean up
  await redis.del(key);
  return true;
}

// Usage in login route
const fingerprint = generateDeviceFingerprint(ipAddress, userAgent);
await registerPendingAuth(fingerprint, state);

// Usage in callback route
if (!await validatePendingAuth(fingerprint, state)) {
  return NextResponse.redirect(
    new URL('/signin?error=concurrent_login', request.url)
  );
}

13. Clock Skew Tolerance
Add explicit clock skew handling:
typescript// lib/oidc/validation.ts
const CLOCK_SKEW_TOLERANCE = 30 * 1000; // 30 seconds

export function validateTimestamp(
  timestamp: number,
  maxAge: number,
  field: string = 'timestamp'
): boolean {
  const now = Date.now();
  const age = now - timestamp;
  
  // Check if timestamp is in the future (allowing for clock skew)
  if (age < -CLOCK_SKEW_TOLERANCE) {
    log.error(`${field} is too far in the future`, {
      timestamp: new Date(timestamp).toISOString(),
      now: new Date(now).toISOString(),
      diff: age,
    });
    return false;
  }
  
  // Check if timestamp is too old (with tolerance)
  if (age > maxAge + CLOCK_SKEW_TOLERANCE) {
    log.warn(`${field} is too old`, {
      timestamp: new Date(timestamp).toISOString(),
      now: new Date(now).toISOString(),
      age,
      maxAge,
    });
    return false;
  }
  
  return true;
}

// Usage in state validation
if (!validateTimestamp(sessionData.timestamp, 5 * 60 * 1000, 'OIDC state')) {
  return false;
}

14. Authorization Parameters Enhancement
Add optional parameters for better UX:
typescript// lib/oidc/client.ts
interface AuthUrlOptions {
  returnUrl?: string;
  prompt?: 'none' | 'login' | 'consent' | 'select_account';
  loginHint?: string; // Pre-fill email
  domainHint?: string; // Skip account type selection
  maxAge?: number; // Force re-auth if session older than this
}

async createAuthUrl(options: AuthUrlOptions = {}): Promise<{
  url: string;
  state: string;
  codeVerifier: string;
  nonce: string;
}> {
  if (!this.client) await this.initialize();

  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  const state = generators.state();
  const nonce = generators.nonce();

  const authParams: Record<string, string> = {
    scope: this.config!.scopes.join(' '),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  };

  // Add optional parameters
  if (options.prompt) {
    authParams.prompt = options.prompt;
  }
  
  if (options.loginHint) {
    authParams.login_hint = options.loginHint;
  }
  
  if (options.domainHint) {
    authParams.domain_hint = options.domainHint;
  }
  
  if (options.maxAge !== undefined) {
    authParams.max_age = String(options.maxAge);
  }

  const url = this.client!.authorizationUrl(authParams);

  return { url, state, codeVerifier, nonce };
}

// Usage examples
// Force account selection
await oidcClient.createAuthUrl({ prompt: 'select_account' });

// Force fresh authentication
await oidcClient.createAuthUrl({ prompt: 'login', maxAge: 0 });

// Pre-fill email for specific domain
await oidcClient.createAuthUrl({ 
  loginHint: 'user@aara.care',
  domainHint: 'aara.care' 
});

15. CORS Configuration
If using subdomains or cross-origin scenarios:
typescript// app/api/auth/oidc/callback/route.ts
const oidcCallbackHandler = async (request: NextRequest) => {
  // ... existing logic
  
  const response = NextResponse.redirect(
    new URL(returnUrl || '/dashboard', request.url)
  );
  
  // Add CORS headers if needed
  if (process.env.ENABLE_CORS === 'true') {
    const origin = request.headers.get('origin');
    const allowedOrigins = [
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.NEXT_PUBLIC_ADMIN_URL,
    ].filter(Boolean);
    
    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
  }
  
  return response;
};

Environment Variables Update
Add these to the environment variables section:
bash# ========================================
# OIDC Security Configuration
# ========================================

# Required: Session encryption secret (32+ characters)
# Generate with: openssl rand -base64 32
OIDC_SESSION_SECRET=<your-session-secret-here>

# Optional: Strict fingerprint validation (default: false)
# Set to 'true' for high-security environments
# Note: May cause issues with mobile networks/VPNs
OIDC_STRICT_FINGERPRINT=false

# Optional: Enable CORS for cross-origin requests
ENABLE_CORS=false

# Optional: Custom logout redirect
OIDC_LOGOUT_REDIRECT=/signin?logout=success

Updated Implementation Checklist
Phase 1: Critical Security Fixes (Week 1)

 Implement session cookie encryption (#1)
 Implement one-time state tokens (#2)
 Add session fingerprint binding (#3)
 Add explicit ID token validation (#4)
 Update environment variables
 Write security tests for new features

Phase 1: Architecture Improvements (Week 1-2)

 Implement discovery document caching (#5)
 Implement client singleton pattern (#6)
 Add OIDC logout endpoint (#7)
 Implement specific error handling (#8)
 Update Entra app registration for logout URI

Phase 2: Code Quality (Week 2)

 Strengthen TypeScript types (#9)
 Standardize error response format (#10)
 Add concurrent login detection (#12)
 Add clock skew tolerance (#13)

Phase 2: UX Enhancements (Week 2-3)

 Implement session age re-authentication (#11)
 Add authorization parameters (#14)
 Configure CORS if needed (#15)

Testing (Week 2-3)

 Security test: Encrypted session cookies
 Security test: State replay prevention
 Security test: Fingerprint validation
 Security test: Concurrent login handling
 Integration test: Full OIDC flow with all validations
 Integration test: Logout flow
 E2E test: All 5 domains


Revised Effort Estimate
PhaseOriginal EstimateAdditional Security WorkNew EstimatePhase 1: Development40 hours+12 hours (security)52 hoursPhase 2: Feature Parity20 hours+4 hours (enhancements)24 hoursPhase 3: Testing20 hours+8 hours (security tests)28 hoursTotal80 hours+24 hours104 hours
Timeline: 5-6 weeks (with security improvements)

Summary
The original OIDC design is architecturally sound but has 4 critical security gaps that must be addressed:

Unencrypted session cookies - Exposes PKCE verifier
Reusable state tokens - Violates OIDC spec
No session binding - Vulnerable to hijacking
Missing explicit validation - Over-reliance on library

These issues add 12-16 hours to the implementation but are non-negotiable for a secure production deployment.
The recommended improvements (caching, singleton, logout, error handling) add another 8-12 hours but significantly improve code quality, performance, and user experience.
Recommendation: Proceed with OIDC conversion, incorporating all critical security fixes in Phase 1. The 60-70% code reduction benefit remains valid even with these additional security measures.