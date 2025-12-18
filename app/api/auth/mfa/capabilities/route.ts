/**
 * GET /api/auth/mfa/capabilities
 * WebAuthn feature detection and capabilities endpoint
 *
 * Purpose:
 * - Helps client determine if WebAuthn is supported
 * - Provides system limits and configuration
 * - Enables graceful degradation for unsupported browsers
 *
 * Authentication: Public (no authentication required)
 * Rate Limit: High (session_read level - 500/min)
 *
 * Response includes:
 * - WebAuthn support detection (basic heuristic based on user-agent)
 * - Platform authenticator preference
 * - Maximum credential limits
 * - Browser recommendations
 */

import type { NextRequest } from 'next/server';
import { publicRoute } from '@/lib/api/route-handlers';
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { MAX_CREDENTIALS_PER_USER } from '@/lib/auth/webauthn/constants';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const handler = async (request: NextRequest) => {
  try {
    const userAgent = request.headers.get('user-agent') || '';

    // Basic WebAuthn support detection (heuristic based on user-agent)
    // More sophisticated detection should be done client-side via JavaScript API
    const webauthnSupported = isWebAuthnSupported(userAgent);
    const browserInfo = getBrowserInfo(userAgent);

    log.debug('webauthn capabilities check', {
      operation: 'mfa_capabilities',
      userAgent: userAgent.substring(0, 100),
      webauthnSupported,
      browser: browserInfo.name,
      component: 'auth',
    });

    return createSuccessResponse({
      // WebAuthn availability
      webauthn_supported: webauthnSupported,

      // Browser information
      browser: browserInfo,

      // System configuration
      max_credentials_per_user: MAX_CREDENTIALS_PER_USER,
      platform_authenticator_preferred: true,
      user_verification_required: true,

      // Supported features
      features: {
        discoverable_credentials: true, // Resident keys / passkeys
        user_verification: true, // Biometric / PIN
        platform_authenticators: true, // Touch ID, Face ID, Windows Hello
        cross_platform_authenticators: true, // USB security keys
      },

      // Recommendations
      recommendations: {
        min_chrome_version: 108,
        min_safari_version: 16,
        min_edge_version: 108,
        min_firefox_version: 119,
        supported_browsers: [
          'Chrome 108+',
          'Safari 16+',
          'Edge 108+',
          'Firefox 119+',
          'Brave (Chromium-based)',
        ],
      },

      // Help resources
      help: {
        compatibility_url: 'https://webauthn.io',
        setup_guide_url: '/help/passkeys',
      },
    });
  } catch (error) {
    log.error('webauthn capabilities check failed', error, {
      operation: 'mfa_capabilities',
      component: 'auth',
    });

    return handleRouteError(error, 'Failed to check WebAuthn capabilities', request);
  }
};

/**
 * Detect if browser supports WebAuthn based on user-agent
 * This is a basic heuristic - clients should use navigator.credentials API for definitive check
 */
function isWebAuthnSupported(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();

  // Chrome/Chromium 67+ (May 2018)
  const chromeMatch = ua.match(/chrome\/(\d+)/);
  if (chromeMatch?.[1] && parseInt(chromeMatch[1], 10) >= 67) {
    return true;
  }

  // Safari 13+ (Sep 2019)
  // Safari iOS 14.5+ (Apr 2021)
  const safariMatch = ua.match(/version\/(\d+).*safari/);
  if (safariMatch?.[1] && parseInt(safariMatch[1], 10) >= 13) {
    return true;
  }

  // Edge (Chromium) 18+ (Oct 2018)
  const edgeMatch = ua.match(/edg\/(\d+)/);
  if (edgeMatch?.[1] && parseInt(edgeMatch[1], 10) >= 18) {
    return true;
  }

  // Firefox 60+ (May 2018)
  const firefoxMatch = ua.match(/firefox\/(\d+)/);
  if (firefoxMatch?.[1] && parseInt(firefoxMatch[1], 10) >= 60) {
    return true;
  }

  // Default to false for unknown browsers
  return false;
}

/**
 * Extract browser information from user-agent
 */
function getBrowserInfo(userAgent: string): {
  name: string;
  version: string;
  supported: boolean;
} {
  const ua = userAgent.toLowerCase();

  // Chrome/Chromium
  const chromeMatch = ua.match(/chrome\/(\d+)/);
  if (chromeMatch?.[1] && !ua.includes('edg')) {
    const version = chromeMatch[1];
    return {
      name: 'Chrome',
      version,
      supported: parseInt(version, 10) >= 108,
    };
  }

  // Edge (Chromium)
  const edgeMatch = ua.match(/edg\/(\d+)/);
  if (edgeMatch?.[1]) {
    const version = edgeMatch[1];
    return {
      name: 'Edge',
      version,
      supported: parseInt(version, 10) >= 108,
    };
  }

  // Safari
  const safariMatch = ua.match(/version\/(\d+).*safari/);
  if (safariMatch?.[1]) {
    const version = safariMatch[1];
    return {
      name: 'Safari',
      version,
      supported: parseInt(version, 10) >= 16,
    };
  }

  // Firefox
  const firefoxMatch = ua.match(/firefox\/(\d+)/);
  if (firefoxMatch?.[1]) {
    const version = firefoxMatch[1];
    return {
      name: 'Firefox',
      version,
      supported: parseInt(version, 10) >= 119,
    };
  }

  return {
    name: 'Unknown',
    version: 'Unknown',
    supported: false,
  };
}

export const GET = publicRoute(
  handler,
  'WebAuthn capabilities detection - helps clients check browser support',
  { rateLimit: 'session_read' }
);
