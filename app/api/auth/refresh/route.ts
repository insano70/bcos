import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { publicRoute } from '@/lib/api/route-handlers';
import { AuditLogger } from '@/lib/api/services/audit';
import { refreshTokenPair } from '@/lib/auth/tokens';
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

  try {
    // NOTE: We don't require auth header here since we're validating the refresh token cookie directly
    // This allows token refresh without needing a valid access token
    // Rate limiting is applied by publicRoute wrapper

    // Get refresh token from httpOnly cookie
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh-token')?.value;

    if (!refreshToken) {
      // Enriched auth log - no refresh token
      log.warn('Token refresh failed: no_refresh_token', {
        operation: 'token_refresh',
        success: false,
        reason: 'no_refresh_token',
        ...(request.headers.get('x-forwarded-for') && {
          ipAddress: request.headers.get('x-forwarded-for'),
        }),
        ...(request.headers.get('user-agent') && { userAgent: request.headers.get('user-agent') }),
        cookiePresent: false,
        duration: Date.now() - startTime,
        component: 'auth',
        severity: 'low',
      });
      return createErrorResponse('Refresh token not found', 401, request);
    }

    // Store refresh token for error handling
    refreshTokenForError = refreshToken;

    // Authenticate user from refresh token
    let userId: string;
    let tokenPayload: { userId: string; exp?: number; iat?: number };
    try {
      const { verifyRefreshToken } = await import('@/lib/auth/token-verification');
      const payload = await verifyRefreshToken(refreshToken);

      if (!payload) {
        throw new Error('Invalid or expired refresh token');
      }

      userId = payload.userId;
      tokenPayload = payload;
    } catch (tokenError) {
      // Enriched auth log - invalid token
      log.error('Token refresh failed: invalid_refresh_token', tokenError, {
        operation: 'token_refresh',
        success: false,
        reason: 'invalid_refresh_token',
        ...(request.headers.get('x-forwarded-for') && {
          ipAddress: request.headers.get('x-forwarded-for'),
        }),
        ...(request.headers.get('user-agent') && { userAgent: request.headers.get('user-agent') }),
        tokenLength: refreshToken.length,
        duration: Date.now() - startTime,
        securityThreat: 'credential_attack',
        component: 'auth',
        severity: 'medium',
      });

      // Security logging
      log.security('token_validation_failure', 'high', {
        action: 'refresh_token_invalid',
        blocked: true,
        threat: 'credential_attack',
      });

      return createErrorResponse('Invalid refresh token', 401, request);
    }

    // Get user details from database
    const db = (await import('@/lib/db')).db;
    const users = (await import('@/lib/db')).users;
    const [user] = await db
      .select()
      .from(users)
      .where((await import('drizzle-orm')).eq(users.user_id, userId))
      .limit(1);

    if (!user || !user.is_active) {
      log.auth('token_refresh', false, {
        userId,
        reason: user ? 'user_inactive' : 'user_not_found',
      });
      return createErrorResponse('User account is inactive', 401, request);
    }

    // Get user's RBAC context for complete user data
    // Use try-catch to allow token refresh even if context load fails
    const { getUserContextOrThrow, UserContextAuthError } = await import('@/lib/rbac/user-context');
    let userContext: Awaited<ReturnType<typeof getUserContextOrThrow>> | null = null;
    try {
      userContext = await getUserContextOrThrow(user.user_id);
    } catch (error) {
      // Auth errors during refresh are acceptable - user can still refresh tokens
      // but will have degraded response (no roles/permissions)
      if (error instanceof UserContextAuthError) {
        log.warn('User context load failed during token refresh', {
          userId: user.user_id,
          reason: error.reason,
          operation: 'token_refresh',
          component: 'auth',
        });
      } else {
        // Server errors should be logged but not block refresh
        log.error('Server error loading user context during refresh', error, {
          userId: user.user_id,
          operation: 'token_refresh',
          component: 'auth',
        });
      }
    }

    // Extract device info
    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const deviceInfo = extractRequestMetadata(request);

    // Rotate tokens
    const tokenPair = await refreshTokenPair(refreshToken, deviceInfo);

    if (!tokenPair) {
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

    // Generate new authenticated CSRF token as part of token rotation
    const csrfToken = await setCSRFToken(user.user_id);

    // Set new refresh token in httpOnly cookie and return user data
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
        refreshTokenExpiresAt: tokenPair.refreshTokenExpiresAt.toISOString(),
        sessionId: tokenPair.sessionId,
        csrfToken, // Include refreshed CSRF token
      },
      message: 'Tokens refreshed successfully',
      meta: { timestamp: new Date().toISOString() },
    });

    // Set secure cookies for both tokens
    // Use NODE_ENV to determine cookie security (staging should use NODE_ENV=production)
    const isSecureEnvironment = process.env.NODE_ENV === 'production';

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

    // Enriched auth log - successful refresh
    const sessionAge = tokenPayload.iat ? Date.now() - tokenPayload.iat * 1000 : undefined;
    const lastActivity = tokenPayload.iat
      ? new Date(tokenPayload.iat * 1000).toISOString()
      : undefined;

    log.info('Token refresh successful', {
      operation: 'token_refresh',
      success: true,
      userId,
      email: user.email,
      ...(sessionAge && { sessionAge }),
      ...(lastActivity && { lastActivity }),
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      sessionId: tokenPair.sessionId,
      roleCount: userRoles.length,
      ...(primaryRole && { primaryRole }),
      permissionCount: userContext?.all_permissions?.length || 0,
      deviceName: deviceInfo.deviceName,
      deviceFingerprint: deviceInfo.fingerprint.substring(0, 8),
      newTokenExpiry: tokenPair.expiresAt.toISOString(),
      duration: Date.now() - startTime,
      component: 'auth',
      severity: 'info',
    });

    return response;
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Token refresh failed with error', error, {
      operation: 'token_refresh',
      duration: totalDuration,
      hasRefreshToken: !!refreshTokenForError,
      component: 'auth',
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
        }
      }
    } catch {
      // Could not extract user ID from token
    }

    // Log as security event (token refresh doesn't require prior authentication)
    await AuditLogger.logSecurity({
      action: 'token_refresh_error',
      ipAddress: metadata.ipAddress,
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: failedUserId !== 'unknown' ? failedUserId : undefined,
        correlationId: correlation.current(),
      },
      severity: 'medium',
    });

    return handleRouteError(error, 'Token refresh failed', request);
  }
};

// Export with publicRoute wrapper for automatic rate limiting
// Uses 'auth' rate limit (20/15min) since this is a security-critical authentication endpoint
export const POST = publicRoute(
  refreshHandler,
  'Token refresh must be available without prior authentication',
  { rateLimit: 'auth' }
);
