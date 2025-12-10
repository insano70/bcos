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
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { publicRoute } from '@/lib/api/route-handlers';
import { AuditLogger } from '@/lib/api/services/audit';
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
    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);
    const fingerprint = metadata.fingerprint;

    // Get return URL from query params, or use default dashboard if configured
    const paramReturnUrl = request.nextUrl.searchParams.get('returnUrl');
    const { getDefaultReturnUrl } = await import('@/lib/services/default-dashboard-service');
    const returnUrl = await getDefaultReturnUrl(paramReturnUrl);

    // Get optional prompt parameter for controlling authentication behavior
    // Supported values: 'none', 'login', 'consent', 'select_account'
    // Default: undefined - allows Microsoft to use SSO when user has existing session
    const promptParam = request.nextUrl.searchParams.get('prompt');
    const validPrompts = ['none', 'login', 'consent', 'select_account'] as const;
    const prompt = promptParam && validPrompts.includes(promptParam as (typeof validPrompts)[number])
      ? (promptParam as 'none' | 'login' | 'consent' | 'select_account')
      : undefined;

    // Get optional login_hint to pre-fill email in Microsoft login form
    const loginHint = request.nextUrl.searchParams.get('login_hint') ?? undefined;

    // Get OIDC client (singleton)
    const oidcClient = await getOIDCClient();

    // Create authorization URL with PKCE and optional prompt/login_hint
    // Build options object conditionally to satisfy exactOptionalPropertyTypes
    const authOptions: Parameters<typeof oidcClient.createAuthUrl>[0] = {};
    if (prompt) {
      authOptions.prompt = prompt;
    }
    if (loginHint) {
      authOptions.loginHint = loginHint;
    }
    const { url, state, codeVerifier, nonce } = await oidcClient.createAuthUrl(authOptions);

    // Register state for one-time use validation (CRITICAL for CSRF prevention)
    // Database-backed for horizontal scaling
    await databaseStateManager.registerState(state, nonce, fingerprint);

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

    // Log single comprehensive entry for login initiation
    log.info('OIDC login redirect', {
      operation: 'oidc_login',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      requestId: correlation.current(),
      returnUrl,
      prompt: prompt || 'default',
      hasLoginHint: !!loginHint,
      authEndpoint: url.split('?')[0],
      duration: Date.now() - startTime,
    });

    // Redirect to Microsoft Entra authorization endpoint
    return NextResponse.redirect(url);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('OIDC login initiation failed', error, {
      duration,
    });

    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const errorMetadata = extractRequestMetadata(request);

    await AuditLogger.logAuth({
      action: 'login_failed',
      ipAddress: errorMetadata.ipAddress,
      userAgent: errorMetadata.userAgent,
      metadata: {
        authMethod: 'oidc',
        reason: 'login_initiation_failed',
        error: error instanceof Error ? error.message : 'Unknown',
        requestId: correlation.current(),
      },
    });

    return handleRouteError(error, 'Failed to initiate OIDC login', request);
  }
};

// Export as GET endpoint with public route handler
export const GET = publicRoute(oidcLoginHandler, 'OIDC login initiation', {
  rateLimit: 'auth',
});
