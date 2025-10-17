import { headers } from 'next/headers';
import { log } from '@/lib/logger';
import type { CSPNonces } from './headers';

/**
 * Server-side utilities for accessing CSP nonces
 * These functions extract nonces from headers set by middleware
 */

/**
 * Extract CSP nonces from request headers (server-side only)
 * Returns nonces that were generated in middleware
 */
export async function getServerNonces(): Promise<CSPNonces> {
  const headersList = await headers();

  // Extract nonces from request headers set by middleware (lowercase header names)
  const scriptNonce = headersList.get('x-script-nonce');
  const styleNonce = headersList.get('x-style-nonce');
  const timestamp = headersList.get('x-nonce-timestamp');
  const environment = headersList.get('x-nonce-environment') as
    | 'development'
    | 'staging'
    | 'production';

  // Fallback values if headers are missing (shouldn't happen in normal operation)
  if (!scriptNonce || !styleNonce || !timestamp || !environment) {
    // Generate fallback nonces in development - this should only happen during static generation
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (isDevelopment) {
      log.warn('CSP nonces not found in request headers - generating fallback nonces', {
        operation: 'get_nonces',
        reason: 'missing_headers',
        component: 'security',
      });
    }

    return {
      scriptNonce: isDevelopment ? `dev-fallback-${Date.now()}` : 'prod-fallback-script',
      styleNonce: isDevelopment ? `dev-fallback-${Date.now() + 1}` : 'prod-fallback-style',
      timestamp: Date.now(),
      environment: isDevelopment ? 'development' : environment || 'production',
    };
  }

  return {
    scriptNonce,
    styleNonce,
    timestamp: parseInt(timestamp, 10),
    environment,
  };
}

/**
 * Get script nonce only (convenience function)
 */
export async function getServerScriptNonce(): Promise<string> {
  const nonces = await getServerNonces();
  return nonces.scriptNonce;
}

/**
 * Get style nonce only (convenience function)
 */
export async function getServerStyleNonce(): Promise<string> {
  const nonces = await getServerNonces();
  return nonces.styleNonce;
}

/**
 * Create nonce attributes for server-side rendered elements
 * Returns objects that can be spread into JSX element props
 */
export async function getServerNonceAttributes(): Promise<{
  scriptNonceAttr: { nonce: string };
  styleNonceAttr: { nonce: string };
}> {
  const { scriptNonce, styleNonce } = await getServerNonces();

  return {
    scriptNonceAttr: { nonce: scriptNonce },
    styleNonceAttr: { nonce: styleNonce },
  };
}

/**
 * Safely get nonces with error handling
 * Returns null if nonces cannot be retrieved
 */
export async function getServerNoncesSafe(): Promise<CSPNonces | null> {
  try {
    return await getServerNonces();
  } catch (error) {
    log.error('Failed to retrieve server nonces', error, {
      operation: 'get_nonces_safe',
      component: 'security',
    });
    return null;
  }
}
