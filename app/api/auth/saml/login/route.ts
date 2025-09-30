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
import { withCorrelation, CorrelationContextManager } from '@/lib/logger';
import { createAPILogger } from '@/lib/logger/api-features';
import { AuditLogger } from '@/lib/logger';
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

  // Create enhanced API logger for SAML authentication
  const apiLogger = createAPILogger(request, 'saml-login');
  const logger = apiLogger.getLogger();

  // Log SAML login initiation
  apiLogger.logRequest({
    authType: 'none', // User is not authenticated yet
    suspicious: false
  });

  try {
    // Check if SAML is enabled
    if (!isSAMLEnabled()) {
      apiLogger.logSecurity('saml_disabled', 'low', {
        action: 'saml_login_attempted',
        blocked: true,
        reason: 'saml_not_configured'
      });

      logger.warn('SAML login attempted but SAML is not configured');

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
      requestId: CorrelationContextManager.getCurrentId() || 'unknown',
      ipAddress,
      userAgent,
      timestamp: new Date(),
      ...(relayStateParam && { relayState: relayStateParam })
    };

    logger.info('SAML login initiation started', {
      requestId: authContext.requestId,
      ipAddress,
      hasRelayState: !!authContext.relayState
    });

    // Create SAML client and generate login URL
    const samlClient = createSAMLClient(authContext.requestId);
    const loginUrlStartTime = Date.now();
    
    const loginUrl = await samlClient.createLoginUrl(authContext);
    
    logger.info('SAML login URL created', {
      requestId: authContext.requestId,
      duration: Date.now() - loginUrlStartTime,
      urlLength: loginUrl.length
    });

    // Enhanced SAML login attempt logging
    apiLogger.logAuth('saml_login_initiated', true, {
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
        correlationId: CorrelationContextManager.getCurrentId()
      }
    });

    // Security success event
    apiLogger.logSecurity('saml_login_url_generated', 'low', {
      action: 'saml_redirect_created',
      reason: 'user_initiated_sso'
    });

    const totalDuration = Date.now() - startTime;

    // Log response
    apiLogger.logResponse(302, {
      recordCount: 1,
      processingTimeBreakdown: {
        loginUrlGeneration: Date.now() - loginUrlStartTime,
        total: totalDuration
      }
    });

    logger.info('SAML login redirect prepared', {
      requestId: authContext.requestId,
      totalDuration
    });

    // Redirect to Microsoft Entra
    return NextResponse.redirect(loginUrl);

  } catch (error) {
    const totalDuration = Date.now() - startTime;

    logger.error('SAML login initiation failed', error, {
      totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    });

    // Enhanced error logging
    apiLogger.logAuth('saml_login_initiation_failed', false, {
      reason: error instanceof Error ? error.message : 'unknown_error'
    });

    apiLogger.logSecurity('saml_login_failure', 'medium', {
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
        correlationId: CorrelationContextManager.getCurrentId()
      }
    });

    // Redirect back to login page with error
    const errorUrl = new URL('/signin', request.url);
    errorUrl.searchParams.set('error', 'saml_init_failed');
    
    return NextResponse.redirect(errorUrl);
  }
};

// Export as public route with correlation wrapper
// Rate limit: 'api' = 200/min (more lenient than 'auth' since this is just a redirect)
export const GET = publicRoute(
  withCorrelation(samlLoginHandler),
  'SAML SSO login initiation - public endpoint',
  { rateLimit: 'api' }
);
