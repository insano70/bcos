/**
 * SAML SSO Login Initiation Endpoint
 * 
 * Initiates SAML authentication flow by redirecting to Microsoft Entra
 * 
 * Flow:
 * 1. User clicks "Sign in with Microsoft"
 * 2. This endpoint creates SAML AuthnRequest
 * 3. Redirects to Microsoft Entra tenant-specific endpoint
 * 4. User authenticates with Microsoft
 * 5. Entra redirects back to /api/auth/saml/callback
 * 
 * @route GET /api/auth/saml/login
 * @access Public (unauthenticated)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { publicRoute } from '@/lib/api/route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { AuditLogger, log, correlation } from '@/lib/logger';
import { createSAMLClient } from '@/lib/saml/client';
import { isSAMLEnabled } from '@/lib/env';
import type { SAMLAuthContext } from '@/lib/types/saml';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

/**
 * SAML Login Handler
 * Creates SAML AuthnRequest and redirects to Microsoft Entra
 */
const samlLoginHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  log.api('GET /api/auth/saml/login - SAML login initiated', request, 0, 0);

  try {
    // Check if SAML is enabled
    if (!isSAMLEnabled()) {
      log.security('saml_disabled', 'low', {
        action: 'saml_login_attempted',
        blocked: true,
        reason: 'saml_not_configured'
      });

      log.warn('SAML login attempted but SAML is not configured');

      return createErrorResponse(
        'SAML SSO is not available. Please use email and password to sign in.',
        503,
        request
      );
    }

    // Extract device info
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Build SAML auth context
    const relayStateParam = request.nextUrl.searchParams.get('relay_state');
    const authContext: SAMLAuthContext = {
      requestId: correlation.current() || 'unknown',
      ipAddress,
      userAgent,
      timestamp: new Date(),
      ...(relayStateParam && { relayState: relayStateParam })
    };

    log.info('SAML login initiation started', {
      requestId: authContext.requestId,
      ipAddress,
      hasRelayState: !!authContext.relayState
    });

    // Create SAML client and generate login URL
    const samlClient = createSAMLClient(authContext.requestId);
    const loginUrlStartTime = Date.now();

    const loginUrl = await samlClient.createLoginUrl(authContext);

    log.info('SAML login URL created', {
      requestId: authContext.requestId,
      duration: Date.now() - loginUrlStartTime,
      urlLength: loginUrl.length
    });

    // Enhanced SAML login attempt logging
    log.auth('saml_login_initiated', true, {
      method: 'session' // SAML will create a session after callback
    });

    // Audit log - use metadata to indicate SAML login
    await AuditLogger.logAuth({
      action: 'login', // Standard action, use metadata to specify SAML
      ipAddress,
      userAgent,
      metadata: {
        authMethod: 'saml',
        stage: 'initiation',
        requestId: authContext.requestId,
        relayState: authContext.relayState,
        correlationId: correlation.current()
      }
    });

    // Security success event
    log.security('saml_login_url_generated', 'low', {
      action: 'saml_redirect_created',
      reason: 'user_initiated_sso'
    });

    const totalDuration = Date.now() - startTime;

    log.info('SAML login redirect prepared', {
      requestId: authContext.requestId,
      totalDuration
    });

    // Redirect directly to Microsoft Entra
    // Note: Cannot use intermediate branded page as it would exceed Microsoft's query string limit
    return NextResponse.redirect(loginUrl);

  } catch (error) {
    const totalDuration = Date.now() - startTime;

    // Enhanced error logging with full details
    log.error('SAML login initiation failed', error, {
      totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    });

    // Also log to console for immediate visibility
    console.error('❌ SAML Login Error:', {
      message: error instanceof Error ? error.message : String(error),
      type: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined
    });

    // Enhanced error logging
    log.auth('saml_login_initiation_failed', false, {
      reason: error instanceof Error ? error.message : 'unknown_error'
    });

    log.security('saml_login_failure', 'medium', {
      action: 'saml_login_initiation_failed',
      blocked: true,
      reason: error instanceof Error ? error.message : 'unknown'
    });

    // Audit log for failure
    await AuditLogger.logAuth({
      action: 'login_failed', // Standard action, use metadata to specify SAML
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      metadata: {
        authMethod: 'saml',
        stage: 'initiation',
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: correlation.current()
      }
    });

    // Redirect back to login page with error
    const errorUrl = new URL('/signin', request.url);
    errorUrl.searchParams.set('error', 'saml_init_failed');
    
    return NextResponse.redirect(errorUrl);
  }
};

// Export handler directly (correlation ID automatically added by middleware)
// Rate limit: 'api' = 200/min (more lenient than 'auth' since this is just a redirect)
export const GET = publicRoute(
  samlLoginHandler,
  'SAML SSO login initiation - public endpoint',
  { rateLimit: 'api' }
);
