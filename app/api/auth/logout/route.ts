import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/middleware/auth';
import { createErrorResponse } from '@/lib/api/responses/error';
import { AuditLogger } from '@/lib/api/services/audit';
import { revokeAllUserTokens, revokeRefreshToken } from '@/lib/auth/token-manager';
import { db, token_blacklist } from '@/lib/db';
import { correlation, log } from '@/lib/logger';
import { verifyCSRFToken } from '@/lib/security/csrf';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

import { applyRateLimit } from '@/lib/api/middleware/rate-limit';

/**
 * Helper function to clear authentication cookies
 * Used by both logout and revoke all sessions endpoints
 */
function clearAuthCookies(response: NextResponse): void {
  const isProduction = process.env.NODE_ENV === 'production';

  // Clear refresh token cookie
  response.cookies.set('refresh-token', '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 0, // Expire immediately
  });

  // Clear access token cookie
  response.cookies.set('access-token', '', {
    httpOnly: true, // ✅ SECURITY FIX: Consistent with secure token model
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 0, // Expire immediately
  });

  // Clear CSRF token cookie
  response.cookies.set('csrf-token', '', {
    httpOnly: false, // CSRF tokens need to be readable by JavaScript
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 0, // Expire immediately
  });
}

/**
 * Custom Logout Endpoint
 * Complete token cleanup and session termination
 * SECURED: Requires authentication to prevent unauthorized logout
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    await applyRateLimit(request, 'auth');

    // CSRF PROTECTION: Verify CSRF token before authentication check
    const isValidCSRF = await verifyCSRFToken(request);
    if (!isValidCSRF) {
      return createErrorResponse('CSRF token validation failed', 403, request);
    }

    // REQUIRE AUTHENTICATION: Only authenticated users can logout
    const session = await requireAuth(request);

    // Get refresh token from httpOnly cookie
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh-token')?.value;

    if (!refreshToken) {
      return createErrorResponse('No active session found', 400, request);
    }

    // VALIDATE TOKEN OWNERSHIP: Ensure refresh token belongs to authenticated user
    // This prevents one user from logging out another user
    const { verifyRefreshToken } = await import('@/lib/auth/token-verification');
    const payload = await verifyRefreshToken(refreshToken);

    if (!payload) {
      return createErrorResponse('Invalid session token', 401, request);
    }

    const tokenUserId = payload.userId;
    if (tokenUserId !== session.user.id) {
      return createErrorResponse(
        'Unauthorized: Token does not belong to authenticated user',
        403,
        request
      );
    }

    // Extract device info for audit logging
    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);

    // Revoke the refresh token
    const revoked = await revokeRefreshToken(refreshToken, 'logout');

    if (!revoked) {
      return createErrorResponse('Failed to logout', 500, request);
    }

    // Blacklist access token if provided (defense-in-depth)
    // Use authenticated user's ID for security
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const { jwtVerify } = await import('jose');
        const accessSecret = process.env.JWT_SECRET;
        if (!accessSecret) {
          throw new Error('JWT_SECRET is not configured');
        }
        const ACCESS_TOKEN_SECRET = new TextEncoder().encode(accessSecret);
        const { payload } = await jwtVerify(token, ACCESS_TOKEN_SECRET);
        const jti = payload.jti as string | undefined;
        const tokenUserId = payload.sub as string | undefined;

        // SECURITY: Ensure access token belongs to authenticated user
        if (jti && tokenUserId && tokenUserId === session.user.id) {
          await db.insert(token_blacklist).values({
            jti,
            user_id: session.user.id, // Use authenticated user's ID
            token_type: 'access',
            expires_at: new Date(Date.now() + 15 * 60 * 1000),
            reason: 'logout',
          });
        }
      } catch (e) {
        // Security logging for token blacklisting failure
        log.security('token_blacklist_failure', 'medium', {
          action: 'logout_token_cleanup_failed',
          reason: 'blacklist_error',
          threat: 'token_persistence',
        });

        log.warn('Failed to blacklist access token on logout', {
          error: e instanceof Error ? e.message : 'Unknown error',
          operation: 'logout',
        });
      }
    }

    // AUDIT LOGGING: Log the logout action
    await AuditLogger.logUserAction({
      action: 'logout',
      userId: session.user.id,
      resourceType: 'session',
      resourceId: 'current',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: {
        reason: 'user_initiated',
      },
    });

    // Enriched logout success log with session cleanup metrics
    log.info('Logout successful - session terminated', {
      operation: 'logout',
      success: true,
      userId: session.user.id,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      deviceName: metadata.deviceName,
      deviceFingerprint: metadata.fingerprint.substring(0, 8),
      sessionCleanup: {
        refreshTokenRevoked: revoked,
        accessTokenBlacklisted: !!authHeader,
        cookiesCleared: 3, // refresh-token, access-token, csrf-token
        csrfProtection: 'verified',
      },
      reason: 'user_initiated',
      duration: Date.now() - startTime,
      component: 'auth',
      correlationId: correlation.current(),
    });

    // Create response and clear authentication cookies
    const response = NextResponse.json({
      success: true,
      data: { message: 'Logged out successfully' },
      message: 'Session ended successfully',
      meta: { timestamp: new Date().toISOString() },
    });

    clearAuthCookies(response);

    return response;
  } catch (error) {
    log.error('Logout failed', error, {
      operation: 'logout',
      duration: Date.now() - startTime,
      component: 'auth',
    });
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
}

/**
 * Revoke All Sessions Endpoint
 * Emergency logout from all devices
 * SECURED: Requires authentication and token validation
 */
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    log.security('revoke_all_sessions_requested', 'medium', {
      action: 'emergency_logout',
      threat: 'potential_compromise',
    });

    // RATE LIMITING: Apply auth-level rate limiting to prevent revoke all sessions abuse
    await applyRateLimit(request, 'auth');

    // CSRF PROTECTION: Verify CSRF token before authentication check
    const isValidCSRF = await verifyCSRFToken(request);
    if (!isValidCSRF) {
      return createErrorResponse('CSRF token validation failed', 403, request);
    }

    // REQUIRE AUTHENTICATION: Critical security - only authenticated users can revoke all sessions
    const session = await requireAuth(request);

    // Get refresh token from httpOnly cookie
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh-token')?.value;

    if (!refreshToken) {
      return createErrorResponse('No active session found', 400, request);
    }

    // VALIDATE TOKEN OWNERSHIP: Double-check that refresh token belongs to authenticated user
    const { verifyRefreshToken } = await import('@/lib/auth/token-verification');
    const payload = await verifyRefreshToken(refreshToken);

    if (!payload) {
      return createErrorResponse('Invalid session', 401, request);
    }

    const tokenUserId = payload.userId;
    if (tokenUserId !== session.user.id) {
      return createErrorResponse(
        'Unauthorized: Token does not belong to authenticated user',
        403,
        request
      );
    }

    const userId = tokenUserId;

    // Revoke all user tokens
    const revokedCount = await revokeAllUserTokens(userId, 'security');

    // AUDIT LOGGING: Log the revoke all sessions action
    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);

    await AuditLogger.logSecurity({
      action: 'revoke_all_sessions',
      userId: session.user.id, // Use authenticated user's ID
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: {
        revokedCount,
        reason: 'user_requested',
      },
      severity: 'medium',
    });

    // Enriched revoke all sessions log with security context
    log.info('Revoke all sessions successful - all devices logged out', {
      operation: 'revoke_all_sessions',
      success: true,
      userId: session.user.id,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      deviceName: metadata.deviceName,
      deviceFingerprint: metadata.fingerprint.substring(0, 8),
      sessionCleanup: {
        tokensRevoked: revokedCount,
        allDevices: true,
        cookiesCleared: 3, // refresh-token, access-token, csrf-token
        csrfProtection: 'verified',
      },
      securityContext: {
        reason: 'user_requested',
        severity: 'medium',
        threat: 'potential_compromise',
        action: 'emergency_logout',
      },
      duration: Date.now() - startTime,
      component: 'auth',
      correlationId: correlation.current(),
    });

    // Create response and clear authentication cookies
    const response = NextResponse.json({
      success: true,
      data: { revokedSessions: revokedCount },
      message: `Successfully logged out from ${revokedCount} device(s)`,
      meta: { timestamp: new Date().toISOString() },
    });

    clearAuthCookies(response);

    return response;
  } catch (error) {
    log.error('Revoke all sessions error', error, {
      operation: 'revoke_all_sessions',
      duration: Date.now() - startTime,
      component: 'auth',
    });
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
}
