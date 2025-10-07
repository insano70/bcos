/**
 * OIDC Logout Endpoint
 *
 * Implements RP-initiated logout (Relying Party-Initiated Logout).
 * This ensures the session is terminated at both the application and identity provider levels.
 *
 * Flow:
 * 1. Clear local auth cookies (access-token, refresh-token)
 * 2. Redirect to Microsoft Entra logout endpoint
 * 3. Entra clears its session
 * 4. Entra redirects back to post_logout_redirect_uri (typically /signin)
 *
 * @route GET /api/auth/oidc/logout
 * @access Public (no authentication required for logout)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { publicRoute } from '@/lib/api/route-handler';
import { getOIDCConfig } from '@/lib/env';
import { log } from '@/lib/logger';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * OIDC Logout Handler
 *
 * Clears local session and redirects to identity provider logout endpoint.
 */
const oidcLogoutHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  log.api('GET /api/auth/oidc/logout - OIDC logout initiated', request, 0, 0);

  try {
    // Get OIDC configuration
    const config = getOIDCConfig();

    // Extract device info
    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);

    log.info('OIDC logout initiated', {
      ipAddress: metadata.ipAddress,
      duration: Date.now() - startTime,
    });

    // Create response with cleared cookies
    let redirectUrl: string;

    if (config) {
      // Build Entra logout URL
      const logoutUrl = new URL(
        `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/logout`
      );

      // Add post_logout_redirect_uri (where Entra redirects after logout)
      const postLogoutRedirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/signin?logged_out=true`;
      logoutUrl.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);

      redirectUrl = logoutUrl.href;

      log.info('Redirecting to Entra logout', {
        postLogoutRedirectUri,
      });
    } else {
      // OIDC not configured, just redirect to signin
      redirectUrl = new URL('/signin?logged_out=true', request.url).href;

      log.warn('OIDC not configured, local logout only');
    }

    const response = NextResponse.redirect(redirectUrl);

    // Clear auth cookies (SECURITY FIX: Use correct cookie names and strict sameSite)
    response.cookies.set('access-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    });

    response.cookies.set('refresh-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    });

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('OIDC logout failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    });

    // Even if logout fails, clear cookies and redirect to signin
    const response = NextResponse.redirect(new URL('/signin?error=logout_failed', request.url));

    response.cookies.set('access-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    });

    response.cookies.set('refresh-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    });

    return response;
  }
};

// Export as GET endpoint with public route handler
export const GET = publicRoute(oidcLogoutHandler, 'OIDC logout', {
  rateLimit: 'auth',
});
