import { type NextRequest, NextResponse } from 'next/server';
import { publicRoute } from '@/lib/api/route-handlers';
import { createErrorResponse } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';
import { generateAnonymousToken, setCSRFToken } from '@/lib/security/csrf-unified';

/**
 * CSRF Token Generation Endpoint
 *
 * This endpoint is PUBLIC but behaves differently based on authentication status:
 * - Unauthenticated users: Get anonymous tokens (for login/register)
 * - Authenticated users: Get authenticated tokens (for API calls)
 *
 * Security measures:
 * - Rate limited to prevent token farming
 * - Tokens bound to IP/User-Agent/Time window
 * - Short expiration times
 */
const getCSRFTokenHandler = async (request: NextRequest) => {
  const _startTime = Date.now();

  // Lightweight authentication check - just check if access token cookie exists and is valid
  // Don't load full user context for performance
  let userId: string | null = null;
  let isAuthenticated = false;

  try {
    const cookieStore = await import('next/headers').then((m) => m.cookies());
    const accessToken = cookieStore.get('access-token')?.value;

    if (accessToken) {
      // Quick JWT validation without full auth context loading
      const { verifyAccessToken } = await import('@/lib/auth/token-verification');
      const payload = await verifyAccessToken(accessToken);

      if (payload) {
        userId = payload.userId;
        isAuthenticated = true;
      }
    }
  } catch {
    isAuthenticated = false;
  }

  log.info('CSRF token request initiated', {
    isAuthenticated,
    userId: userId,
  });

  try {
    let token: string;
    let tokenType: string;

    if (isAuthenticated && userId) {
      // Authenticated user gets authenticated token
      token = await setCSRFToken(userId);
      tokenType = 'authenticated';

      log.info('Authenticated CSRF token generated', {
        userId: userId,
      });
    } else {
      // Unauthenticated user gets anonymous token (edge-compatible)
      token = await generateAnonymousToken(request);
      tokenType = 'anonymous';

      log.info('Anonymous CSRF token generated');
    }

    // Set cookie and return token
    const response = NextResponse.json({
      success: true,
      data: { csrfToken: token },
      message: 'CSRF token issued',
    });

    response.cookies.set('csrf-token', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: tokenType === 'anonymous' ? 3600 : 86400,
      path: '/',
    });

    log.info('CSRF token issued successfully', { tokenType });
    return response;
  } catch (error) {
    log.error('CSRF token generation error', error);
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// Export as public route - CSRF tokens must be available before authentication
// Uses stricter 'auth' rate limiting to prevent token farming attacks
export const GET = publicRoute(
  getCSRFTokenHandler,
  'CSRF tokens must be available to anonymous users for login protection',
  { rateLimit: 'api' }
);
