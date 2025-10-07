import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/middleware/auth';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
import { createErrorResponse } from '@/lib/api/responses/error';
import { AuditLogger } from '@/lib/api/services/audit';
import { refreshTokenPair } from '@/lib/auth/token-manager';
import { correlation, log } from '@/lib/logger';
import { setCSRFToken } from '@/lib/security/csrf-unified';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

/**
 * Refresh Token Endpoint
 * Handles token rotation with sliding window expiration
 * SECURED: Requires authentication and token ownership validation
 */
const refreshHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  // Store refresh token for error handling (declared at function level)
  let refreshTokenForError: string | undefined;

  log.api('POST /api/auth/refresh - Token refresh initiated', request, 0, 0);

  try {
    // NOTE: We don't require auth header here since we're validating the refresh token cookie directly
    // This allows token refresh without needing a valid access token

    // Apply aggressive rate limiting for token refresh
    const rateLimitStart = Date.now();
    await applyRateLimit(request, 'auth');
    log.info('Rate limit check completed', { duration: Date.now() - rateLimitStart });

    // Get refresh token from httpOnly cookie
    const cookieStart = Date.now();
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh-token')?.value;
    log.info('Cookie retrieval completed', { duration: Date.now() - cookieStart });

    log.debug('Refresh token cookie check', {
      hasRefreshToken: !!refreshToken,
      tokenLength: refreshToken?.length || 0,
    });

    if (!refreshToken) {
      log.warn('Token refresh failed - no refresh token in cookie');
      log.auth('token_refresh', false, { reason: 'no_refresh_token' });
      return createErrorResponse('Refresh token not found', 401, request);
    }

    // Store refresh token for error handling
    refreshTokenForError = refreshToken;

    // Authenticate user from refresh token
    let userId: string;
    try {
      const tokenValidationStart = Date.now();
      const { verifyRefreshToken } = await import('@/lib/auth/token-verification');
      const payload = await verifyRefreshToken(refreshToken);

      if (!payload) {
        throw new Error('Invalid or expired refresh token');
      }

      userId = payload.userId;
      log.info('Refresh token validation completed', {
        duration: Date.now() - tokenValidationStart,
      });

      log.debug('Refresh token validated successfully', {
        userId,
        tokenExpiry: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'unknown',
      });
    } catch (tokenError) {
      // Security logging for token validation failure
      log.security('token_validation_failure', 'high', {
        action: 'refresh_token_invalid',
        blocked: true,
        threat: 'credential_attack',
        reason: 'invalid_refresh_token',
      });

      log.error('Refresh token validation failed', tokenError, {
        tokenLength: refreshToken.length,
        errorType: tokenError instanceof Error ? tokenError.constructor.name : typeof tokenError,
      });
      log.auth('token_refresh', false, { reason: 'invalid_refresh_token' });
      return createErrorResponse('Invalid refresh token', 401, request);
    }

    // Get user details from database
    const dbStart = Date.now();
    const db = (await import('@/lib/db')).db;
    const users = (await import('@/lib/db')).users;
    const [user] = await db
      .select()
      .from(users)
      .where((await import('drizzle-orm')).eq(users.user_id, userId))
      .limit(1);
    log.db('SELECT', 'users', Date.now() - dbStart, { userId });

    if (!user || !user.is_active) {
      log.warn('Token refresh failed - user not found or inactive', {
        userId,
        userExists: !!user,
        userActive: user?.is_active || false,
      });
      log.auth('token_refresh', false, {
        userId,
        reason: user ? 'user_inactive' : 'user_not_found',
      });
      return createErrorResponse('User account is inactive', 401, request);
    }

    log.debug('Active user found for token refresh', {
      userId: user.user_id,
      userEmail: user.email?.replace(/(.{2}).*@/, '$1***@'), // Mask email
      emailVerified: user.email_verified,
    });

    // Get user's RBAC context for complete user data
    const contextStart = Date.now();
    const { getUserContextSafe } = await import('@/lib/rbac/user-context');
    const userContext = await getUserContextSafe(user.user_id);
    log.info('RBAC context fetched', { duration: Date.now() - contextStart, userId });

    // Extract device info
    const deviceStart = Date.now();
    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const deviceInfo = extractRequestMetadata(request);
    log.info('Device info generated', { duration: Date.now() - deviceStart });

    log.debug('Device information generated for token refresh', {
      userId,
      deviceName: deviceInfo.deviceName,
      fingerprintHash: `${deviceInfo.fingerprint.substring(0, 8)}...`,
    });

    // Rotate tokens
    const tokenRotationStart = Date.now();
    const tokenPair = await refreshTokenPair(refreshToken, deviceInfo);
    log.info('Token rotation completed', { duration: Date.now() - tokenRotationStart, userId });

    if (!tokenPair) {
      log.warn('Token rotation failed', {
        userId,
        deviceFingerprint: `${deviceInfo.fingerprint.substring(0, 8)}...`,
        deviceName: deviceInfo.deviceName,
      });

      // AUDIT LOGGING: Log failed refresh attempt with authenticated user info
      await AuditLogger.logUserAction({
        action: 'token_refresh_failed',
        userId: userId,
        resourceType: 'session',
        resourceId: 'current',
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
        metadata: {
          reason: 'invalid_refresh_token',
          deviceFingerprint: deviceInfo.fingerprint,
          deviceName: deviceInfo.deviceName,
          correlationId: correlation.current(),
        },
      });

      log.auth('token_refresh', false, { userId, reason: 'token_rotation_failed' });
      return createErrorResponse('Invalid or expired refresh token', 401, request);
    }

    log.info('Token rotation successful', {
      userId,
      sessionId: tokenPair.sessionId,
      newTokensGenerated: true,
    });

    // AUDIT LOGGING: Log successful token refresh
    await AuditLogger.logUserAction({
      action: 'token_refresh_success',
      userId: userId,
      resourceType: 'session',
      resourceId: tokenPair.sessionId,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      metadata: {
        deviceFingerprint: deviceInfo.fingerprint,
        deviceName: deviceInfo.deviceName,
        expiresAt: tokenPair.expiresAt.toISOString(),
        correlationId: correlation.current(),
      },
    });

    // Get the user's actual assigned roles
    const userRoles = userContext?.roles?.map((r) => r.name) || [];
    const primaryRole = userRoles.length > 0 ? userRoles[0] : 'user';

    log.debug('User roles and permissions loaded', {
      userId,
      roleCount: userRoles.length,
      primaryRole,
      permissionCount: userContext?.all_permissions?.length || 0,
    });

    // Generate new authenticated CSRF token as part of token rotation
    const csrfToken = await setCSRFToken(user.user_id);

    // Set new refresh token in httpOnly cookie and return user data
    const _responseStart = Date.now();
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.user_id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          firstName: user.first_name,
          lastName: user.last_name,
          role: primaryRole,
          emailVerified: user.email_verified,
          roles: userRoles,
          permissions: userContext?.all_permissions?.map((p) => p.name) || [],
        },
        accessToken: tokenPair.accessToken,
        expiresAt: tokenPair.expiresAt.toISOString(),
        sessionId: tokenPair.sessionId,
        csrfToken, // Include refreshed CSRF token
      },
      message: 'Tokens refreshed successfully',
      meta: { timestamp: new Date().toISOString() },
    });

    // Set secure cookies for both tokens
    const cookieSetupStart = Date.now();
    // Use NODE_ENV to determine cookie security (staging should use NODE_ENV=production)
    const isSecureEnvironment = process.env.NODE_ENV === 'production';

    log.debug('Preparing refresh token cookies', {
      userId,
      sessionId: tokenPair.sessionId,
      nodeEnv: process.env.NODE_ENV,
      environment: process.env.ENVIRONMENT,
      isSecureEnvironment,
      refreshTokenLength: tokenPair.refreshToken.length,
      accessTokenLength: tokenPair.accessToken.length,
    });

    // Set HTTP-only refresh token cookie (server-only)
    response.cookies.set('refresh-token', tokenPair.refreshToken, {
      httpOnly: true,
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days (will be shorter for standard mode)
    });

    // Set secure access token cookie (server-only, secure)
    response.cookies.set('access-token', tokenPair.accessToken, {
      httpOnly: true, // ✅ SECURE: JavaScript cannot access this token
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60, // 15 minutes
    });

    log.info('Cookie setup completed', {
      duration: Date.now() - cookieSetupStart,
      userId,
      sessionId: tokenPair.sessionId,
    });

    const totalDuration = Date.now() - startTime;
    log.info('Token refresh completed successfully', {
      userId,
      sessionId: tokenPair.sessionId,
      totalDuration,
      roleCount: userRoles.length,
    });

    log.auth('token_refresh', true, { userId });
    log.info('Total refresh duration', {
      duration: totalDuration,
      userId,
      success: true,
    });

    return response;
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Token refresh failed with error', error, {
      totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      hasRefreshToken: !!refreshTokenForError,
    });

    // Extract device info for logging
    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);

    // Try to extract userId from the failed refresh token if possible
    let failedUserId = 'unknown';
    try {
      if (refreshTokenForError) {
        const { extractUserIdUnsafe } = await import('@/lib/auth/token-verification');
        const extractedUserId = await extractUserIdUnsafe(refreshTokenForError);
        if (extractedUserId) {
          failedUserId = extractedUserId;
          log.debug('Extracted user ID from failed refresh token', {
            userId: failedUserId,
          });
        }
      }
    } catch (tokenError) {
      log.debug('Could not extract user ID from refresh token', {
        tokenError: tokenError instanceof Error ? tokenError.message : 'unknown',
      });
    }

    // Try to get user info from the request (may not be available if auth failed)
    try {
      const _session = await requireAuth(request);
      await AuditLogger.logUserAction({
        action: 'token_refresh_error',
        userId: failedUserId,
        resourceType: 'session',
        resourceId: 'unknown',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          correlationId: correlation.current(),
        },
      });
    } catch (authError) {
      // If we can't get authenticated user, log as anonymous security event
      log.warn('Logging refresh error as security event due to auth failure', {
        authError: authError instanceof Error ? authError.message : 'unknown',
      });

      await AuditLogger.logSecurity({
        action: 'token_refresh_error',
        ipAddress: metadata.ipAddress,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          authFailed: true,
          correlationId: correlation.current(),
        },
        severity: 'medium',
      });
    }

    log.info('Total refresh duration', {
      duration: totalDuration,
      success: false,
      errorType: error instanceof Error ? error.name : 'unknown',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// Export handler directly (correlation ID automatically added by middleware)
export const POST = refreshHandler;
