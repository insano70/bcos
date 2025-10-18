/**
 * OIDC Callback Endpoint
 *
 * Handles the OIDC callback from Microsoft Entra after user authentication.
 *
 * Security Features (ALL CRITICAL):
 * - Session decryption (iron-session) - validates encrypted session data
 * - One-time state token validation - prevents replay attacks
 * - Device fingerprint validation - prevents session hijacking
 * - Explicit ID token validation - defense-in-depth token checks
 * - Email domain validation - organization access control
 * - Input sanitization - defense against injection attacks
 *
 * Flow:
 * 1. User authenticates with Microsoft Entra
 * 2. Entra redirects here with code and state
 * 3. Decrypt and validate session data
 * 4. Validate state (one-time use, CSRF protection)
 * 5. Validate device fingerprint (session hijacking prevention)
 * 6. Exchange code for tokens (PKCE validation)
 * 7. Validate ID token claims (defense-in-depth)
 * 8. Validate email domain
 * 9. Lookup/create user in database
 * 10. Create internal JWT tokens
 * 11. Set auth cookies and redirect
 *
 * @route GET /api/auth/oidc/callback
 * @access Public (unauthenticated, but validates session)
 */

import { unsealData } from 'iron-session';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { publicRoute } from '@/lib/api/route-handlers';
import { AuditLogger } from '@/lib/api/services/audit';
import { validateAuthProfile } from '@/lib/auth/input-validator';
import { getOIDCConfig } from '@/lib/env';
import { correlation, log } from '@/lib/logger';
import { getOIDCClient } from '@/lib/oidc/client';
import { databaseStateManager } from '@/lib/oidc/database-state-manager';
import { SessionError, StateValidationError } from '@/lib/oidc/errors';
import type { OIDCSessionData } from '@/lib/oidc/types';
import { createAuthSession } from '@/lib/services/auth/session-manager-service';
import { lookupSSOUser, validateEmailDomain } from '@/lib/services/auth/sso-auth-service';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * OIDC Callback Handler
 *
 * Exchanges authorization code for tokens and creates user session.
 */
const oidcCallbackHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  log.api('GET /api/auth/oidc/callback - OIDC callback received', request, 0, 0);

  // Use APP_URL for all redirects to avoid internal hostname issues behind load balancer
  // APP_URL is a runtime environment variable (not NEXT_PUBLIC_ which is build-time)
  const baseUrl = process.env.APP_URL || request.url;

  try {
    // ===== 1. Extract Callback Parameters =====
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const error = request.nextUrl.searchParams.get('error');
    const errorDescription = request.nextUrl.searchParams.get('error_description');

    // Check for provider errors
    if (error) {
      log.error('OIDC callback failed - provider error', new Error(errorDescription || error), {
        operation: 'oidc_callback',
        success: false,
        reason: 'provider_error',
        errorCode: error,
        errorDescription: errorDescription || 'no description provided',
        duration: Date.now() - startTime,
        component: 'auth',
        severity: 'medium',
        securityContext: {
          threat: 'authentication_failure',
          blocked: true,
        },
      });

      await AuditLogger.logAuth({
        action: 'login_failed',
        metadata: {
          authMethod: 'oidc',
          reason: 'provider_error',
          error,
          errorDescription,
        },
      });

      return NextResponse.redirect(
        new URL(`/signin?error=oidc_provider_error&message=${encodeURIComponent(error)}`, baseUrl)
      );
    }

    // Validate required parameters
    if (!code || !state) {
      log.error('OIDC callback missing required parameters', {
        hasCode: !!code,
        hasState: !!state,
      });

      return NextResponse.redirect(new URL('/signin?error=oidc_callback_failed', baseUrl));
    }

    // ===== 2. Retrieve and Decrypt Session Data (CRITICAL SECURITY) =====
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('oidc-session');

    if (!sessionCookie) {
      log.error('OIDC session cookie not found');
      throw new SessionError('OIDC session expired or not found');
    }

    const sessionSecret = process.env.OIDC_SESSION_SECRET;
    if (!sessionSecret) {
      throw new SessionError('OIDC_SESSION_SECRET not configured');
    }

    let sessionData: OIDCSessionData;
    try {
      sessionData = await unsealData<OIDCSessionData>(sessionCookie.value, {
        password: sessionSecret,
      });
    } catch (error) {
      log.error('Failed to decrypt OIDC session', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw new SessionError('OIDC session decryption failed - possible tampering');
    }

    // Delete session cookie (one-time use)
    cookieStore.delete('oidc-session');

    // ===== 3. Validate State (CSRF Protection) =====
    if (state !== sessionData.state) {
      log.error('OIDC state mismatch', {
        received: state.substring(0, 8),
        expected: sessionData.state.substring(0, 8),
      });

      await AuditLogger.logAuth({
        action: 'login_failed',
        metadata: {
          authMethod: 'oidc',
          reason: 'state_mismatch',
          alert: 'POSSIBLE_CSRF_ATTACK',
        },
      });

      throw new StateValidationError('State parameter mismatch');
    }

    // ===== 4. Validate State One-Time Use (CRITICAL - OIDC Spec Compliance) =====
    // Database-backed validation for horizontal scaling
    const isValid = await databaseStateManager.validateAndMarkUsed(state);
    if (!isValid) {
      log.error(
        'OIDC callback blocked - state token replay detected',
        new Error('State replay attack'),
        {
          operation: 'oidc_callback',
          success: false,
          reason: 'state_replay',
          statePrefix: state.substring(0, 8),
          duration: Date.now() - startTime,
          component: 'auth',
          severity: 'high',
          securityContext: {
            threat: 'replay_attack',
            blocked: true,
            alert: 'CRITICAL_SECURITY_EVENT',
            description: 'State token was already used or expired - possible replay attack',
          },
        }
      );

      await AuditLogger.logAuth({
        action: 'login_failed',
        metadata: {
          authMethod: 'oidc',
          reason: 'state_replay',
          state: state.substring(0, 8),
          alert: 'REPLAY_ATTACK_DETECTED',
        },
      });

      throw new StateValidationError('State token invalid, expired, or already used');
    }

    // ===== 5. Validate Device Fingerprint (Session Hijacking Prevention) =====
    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const currentMetadata = extractRequestMetadata(request);
    const currentFingerprint = currentMetadata.fingerprint;

    const strictMode = process.env.OIDC_STRICT_FINGERPRINT === 'true';

    if (sessionData.fingerprint !== currentFingerprint) {
      if (strictMode) {
        // Reject in strict mode
        log.error(
          'OIDC callback blocked - session hijack detected',
          new Error('Session hijack attempt'),
          {
            operation: 'oidc_callback',
            success: false,
            reason: 'session_hijack',
            expectedFingerprint: sessionData.fingerprint.substring(0, 16),
            receivedFingerprint: currentFingerprint.substring(0, 16),
            ...(currentMetadata.ipAddress && { ipAddress: currentMetadata.ipAddress }),
            duration: Date.now() - startTime,
            component: 'auth',
            severity: 'critical',
            securityContext: {
              threat: 'session_hijacking',
              blocked: true,
              alert: 'CRITICAL_SECURITY_EVENT',
              description: 'Device fingerprint mismatch indicates session hijack attempt',
              strictMode: true,
            },
          }
        );

        await AuditLogger.logAuth({
          action: 'login_failed',
          ipAddress: currentMetadata.ipAddress,
          userAgent: currentMetadata.userAgent,
          metadata: {
            authMethod: 'oidc',
            reason: 'session_hijack',
            alert: 'SESSION_HIJACK_ATTEMPT',
          },
        });

        return NextResponse.redirect(new URL('/signin?error=oidc_session_hijack', baseUrl));
      }

      // Log warning in normal mode (mobile networks can change IPs)
      log.warn('OIDC session fingerprint changed - allowing due to relaxed mode', {
        operation: 'oidc_callback',
        reason: 'fingerprint_mismatch',
        expectedFingerprint: sessionData.fingerprint.substring(0, 16),
        receivedFingerprint: currentFingerprint.substring(0, 16),
        strictMode: false,
        component: 'auth',
        severity: 'low',
        note: 'Mobile networks can change IPs - monitor for abuse',
      });
    }

    // ===== 6. Exchange Code for Tokens (PKCE Validation) =====
    const oidcClient = await getOIDCClient();

    // Pass the full callback URL to the OIDC client
    // The openid-client library needs the actual request URL, not reconstructed params
    const callbackUrl = new URL(request.url);

    const userInfo = await oidcClient.handleCallback(
      callbackUrl,
      sessionData.state,
      sessionData.nonce,
      sessionData.codeVerifier
    );

    // Note: Email verification already validated in handleCallback()

    log.info('OIDC token exchange successful', {
      email: userInfo.email.replace(/(.{2}).*@/, '$1***@'),
      emailVerified: userInfo.emailVerified,
    });

    // ===== 7. Validate Email Domain (Organization Access Control) =====
    const config = getOIDCConfig();
    const allowedDomains = config?.allowedEmailDomains || [];

    if (allowedDomains.length > 0) {
      const isAllowed = validateEmailDomain(userInfo.email, allowedDomains);

      if (!isAllowed) {
        log.warn('OIDC email domain not allowed', {
          email: userInfo.email.replace(/(.{2}).*@/, '$1***@'),
          allowedDomains,
        });

        await AuditLogger.logAuth({
          action: 'login_failed',
          email: userInfo.email,
          ipAddress: currentMetadata.ipAddress,
          userAgent: currentMetadata.userAgent,
          metadata: {
            authMethod: 'oidc',
            reason: 'email_domain_not_allowed',
          },
        });

        return NextResponse.redirect(new URL('/signin?error=oidc_domain_not_allowed', baseUrl));
      }
    }

    // ===== 8. Validate and Sanitize Profile Data (Defense-in-Depth) =====
    const validationResult = validateAuthProfile(
      {
        email: userInfo.email,
        displayName: userInfo.name,
        givenName: userInfo.givenName,
        surname: userInfo.familyName,
      },
      'oidc'
    );

    if (!validationResult.valid) {
      log.error('OIDC profile validation failed', {
        errors: validationResult.errors,
        email: userInfo.email.replace(/(.{2}).*@/, '$1***@'),
      });

      await AuditLogger.logAuth({
        action: 'login_failed',
        email: userInfo.email,
        metadata: {
          authMethod: 'oidc',
          reason: 'profile_validation_failed',
          errors: validationResult.errors,
        },
      });

      return NextResponse.redirect(new URL('/signin?error=oidc_invalid_profile', baseUrl));
    }

    if (!validationResult.sanitized) {
      log.error('OIDC profile validation succeeded but sanitized profile is missing');
      return NextResponse.redirect(new URL('/signin?error=oidc_invalid_profile', baseUrl));
    }

    const sanitizedProfile = validationResult.sanitized;

    // ===== 9. Lookup User in Database Using Service Layer =====
    let existingUser: Awaited<ReturnType<typeof lookupSSOUser>>;
    try {
      existingUser = await lookupSSOUser(
        sanitizedProfile.email,
        'oidc',
        currentMetadata.ipAddress,
        currentMetadata.userAgent
      );
    } catch (error) {
      // Handle specific SSO errors (user not found, inactive, etc.)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not found') || errorMessage.includes('not provisioned')) {
        return NextResponse.redirect(new URL('/signin?error=user_not_provisioned', baseUrl));
      }

      if (errorMessage.includes('inactive') || errorMessage.includes('not active')) {
        return NextResponse.redirect(new URL('/signin?error=user_inactive', baseUrl));
      }

      // Generic error
      return NextResponse.redirect(new URL('/signin?error=oidc_callback_failed', baseUrl));
    }

    // ===== 10. Create Internal JWT Tokens Using Service Layer =====
    const deviceInfo = {
      ipAddress: currentMetadata.ipAddress,
      userAgent: currentMetadata.userAgent,
      fingerprint: currentMetadata.fingerprint,
      deviceName: currentMetadata.deviceName,
    };

    const tokens = await createAuthSession({
      userId: existingUser.user_id,
      deviceInfo,
      rememberMe: false, // rememberMe = false for SSO
      email: sanitizedProfile.email,
      authMethod: 'oidc',
    });

    // ===== 11. Success Log with Security Validation Metrics =====
    // Note: Audit log is created by createTokenPair() above
    // Enriched success log with complete security validation metrics
    log.info('OIDC callback successful - user authenticated', {
      operation: 'oidc_callback',
      success: true,
      userId: existingUser.user_id,
      email: sanitizedProfile.email.replace(/(.{2}).*@/, '$1***@'),
      authMethod: 'oidc',
      sessionId: tokens.sessionId,
      ...(currentMetadata.ipAddress && { ipAddress: currentMetadata.ipAddress }),
      ...(currentMetadata.userAgent && { userAgent: currentMetadata.userAgent }),
      deviceName: currentMetadata.deviceName,
      deviceFingerprint: currentMetadata.fingerprint.substring(0, 8),
      securityValidations: {
        sessionDecryption: 'passed',
        stateCsrfProtection: 'passed',
        stateReplayPrevention: 'passed',
        deviceFingerprintCheck:
          sessionData.fingerprint === currentFingerprint ? 'passed' : 'warning',
        pkceValidation: 'passed',
        emailVerification: userInfo.emailVerified ? 'verified' : 'unverified',
        emailDomain: allowedDomains.length > 0 ? 'validated' : 'unrestricted',
        profileSanitization: 'passed',
        userProvisioning: 'existing',
        userActiveStatus: 'active',
      },
      duration: Date.now() - startTime,
      component: 'auth',
      severity: 'info',
    });

    // ===== 12. Set Auth Cookies and Redirect =====
    // Set cookies using cookies() API for reliability
    // IMPORTANT: Cookie names must match middleware expectations (access-token, refresh-token with hyphens)
    // SECURITY: Use 'strict' sameSite for maximum CSRF protection (consistent with password login)
    const isSecureEnvironment = process.env.NODE_ENV === 'production';

    cookieStore.set('access-token', tokens.accessToken, {
      httpOnly: true,
      secure: isSecureEnvironment,
      sameSite: 'strict', // CRITICAL: Prevents CSRF attacks
      maxAge: 60 * 15, // 15 minutes
      path: '/',
    });

    cookieStore.set('refresh-token', tokens.refreshToken, {
      httpOnly: true,
      secure: isSecureEnvironment,
      sameSite: 'strict', // CRITICAL: Prevents CSRF attacks
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    // Redirect to authenticating page which waits for auth state before final redirect
    // This eliminates white page flashes and cookie race conditions
    // OPTIMIZATION: Resolve default dashboard server-side to eliminate intermediate loading screen
    const { getDefaultReturnUrl } = await import('@/lib/services/default-dashboard-service');
    const finalReturnUrl = await getDefaultReturnUrl(sessionData.returnUrl);

    const authenticatingUrl = new URL('/authenticating', baseUrl);
    authenticatingUrl.searchParams.set('returnUrl', finalReturnUrl);

    log.info('OIDC callback redirect', {
      requestedReturnUrl: sessionData.returnUrl,
      resolvedReturnUrl: finalReturnUrl,
      baseUrl,
      finalRedirect: authenticatingUrl.toString(),
    });

    return NextResponse.redirect(authenticatingUrl);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('OIDC callback failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.constructor.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
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
        reason: 'callback_failed',
        error: error instanceof Error ? error.message : 'Unknown',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        requestId: correlation.current(),
      },
    });

    // Redirect to signin with appropriate error
    const errorMessage =
      error instanceof SessionError
        ? 'oidc_callback_failed'
        : error instanceof StateValidationError
          ? 'oidc_state_replay'
          : 'oidc_callback_failed';

    return NextResponse.redirect(new URL(`/signin?error=${errorMessage}`, baseUrl));
  }
};

// Export as GET endpoint with public route handler
export const GET = publicRoute(oidcCallbackHandler, 'OIDC callback', {
  rateLimit: 'auth',
});
