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
import { log, correlation } from '@/lib/logger';
import { AuditLogger } from '@/lib/api/services/audit';
import { createTokenPair, generateDeviceFingerprint, generateDeviceName } from '@/lib/auth/token-manager';
import { getCachedUserContextSafe } from '@/lib/rbac/cached-user-context';
import { setCSRFToken } from '@/lib/security/csrf-unified';
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

  log.api('POST /api/auth/saml/callback - SAML callback initiated', request, 0, 0);

  try {
    // Check if SAML is enabled
    if (!isSAMLEnabled()) {
      log.security('saml_callback_rejected', 'medium', {
        action: 'saml_callback_attempted',
        blocked: true,
        reason: 'saml_not_configured'
      });

      log.warn('SAML callback received but SAML is not configured');

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
      requestId: correlation.current() || 'unknown',
      ipAddress,
      userAgent,
      timestamp: new Date()
    };

    log.info('SAML callback processing started', {
      requestId: authContext.requestId,
      ipAddress
    });

    // Parse form data (SAML response comes as form POST)
    const formDataStartTime = Date.now();
    const formData = await request.formData();
    const samlResponse = formData.get('SAMLResponse');
    log.info('Form data parsing completed', { duration: Date.now() - formDataStartTime });

    if (!samlResponse || typeof samlResponse !== 'string') {
      log.security('saml_response_missing', 'high', {
        action: 'invalid_saml_callback',
        blocked: true,
        threat: 'malformed_request',
        reason: 'no_saml_response'
      });

      log.error('No SAML response in callback request');

      throw AuthenticationError('Invalid SAML callback - no SAML response');
    }

    log.debug('SAML response received', {
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
    
    log.info('SAML validation completed', {
      duration: Date.now() - samlValidationStartTime,
      signatureValid: validationResult.validations.signatureValid,
      issuerValid: validationResult.validations.issuerValid,
      allChecks: Object.keys(validationResult.validations).length
    });

    if (!validationResult.success || !validationResult.profile) {
      // SAML validation failed - security event
      log.security('saml_validation_failed', 'high', {
        action: 'authentication_rejected',
        blocked: true,
        threat: 'invalid_saml_response',
        reason: validationResult.error || 'validation_failed'
      });

      log.error('SAML validation failed', new Error(validationResult.error || 'Unknown error'), {
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
          correlationId: correlation.current()
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
      log.security('saml_profile_validation_failed', 'high', {
        action: 'authentication_rejected',
        blocked: true,
        threat: 'invalid_profile_data',
        reason: `profile_validation_failed: ${profileValidation.errors.join(', ')}`
      });

      log.error('SAML profile validation failed', new Error('Invalid profile data'), {
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
          correlationId: correlation.current()
        }
      });

      throw AuthenticationError('Invalid profile data');
    }

    // Use sanitized email from validation
    const email = profileValidation.sanitized!.email;

    log.info('SAML validation successful', {
      requestId: authContext.requestId,
      email: email.replace(/(.{2}).*@/, '$1***@'), // PII masking
      issuer: profile.issuer,
      allValidationsPassed: Object.values(validationResult.validations).every(v => v)
    });

    // Enhanced SAML validation success logging
    log.auth('saml_validation_success', true, {
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

    log.info('Replay attack check completed', {
      duration: Date.now() - replayCheckStartTime,
      safe: replayCheck.safe
    });

    if (!replayCheck.safe) {
      // REPLAY ATTACK DETECTED - This is a critical security event
      log.security('saml_replay_attack_detected', 'critical', {
        action: 'authentication_rejected',
        blocked: true,
        threat: 'replay_attack',
        reason: replayCheck.reason || 'replay_detected'
      });

      log.error('SAML replay attack detected', new Error('Replay attack'), {
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
          correlationId: correlation.current(),
          severity: 'critical'
        }
      });

      throw AuthenticationError('Authentication failed - security violation detected');
    }

    log.info('SAML replay check passed', {
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
    
    log.db('SELECT', 'users', Date.now() - dbStartTime, {
      userFound: !!user
    });

    if (!user) {
      // User not pre-provisioned - security event
      log.security('saml_user_not_provisioned', 'medium', {
        action: 'authentication_rejected',
        blocked: true,
        threat: 'unauthorized_access',
        reason: 'user_not_found'
      });

      log.warn('SAML SSO attempt by non-provisioned user', {
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
          correlationId: correlation.current()
        }
      });

      // Redirect to login with specific error
      const errorUrl = new URL('/signin', request.url);
      errorUrl.searchParams.set('error', 'user_not_provisioned');
      return NextResponse.redirect(errorUrl);
    }

    // Check if user account is active
    if (!user.is_active) {
      log.security('saml_inactive_user', 'medium', {
        action: 'authentication_rejected',
        blocked: true,
        userId: user.user_id,
        reason: 'user_inactive'
      });

      log.warn('SAML SSO attempt by inactive user', {
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
          correlationId: correlation.current()
        }
      });

      throw AuthenticationError('Account is inactive');
    }

    log.debug('User found and active', {
      requestId: authContext.requestId,
      userId: user.user_id,
      emailVerified: user.email_verified
    });

    // Generate device info (same as password login)
    const deviceGenStartTime = Date.now();
    const deviceFingerprint = generateDeviceFingerprint(ipAddress, userAgent);
    const deviceName = generateDeviceName(userAgent);

    const deviceInfo = {
      ipAddress,
      userAgent,
      fingerprint: deviceFingerprint,
      deviceName
    };
    log.info('Device info generated', { duration: Date.now() - deviceGenStartTime });

    log.debug('Device information generated', {
      requestId: authContext.requestId,
      deviceName,
      fingerprintHash: deviceFingerprint.substring(0, 8) + '...'
    });

    // Get user's RBAC context to determine roles
    const rbacStartTime = Date.now();
    const userContext = await getCachedUserContextSafe(user.user_id);
    log.info('RBAC context fetched', { duration: Date.now() - rbacStartTime });

    log.debug('User RBAC context loaded', {
      requestId: authContext.requestId,
      userId: user.user_id,
      roleCount: userContext?.roles?.length || 0,
      permissionCount: userContext?.all_permissions?.length || 0
    });

    // Create token pair (SAML logins get standard session, not remember-me)
    const tokenStartTime = Date.now();
    const tokenPair = await createTokenPair(
      user.user_id,
      deviceInfo,
      false, // rememberMe = false for SSO (standard 7-day session)
      email // Pass email for audit logging
    );
    log.info('Token generation completed', { duration: Date.now() - tokenStartTime });

    // Set secure httpOnly cookies for both tokens (same as password login)
    const cookieStartTime = Date.now();
    const cookieStore = await cookies();
    const isSecureEnvironment = process.env.NODE_ENV === 'production';
    const maxAge = 7 * 24 * 60 * 60; // 7 days for SAML sessions

    log.debug('Preparing authentication cookies', {
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
    log.info('Cookie setup completed', {
      duration: Date.now() - cookieStartTime,
      cookiesSet: cookiesValid,
      refreshCookieLength: refreshCookie?.value?.length || 0,
      accessCookieLength: accessCookie?.value?.length || 0
    });

    if (!cookiesValid) {
      log.error('Authentication cookies failed to set', undefined, {
        requestId: authContext.requestId,
        refreshCookieExists: !!refreshCookie,
        accessCookieExists: !!accessCookie
      });
      throw new Error('Failed to set authentication cookies');
    }

    log.info('Authentication cookies set successfully', {
      requestId: authContext.requestId,
      userId: user.user_id,
      sessionId: tokenPair.sessionId
    });

    // Enhanced successful authentication logging
    log.auth('saml_authentication_success', true, {
      userId: user.user_id,
      method: 'session',
      ...(userContext?.current_organization_id && {
        organizationId: userContext.current_organization_id
      }),
      sessionDuration: maxAge, // 7 days in seconds
      permissions: userContext?.all_permissions?.map(p => p.name) || []
    });

    // Security success event
    log.security('saml_authentication_successful', 'low', {
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
        correlationId: correlation.current()
      }
    });

    const totalDuration = Date.now() - startTime;

    log.info('SAML authentication completed successfully', {
      requestId: authContext.requestId,
      userId: user.user_id,
      totalDuration
    });

    // Return inline HTML with CSP-compliant styling to give browser time to process cookies
    // This approach avoids middleware interference and ensures reliable cookie delivery
    const samlConfig = getSAMLConfig();
    const successUrl = samlConfig?.successRedirect || '/dashboard';

    // Get CSP nonces from request headers (set by middleware)
    const scriptNonce = request.headers.get('x-script-nonce') || '';
    const styleNonce = request.headers.get('x-style-nonce') || '';

    // Create styled HTML response with nonces for CSP compliance
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Successful</title>
  <style nonce="${styleNonce}">
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      background: #ffffff;
      color: #1f2937;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    @media (prefers-color-scheme: dark) {
      body {
        background: #111827;
        color: #f9fafb;
      }
    }
    .container {
      text-align: center;
      padding: 2rem;
      max-width: 400px;
    }
    h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 1.5rem;
      color: #1f2937;
    }
    @media (prefers-color-scheme: dark) {
      h1 {
        color: #f9fafb;
      }
    }
    .message {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: #6b7280;
      font-size: 1rem;
    }
    @media (prefers-color-scheme: dark) {
      .message {
        color: #9ca3af;
      }
    }
    .checkmark {
      width: 1.25rem;
      height: 1.25rem;
      color: #10b981;
    }
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .container {
      animation: fadeIn 0.5s ease-out;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authenticated!</h1>
    <div class="message">
      <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
      </svg>
      <span>Redirecting to dashboard...</span>
    </div>
  </div>
  <script nonce="${scriptNonce}">
    // Redirect after short delay to allow cookie processing
    setTimeout(function() {
      window.location.href = '${successUrl}';
    }, 1000);
  </script>
</body>
</html>`;

    const htmlResponse = new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });

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

    log.info('SAML success response with cookies and inline HTML', {
      requestId: authContext.requestId,
      redirectTo: successUrl,
      cookiesAttached: 2,
      hasScriptNonce: !!scriptNonce,
      hasStyleNonce: !!styleNonce
    });

    return htmlResponse;

  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('SAML callback failed', error, {
      totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    });

    // Enhanced error logging
    log.auth('saml_callback_failed', false, {
      reason: error instanceof Error ? error.message : 'unknown_error'
    });

    log.security('saml_callback_failure', 'high', {
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
        correlationId: correlation.current()
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

// Export handler directly (correlation ID automatically added by middleware)
// NOTE: This route is exempt from CSRF protection (Microsoft sends SAML response without our CSRF token)
// Security is provided by SAML signature validation instead
export const POST = publicRoute(
  samlCallbackHandler,
  'SAML SSO callback - validates via SAML signature instead of CSRF',
  { rateLimit: 'auth' } // Strict rate limiting: 5 requests per 15 minutes
);
