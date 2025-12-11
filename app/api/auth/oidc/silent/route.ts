/**
 * Silent OIDC Authentication Endpoint
 *
 * Attempts to authenticate user without interaction using prompt=none.
 * If user has valid Microsoft session, they get authenticated silently.
 * If not, Microsoft returns an error that the callback handles gracefully.
 *
 * This enables seamless SSO for users who already have an active Microsoft session,
 * eliminating unnecessary MFA prompts when the user is already authenticated with Microsoft.
 *
 * Flow:
 * 1. Client calls this endpoint when user has no local session
 * 2. We redirect to Microsoft with prompt=none
 * 3. If Microsoft session valid: callback receives auth code, user authenticated
 * 4. If Microsoft session invalid: callback receives error, redirects to signin
 *
 * @route GET /api/auth/oidc/silent
 * @access Public (unauthenticated)
 */

import { sealData } from 'iron-session';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { publicRoute } from '@/lib/api/route-handlers';
import { isOIDCEnabled, shouldUseSecureCookies } from '@/lib/env';
import { correlation, log } from '@/lib/logger';
import { getOIDCClient } from '@/lib/oidc/client';
import { databaseStateManager } from '@/lib/oidc/database-state-manager';
import type { OIDCSessionData } from '@/lib/oidc/types';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

/**
 * Silent OIDC Auth Handler
 *
 * Creates authorization URL with prompt=none and redirects to Microsoft Entra.
 * This attempts silent authentication without user interaction.
 */
const silentAuthHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Check if OIDC is enabled
    if (!isOIDCEnabled()) {
      log.warn('Silent auth attempted but OIDC is not configured');
      return NextResponse.redirect(new URL('/signin?error=oidc_not_configured', request.url));
    }

    // Extract device info for fingerprinting
    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);

    // Get return URL from query params, or use default dashboard
    const paramReturnUrl = request.nextUrl.searchParams.get('returnUrl');
    const { getDefaultReturnUrl } = await import('@/lib/services/default-dashboard-service');
    const returnUrl = await getDefaultReturnUrl(paramReturnUrl);

    // Get optional login_hint to pre-fill email
    const loginHint = request.nextUrl.searchParams.get('login_hint') ?? undefined;

    // Get OIDC client (singleton)
    const oidcClient = await getOIDCClient();

    // Create authorization URL with prompt=none for silent authentication
    // Build options object conditionally to satisfy exactOptionalPropertyTypes
    const authOptions: Parameters<typeof oidcClient.createAuthUrl>[0] = {
      prompt: 'none', // KEY: Silent authentication - no UI shown
    };
    if (loginHint) {
      authOptions.loginHint = loginHint;
    }

    const { url, state, codeVerifier, nonce } = await oidcClient.createAuthUrl(authOptions);

    // Register state for one-time use validation
    await databaseStateManager.registerState(state, nonce, metadata.fingerprint);

    // Encrypt session data
    const sessionSecret = process.env.OIDC_SESSION_SECRET;
    if (!sessionSecret) {
      throw new Error('OIDC_SESSION_SECRET not configured');
    }

    const sessionData: OIDCSessionData = {
      state,
      codeVerifier,
      nonce,
      returnUrl,
      fingerprint: metadata.fingerprint,
      timestamp: Date.now(),
    };

    // Shorter TTL for silent auth (2 minutes vs 10 for interactive)
    const sealed = await sealData(sessionData, {
      password: sessionSecret,
      ttl: 60 * 2, // 2 minutes
    });

    // Store encrypted session in httpOnly cookie
    const cookieStore = await cookies();
    cookieStore.set('oidc-session', sealed, {
      httpOnly: true,
      secure: shouldUseSecureCookies(),
      sameSite: 'lax',
      maxAge: 60 * 2,
      path: '/',
    });

    // Mark this as a silent auth attempt so callback knows how to handle errors
    cookieStore.set('oidc-silent-attempt', 'true', {
      httpOnly: true,
      secure: shouldUseSecureCookies(),
      sameSite: 'lax',
      maxAge: 60 * 2,
      path: '/',
    });

    log.info('Silent OIDC auth redirect', {
      operation: 'oidc_silent_auth',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      requestId: correlation.current(),
      returnUrl,
      hasLoginHint: !!loginHint,
      authEndpoint: url.split('?')[0],
      duration: Date.now() - startTime,
    });

    // Redirect to Microsoft Entra with prompt=none
    return NextResponse.redirect(url);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Silent auth initiation failed', error, {
      duration,
      operation: 'oidc_silent_auth',
      component: 'auth',
    });

    // On error, redirect to signin page
    return NextResponse.redirect(new URL('/signin?error=silent_auth_failed', request.url));
  }
};

// Export as GET endpoint with public route handler
export const GET = publicRoute(silentAuthHandler, 'Silent OIDC authentication', {
  rateLimit: 'auth',
});

