import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { authRoute, type AuthSession } from '@/lib/api/route-handlers';
import { AuditLogger } from '@/lib/api/services/audit';
import { correlation, log } from '@/lib/logger';
import { verifyCSRFToken } from '@/lib/security/csrf';
import {
  getCurrentSessionId,
  revokeAllSessions,
  revokeSession,
} from '@/lib/services/auth/session-manager-service';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

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
const logoutHandler = async (request: NextRequest, session?: AuthSession) => {
  const startTime = Date.now();

  try {
    // CSRF PROTECTION: Verify CSRF token before authentication check
    const isValidCSRF = await verifyCSRFToken(request);
    if (!isValidCSRF) {
      return createErrorResponse('CSRF token validation failed', 403, request);
    }

    // Verify session exists (authRoute ensures authentication)
    if (!session) {
      return createErrorResponse('Authentication required', 401, request);
    }

    // Get refresh token from httpOnly cookie
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh-token')?.value;

    if (!refreshToken) {
      return createErrorResponse('No active session found', 400, request);
    }

    // Extract device info for audit logging
    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);

    // Get current session ID to revoke
    const sessionId = await getCurrentSessionId(refreshToken, session.user.id);

    if (!sessionId) {
      return createErrorResponse('Invalid session', 401, request);
    }

    // Revoke the current session using service layer
    const result = await revokeSession(session.user.id, sessionId, refreshToken);

    // AUDIT LOGGING: Log the logout action
    await AuditLogger.logUserAction({
      action: 'logout',
      userId: session.user.id,
      resourceType: 'session',
      resourceId: result.sessionId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: {
        reason: 'user_initiated',
        tokensRevoked: result.tokensRevoked,
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
        sessionRevoked: result.sessionId,
        tokensRevoked: result.tokensRevoked,
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
    return handleRouteError(error, 'Logout failed', request);
  }
};

/**
 * Revoke All Sessions Endpoint
 * Emergency logout from all devices
 * SECURED: Requires authentication and token validation
 */
const revokeAllSessionsHandler = async (request: NextRequest, session?: AuthSession) => {
  const startTime = Date.now();

  try {
    log.security('revoke_all_sessions_requested', 'medium', {
      action: 'emergency_logout',
      threat: 'potential_compromise',
    });

    // CSRF PROTECTION: Verify CSRF token before authentication check
    const isValidCSRF = await verifyCSRFToken(request);
    if (!isValidCSRF) {
      return createErrorResponse('CSRF token validation failed', 403, request);
    }

    // Verify session exists (authRoute ensures authentication)
    if (!session) {
      return createErrorResponse('Authentication required', 401, request);
    }

    // Get refresh token from httpOnly cookie (not strictly needed for revokeAllSessions but validates session)
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh-token')?.value;

    if (!refreshToken) {
      return createErrorResponse('No active session found', 400, request);
    }

    // Extract device info for audit logging
    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);

    // Revoke all user sessions using service layer
    const result = await revokeAllSessions(session.user.id, 'security');

    // AUDIT LOGGING: Log the revoke all sessions action
    await AuditLogger.logSecurity({
      action: 'revoke_all_sessions',
      userId: session.user.id,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: {
        tokensRevoked: result.tokensRevoked,
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
        tokensRevoked: result.tokensRevoked,
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
      data: { revokedSessions: result.tokensRevoked },
      message: `Successfully logged out from all devices`,
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
    return handleRouteError(error, 'Failed to revoke all sessions', request);
  }
};

// Export with authRoute wrapper for automatic authentication and rate limiting
export const POST = authRoute(logoutHandler, { rateLimit: 'auth' });
export const DELETE = authRoute(revokeAllSessionsHandler, { rateLimit: 'auth' });
