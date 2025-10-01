/**
 * SAML SSO Callback Endpoint
 * 
 * Handles SAML response from Microsoft Entra after user authentication
 * CRITICAL: This is the security boundary - all SAML validations happen here
 * 
 * Security Validations:
 * - SAML signature verification
 * - Issuer validation (tenant isolation)
 * - Audience restriction
 * - Timestamp validation
 * - Replay attack prevention
 * - Email domain validation
 * - User pre-provisioning check
 * - Account active status check
 * 
 * @route POST /api/auth/saml/callback
 * @access Public (unauthenticated - validates via SAML)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { publicRoute } from '@/lib/api/route-handler';
import { createErrorResponse, AuthenticationError } from '@/lib/api/responses/error';
import { withCorrelation, CorrelationContextManager, logPerformanceMetric } from '@/lib/logger';
import { createAPILogger } from '@/lib/logger/api-features';
import { AuditLogger } from '@/lib/logger';
import { TokenManager } from '@/lib/auth/token-manager';
import { getCachedUserContextSafe } from '@/lib/rbac/cached-user-context';
import { UnifiedCSRFProtection } from '@/lib/security/csrf-unified';
import { createSAMLClient } from '@/lib/saml/client';
import { isSAMLEnabled, getSAMLConfig } from '@/lib/env';
import type { SAMLAuthContext } from '@/lib/types/saml';
import { checkAndTrackAssertion } from '@/lib/saml/replay-prevention';
import { validateSAMLProfile } from '@/lib/saml/input-validator';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

/**
 * SAML Callback Handler
 * Validates SAML response and issues JWT tokens
 * 
 * CRITICAL: Matches app/api/auth/login/route.ts patterns exactly
 */
const samlCallbackHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  // Create enhanced API logger for SAML callback
  const apiLogger = createAPILogger(request, 'saml-callback');
  const logger = apiLogger.getLogger();

  // Log SAML callback initiation
  apiLogger.logRequest({
    authType: 'none', // User authenticates via SAML
    suspicious: false
  });

  try {
    // Check if SAML is enabled
    if (!isSAMLEnabled()) {
      apiLogger.logSecurity('saml_callback_rejected', 'medium', {
        action: 'saml_callback_attempted',
        blocked: true,
        reason: 'saml_not_configured'
      });

      logger.warn('SAML callback received but SAML is not configured');

      return createErrorResponse(
        'SAML SSO is not available',
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
    const authContext: SAMLAuthContext = {
      requestId: CorrelationContextManager.getCurrentId() || 'unknown',
      ipAddress,
      userAgent,
      timestamp: new Date()
    };

    logger.info('SAML callback processing started', {
      requestId: authContext.requestId,
      ipAddress
    });

    // Parse form data (SAML response comes as form POST)
    const formDataStartTime = Date.now();
    const formData = await request.formData();
    const samlResponse = formData.get('SAMLResponse');
    logPerformanceMetric(logger, 'form_data_parsing', Date.now() - formDataStartTime);

    if (!samlResponse || typeof samlResponse !== 'string') {
      apiLogger.logSecurity('saml_response_missing', 'high', {
        action: 'invalid_saml_callback',
        blocked: true,
        threat: 'malformed_request',
        reason: 'no_saml_response'
      });

      logger.error('No SAML response in callback request');

      throw AuthenticationError('Invalid SAML callback - no SAML response');
    }

    logger.debug('SAML response received', {
      requestId: authContext.requestId,
      responseLength: samlResponse.length
    });

    // Validate SAML response with comprehensive security checks
    const samlValidationStartTime = Date.now();
    const samlClient = createSAMLClient(authContext.requestId);
    
    const validationResult = await samlClient.validateResponse(
      { SAMLResponse: samlResponse },
      authContext
    );
    
    logPerformanceMetric(logger, 'saml_validation', Date.now() - samlValidationStartTime, {
      signatureValid: validationResult.validations.signatureValid,
      issuerValid: validationResult.validations.issuerValid,
      allChecks: Object.keys(validationResult.validations).length
    });

    if (!validationResult.success || !validationResult.profile) {
      // SAML validation failed - security event
      apiLogger.logSecurity('saml_validation_failed', 'high', {
        action: 'authentication_rejected',
        blocked: true,
        threat: 'invalid_saml_response',
        reason: validationResult.error || 'validation_failed'
      });

      logger.error('SAML validation failed', new Error(validationResult.error || 'Unknown error'), {
        requestId: authContext.requestId,
        validations: validationResult.validations
      });

      await AuditLogger.logAuth({
        action: 'login_failed',
        ipAddress,
        userAgent,
        metadata: {
          authMethod: 'saml',
          stage: 'callback_validation',
          reason: validationResult.error,
          validations: validationResult.validations,
          correlationId: CorrelationContextManager.getCurrentId()
        }
      });

      throw AuthenticationError(validationResult.error || 'SAML validation failed');
    }

    const profile = validationResult.profile;

    // CRITICAL SECURITY: Validate and sanitize SAML profile data
    // Defense-in-depth: Even though node-saml validated the response,
    // we add extra validation to protect against malformed data and injection attempts
    const profileValidation = validateSAMLProfile({
      email: profile.email,
      displayName: profile.displayName,
      givenName: profile.givenName,
      surname: profile.surname
    });

    if (!profileValidation.valid) {
      apiLogger.logSecurity('saml_profile_validation_failed', 'high', {
        action: 'authentication_rejected',
        blocked: true,
        threat: 'invalid_profile_data',
        reason: `profile_validation_failed: ${profileValidation.errors.join(', ')}`
      });

      logger.error('SAML profile validation failed', new Error('Invalid profile data'), {
        requestId: authContext.requestId,
        errors: profileValidation.errors,
        alert: 'POSSIBLE_INJECTION_ATTEMPT'
      });

      await AuditLogger.logAuth({
        action: 'login_failed',
        ipAddress,
        userAgent,
        metadata: {
          authMethod: 'saml',
          stage: 'profile_validation',
          reason: 'invalid_profile_data',
          errors: profileValidation.errors,
          correlationId: CorrelationContextManager.getCurrentId()
        }
      });

      throw AuthenticationError('Invalid profile data');
    }

    // Use sanitized email from validation
    const email = profileValidation.sanitized!.email;

    logger.info('SAML validation successful', {
      requestId: authContext.requestId,
      email: email.replace(/(.{2}).*@/, '$1***@'), // PII masking
      issuer: profile.issuer,
      allValidationsPassed: Object.values(validationResult.validations).every(v => v)
    });

    // Enhanced SAML validation success logging
    apiLogger.logAuth('saml_validation_success', true, {
      method: 'session'
    });

    // CRITICAL SECURITY: Check for replay attack
    // Must happen AFTER SAML validation but BEFORE creating session
    // This prevents attackers from reusing intercepted SAML responses
    const replayCheckStartTime = Date.now();
    
    // Extract assertion metadata for replay prevention
    const assertionId = profile.assertionID || profile.sessionIndex || profile.nameID || `fallback-${Date.now()}`;
    const inResponseTo = profile.inResponseTo || 'unknown';
    const assertionExpiry = profile.sessionNotOnOrAfter 
      ? new Date(profile.sessionNotOnOrAfter)
      : new Date(Date.now() + 5 * 60 * 1000); // 5 min default

    const replayCheck = await checkAndTrackAssertion(
      assertionId,
      inResponseTo,
      email,
      ipAddress,
      userAgent,
      assertionExpiry
    );

    logPerformanceMetric(logger, 'replay_attack_check', Date.now() - replayCheckStartTime, {
      safe: replayCheck.safe
    });

    if (!replayCheck.safe) {
      // REPLAY ATTACK DETECTED - This is a critical security event
      apiLogger.logSecurity('saml_replay_attack_detected', 'critical', {
        action: 'authentication_rejected',
        blocked: true,
        threat: 'replay_attack',
        reason: replayCheck.reason || 'replay_detected'
      });

      logger.error('SAML replay attack detected', new Error('Replay attack'), {
        requestId: authContext.requestId,
        email: email.replace(/(.{2}).*@/, '$1***@'),
        assertionId: assertionId.substring(0, 20) + '...',
        reason: replayCheck.reason,
        existingUsedAt: replayCheck.details?.existingUsedAt,
        existingIpAddress: replayCheck.details?.existingIpAddress,
        alert: 'REPLAY_ATTACK_BLOCKED'
      });

      await AuditLogger.logAuth({
        action: 'login_failed',
        email,
        ipAddress,
        userAgent,
        metadata: {
          authMethod: 'saml',
          stage: 'replay_prevention',
          reason: 'replay_attack_detected',
          assertionId: assertionId.substring(0, 20) + '...',
          details: replayCheck.details,
          correlationId: CorrelationContextManager.getCurrentId(),
          severity: 'critical'
        }
      });

      throw AuthenticationError('Authentication failed - security violation detected');
    }

    logger.info('SAML replay check passed', {
      requestId: authContext.requestId,
      assertionId: assertionId.substring(0, 20) + '...'
    });

    // Fetch user from database (pre-provisioning check)
    const dbStartTime = Date.now();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    
    logPerformanceMetric(logger, 'database_user_lookup', Date.now() - dbStartTime, {
      userFound: !!user
    });

    if (!user) {
      // User not pre-provisioned - security event
      apiLogger.logSecurity('saml_user_not_provisioned', 'medium', {
        action: 'authentication_rejected',
        blocked: true,
        threat: 'unauthorized_access',
        reason: 'user_not_found'
      });

      logger.warn('SAML SSO attempt by non-provisioned user', {
        requestId: authContext.requestId,
        email: email.replace(/(.{2}).*@/, '$1***@')
      });

      await AuditLogger.logAuth({
        action: 'login_failed',
        email,
        ipAddress,
        userAgent,
        metadata: {
          authMethod: 'saml',
          stage: 'user_lookup',
          reason: 'user_not_provisioned',
          correlationId: CorrelationContextManager.getCurrentId()
        }
      });

      // Redirect to login with specific error
      const errorUrl = new URL('/signin', request.url);
      errorUrl.searchParams.set('error', 'user_not_provisioned');
      return NextResponse.redirect(errorUrl);
    }

    // Check if user account is active
    if (!user.is_active) {
      apiLogger.logSecurity('saml_inactive_user', 'medium', {
        action: 'authentication_rejected',
        blocked: true,
        userId: user.user_id,
        reason: 'user_inactive'
      });

      logger.warn('SAML SSO attempt by inactive user', {
        requestId: authContext.requestId,
        userId: user.user_id,
        email: email.replace(/(.{2}).*@/, '$1***@')
      });

      await AuditLogger.logAuth({
        action: 'login_failed',
        userId: user.user_id,
        email,
        ipAddress,
        userAgent,
        metadata: {
          authMethod: 'saml',
          stage: 'user_validation',
          reason: 'user_inactive',
          correlationId: CorrelationContextManager.getCurrentId()
        }
      });

      throw AuthenticationError('Account is inactive');
    }

    logger.debug('User found and active', {
      requestId: authContext.requestId,
      userId: user.user_id,
      emailVerified: user.email_verified
    });

    // Generate device info (same as password login)
    const deviceGenStartTime = Date.now();
    const deviceFingerprint = TokenManager.generateDeviceFingerprint(ipAddress, userAgent);
    const deviceName = TokenManager.generateDeviceName(userAgent);

    const deviceInfo = {
      ipAddress,
      userAgent,
      fingerprint: deviceFingerprint,
      deviceName
    };
    logPerformanceMetric(logger, 'device_info_generation', Date.now() - deviceGenStartTime);

    logger.debug('Device information generated', {
      requestId: authContext.requestId,
      deviceName,
      fingerprintHash: deviceFingerprint.substring(0, 8) + '...'
    });

    // Get user's RBAC context to determine roles
    const rbacStartTime = Date.now();
    const userContext = await getCachedUserContextSafe(user.user_id);
    logPerformanceMetric(logger, 'rbac_context_fetch', Date.now() - rbacStartTime);

    logger.debug('User RBAC context loaded', {
      requestId: authContext.requestId,
      userId: user.user_id,
      roleCount: userContext?.roles?.length || 0,
      permissionCount: userContext?.all_permissions?.length || 0
    });

    // Create token pair (SAML logins get standard session, not remember-me)
    const tokenStartTime = Date.now();
    const tokenPair = await TokenManager.createTokenPair(
      user.user_id,
      deviceInfo,
      false, // rememberMe = false for SSO (standard 7-day session)
      email // Pass email for audit logging
    );
    logPerformanceMetric(logger, 'token_generation', Date.now() - tokenStartTime);

    // Set secure httpOnly cookies for both tokens (same as password login)
    const cookieStartTime = Date.now();
    const cookieStore = await cookies();
    const isSecureEnvironment = process.env.NODE_ENV === 'production';
    const maxAge = 7 * 24 * 60 * 60; // 7 days for SAML sessions

    logger.debug('Preparing authentication cookies', {
      requestId: authContext.requestId,
      nodeEnv: process.env.NODE_ENV,
      isSecureEnvironment,
      maxAge,
      refreshTokenLength: tokenPair.refreshToken.length,
      accessTokenLength: tokenPair.accessToken.length
    });

    // Set HTTP-only refresh token cookie
    cookieStore.set('refresh-token', tokenPair.refreshToken, {
      httpOnly: true,
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge
    });

    // Set secure access token cookie
    cookieStore.set('access-token', tokenPair.accessToken, {
      httpOnly: true, // ✅ SECURE: JavaScript cannot access this token
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60 // 15 minutes
    });

    // Verify cookies were set
    const refreshCookie = cookieStore.get('refresh-token');
    const accessCookie = cookieStore.get('access-token');

    const cookiesValid = !!refreshCookie?.value && !!accessCookie?.value;
    logPerformanceMetric(logger, 'cookie_setup', Date.now() - cookieStartTime, {
      cookiesSet: cookiesValid,
      refreshCookieLength: refreshCookie?.value?.length || 0,
      accessCookieLength: accessCookie?.value?.length || 0
    });

    if (!cookiesValid) {
      logger.error('Authentication cookies failed to set', {
        requestId: authContext.requestId,
        refreshCookieExists: !!refreshCookie,
        accessCookieExists: !!accessCookie
      });
      throw new Error('Failed to set authentication cookies');
    }

    logger.info('Authentication cookies set successfully', {
      requestId: authContext.requestId,
      userId: user.user_id,
      sessionId: tokenPair.sessionId
    });

    // Enhanced successful authentication logging
    apiLogger.logAuth('saml_authentication_success', true, {
      userId: user.user_id,
      method: 'session',
      ...(userContext?.current_organization_id && { 
        organizationId: userContext.current_organization_id 
      }),
      sessionDuration: maxAge, // 7 days in seconds
      permissions: userContext?.all_permissions?.map(p => p.name) || []
    });

    // Business intelligence logging
    apiLogger.logBusiness('saml_authentication', 'sessions', 'success', {
      recordsProcessed: 1,
      businessRules: [
        'saml_signature_verification',
        'tenant_isolation_check',
        'user_provisioning_check',
        'rbac_context_load'
      ],
      notifications: 0
    });

    // Security success event
    apiLogger.logSecurity('saml_authentication_successful', 'low', {
      action: 'authentication_granted',
      userId: user.user_id,
      reason: 'valid_saml_response'
    });

    // Log successful SAML login to audit system
    await AuditLogger.logAuth({
      action: 'login',
      userId: user.user_id,
      email,
      ipAddress,
      userAgent,
      metadata: {
        authMethod: 'saml',
        stage: 'callback_complete',
        sessionId: tokenPair.sessionId,
        deviceFingerprint,
        samlIssuer: validationResult.metadata.issuer,
        assertionID: validationResult.metadata.assertionID,
        correlationId: CorrelationContextManager.getCurrentId()
      }
    });

    const totalDuration = Date.now() - startTime;

    // Enhanced completion logging
    apiLogger.logResponse(302, {
      recordCount: 1,
      processingTimeBreakdown: {
        formDataParsing: formDataStartTime ? Date.now() - formDataStartTime : 0,
        samlValidation: samlValidationStartTime ? Date.now() - samlValidationStartTime : 0,
        databaseLookup: dbStartTime ? Date.now() - dbStartTime : 0,
        deviceInfoGeneration: deviceGenStartTime ? Date.now() - deviceGenStartTime : 0,
        rbacContextFetch: rbacStartTime ? Date.now() - rbacStartTime : 0,
        tokenGeneration: tokenStartTime ? Date.now() - tokenStartTime : 0,
        cookieSetup: cookieStartTime ? Date.now() - cookieStartTime : 0,
        total: totalDuration
      }
    });

    logger.info('SAML authentication completed successfully', {
      requestId: authContext.requestId,
      userId: user.user_id,
      totalDuration
    });

    // Return HTML with meta refresh to give browser time to process cookies
    // Direct server redirect causes middleware to check cookies before browser receives them
    const samlConfig = getSAMLConfig();
    const successUrl = samlConfig?.successRedirect || '/dashboard';
    
    const htmlResponse = new NextResponse(
      `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0;url=${successUrl}">
  <title>Authentication Successful</title>
</head>
<body>
  <p>Authentication successful. Redirecting...</p>
  <script>window.location.href = '${successUrl}';</script>
</body>
</html>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      }
    );
    
    // Set cookies on the HTML response
    htmlResponse.cookies.set('refresh-token', tokenPair.refreshToken, {
      httpOnly: true,
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge
    });
    
    htmlResponse.cookies.set('access-token', tokenPair.accessToken, {
      httpOnly: true,
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60 // 15 minutes
    });
    
    logger.info('SAML success response with cookies and client redirect', {
      requestId: authContext.requestId,
      redirectTo: successUrl,
      cookiesAttached: 2
    });
    
    return htmlResponse;

  } catch (error) {
    const totalDuration = Date.now() - startTime;

    logger.error('SAML callback failed', error, {
      totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    });

    logPerformanceMetric(logger, 'total_saml_callback_duration', totalDuration, {
      success: false,
      errorType: error instanceof Error ? error.name : 'unknown'
    });

    // Enhanced error logging
    apiLogger.logAuth('saml_callback_failed', false, {
      reason: error instanceof Error ? error.message : 'unknown_error'
    });

    apiLogger.logSecurity('saml_callback_failure', 'high', {
      action: 'saml_authentication_failed',
      blocked: true,
      threat: 'authentication_bypass_attempt',
      reason: error instanceof Error ? error.message : 'unknown'
    });

    // Audit log for failure
    await AuditLogger.logAuth({
      action: 'login_failed',
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      metadata: {
        authMethod: 'saml',
        stage: 'callback_processing',
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: CorrelationContextManager.getCurrentId()
      }
    });

    // Redirect back to login page with error
    // Use 303 status to change POST to GET
    const errorUrl = new URL('/signin', request.url);
    
    // Map errors to user-friendly messages
    if (error instanceof Error) {
      if (error.message.includes('not provisioned') || error.message.includes('not found')) {
        errorUrl.searchParams.set('error', 'user_not_provisioned');
      } else if (error.message.includes('inactive')) {
        errorUrl.searchParams.set('error', 'user_inactive');
      } else if (error.message.includes('issuer') || error.message.includes('tenant')) {
        errorUrl.searchParams.set('error', 'saml_validation_failed');
      } else {
        errorUrl.searchParams.set('error', 'saml_validation_failed');
      }
    } else {
      errorUrl.searchParams.set('error', 'saml_validation_failed');
    }

    return NextResponse.redirect(errorUrl, 303); // 303 = See Other (POST → GET)
  }
};

// Export as public route with correlation wrapper
// NOTE: This route is exempt from CSRF protection (Microsoft sends SAML response without our CSRF token)
// Security is provided by SAML signature validation instead
export const POST = publicRoute(
  withCorrelation(samlCallbackHandler),
  'SAML SSO callback - validates via SAML signature instead of CSRF',
  { rateLimit: 'auth' } // Strict rate limiting: 5 requests per 15 minutes
);
