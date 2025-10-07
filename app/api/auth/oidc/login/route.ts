/**
 * OIDC Login Initiation Endpoint
 *
 * Initiates OpenID Connect authentication flow by redirecting to Microsoft Entra.
 *
 * Security Features:
 * - Encrypted session cookies (iron-session) to protect PKCE code_verifier
 * - Device fingerprint binding for session hijacking prevention
 * - State token registration for one-time use validation
 * - PKCE (Proof Key for Code Exchange) support
 *
 * Flow:
 * 1. User clicks "Sign in with Microsoft"
 * 2. This endpoint creates authorization URL with PKCE
 * 3. Stores encrypted session data (state, codeVerifier, nonce, fingerprint)
 * 4. Redirects to Microsoft Entra authorization endpoint
 * 5. User authenticates with Microsoft
 * 6. Entra redirects back to /api/auth/oidc/callback
 *
 * @route GET /api/auth/oidc/login
 * @access Public (unauthenticated)
 */

import { sealData } from 'iron-session';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { publicRoute } from '@/lib/api/route-handler';
import { AuditLogger } from '@/lib/api/services/audit';
import { generateDeviceFingerprint } from '@/lib/auth/token-manager';
import { isOIDCEnabled } from '@/lib/env';
import { correlation, log } from '@/lib/logger';
import { getOIDCClient } from '@/lib/oidc/client';
import { databaseStateManager } from '@/lib/oidc/database-state-manager';
import type { OIDCSessionData } from '@/lib/oidc/types';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

/**
 * OIDC Login Handler
 *
 * Creates authorization URL with PKCE and redirects to Microsoft Entra.
 */
const oidcLoginHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  log.api('GET /api/auth/oidc/login - OIDC login initiated', request, 0, 0);

  try {
    // Check if OIDC is enabled
    if (!isOIDCEnabled()) {
      log.security('oidc_disabled', 'low', {
        action: 'oidc_login_attempted',
        blocked: true,
        reason: 'oidc_not_configured',
      });

      log.warn('OIDC login attempted but OIDC is not configured');

      return createErrorResponse(
        'OIDC SSO is not available. Please use email and password to sign in.',
        503,
        request
      );
    }

    // Extract device info for fingerprinting
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const ipAddress = forwardedFor
      ? forwardedFor.split(',')[0]?.trim() || 'unknown'
      : realIp || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Generate device fingerprint (binds session to device)
    const fingerprint = generateDeviceFingerprint(ipAddress, userAgent);

    // Get return URL from query params, or use default dashboard if configured
    const paramReturnUrl = request.nextUrl.searchParams.get('returnUrl');
    const { getDefaultReturnUrl } = await import('@/lib/services/default-dashboard-service');
    const returnUrl = await getDefaultReturnUrl(paramReturnUrl);

    log.info('OIDC login initiation started', {
      requestId: correlation.current() || 'unknown',
      ipAddress,
      returnUrl,
      fingerprint: `${fingerprint.substring(0, 16)}...`,
    });

    // Get OIDC client (singleton)
    const oidcClient = await getOIDCClient();

    // Create authorization URL with PKCE
    const { url, state, codeVerifier, nonce } = await oidcClient.createAuthUrl();

    // Register state for one-time use validation (CRITICAL for CSRF prevention)
    // Database-backed for horizontal scaling
    await databaseStateManager.registerState(state, nonce, fingerprint);

    const stateCount = await databaseStateManager.getStateCount();
    log.info('OIDC state token registered in database', {
      state: `${state.substring(0, 8)}...`,
      totalStates: stateCount,
    });

    // Encrypt session data before storing (CRITICAL SECURITY)
    const sessionSecret = process.env.OIDC_SESSION_SECRET;
    if (!sessionSecret) {
      throw new Error('OIDC_SESSION_SECRET not configured');
    }

    const sessionData: OIDCSessionData = {
      state,
      codeVerifier,
      nonce,
      returnUrl,
      fingerprint,
      timestamp: Date.now(),
    };

    const sealed = await sealData(sessionData, {
      password: sessionSecret,
      ttl: 60 * 10, // 10 minutes
    });

    // Store encrypted session in httpOnly cookie
    const cookieStore = await cookies();
    cookieStore.set('oidc-session', sealed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // REQUIRED: Allows cookie to be sent on top-level OAuth redirect from Microsoft Entra (strict blocks cross-site navigations)
      maxAge: 60 * 10, // 10 minutes
      path: '/',
    });

    // Audit log - log as login attempt for tracking
    log.info('OIDC login audit', {
      ipAddress,
      userAgent,
      requestId: correlation.current(),
      returnUrl,
    });

    log.info('OIDC login redirect', {
      duration: Date.now() - startTime,
      authEndpoint: url.split('?')[0],
    });

    // Redirect to Microsoft Entra authorization endpoint
    return NextResponse.redirect(url);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('OIDC login initiation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    });

    const errorIp = request.headers.get('x-forwarded-for');
    const errorUserAgent = request.headers.get('user-agent');

    await AuditLogger.logAuth({
      action: 'login_failed',
      ipAddress: errorIp ? errorIp.split(',')[0]?.trim() : undefined,
      userAgent: errorUserAgent || undefined,
      metadata: {
        authMethod: 'oidc',
        reason: 'login_initiation_failed',
        error: error instanceof Error ? error.message : 'Unknown',
        requestId: correlation.current(),
      },
    });

    return createErrorResponse('Failed to initiate OIDC login. Please try again.', 500, request);
  }
};

// Export as GET endpoint with public route handler
export const GET = publicRoute(oidcLoginHandler, 'OIDC login initiation', {
  rateLimit: 'auth',
});
