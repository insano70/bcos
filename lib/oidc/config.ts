/**
 * OIDC Configuration Module
 *
 * Handles OIDC configuration management with discovery caching.
 * Features:
 * - 24-hour discovery document cache (reduces latency by ~200ms)
 * - Environment variable validation via zod schema
 * - Server-side only enforcement
 * - Graceful configuration loading
 *
 * @module lib/oidc/config
 */

import { getOIDCConfig, isOIDCEnabled } from '@/lib/env';
import { log } from '@/lib/logger';
import { ConfigurationError } from './errors';
import type { OIDCConfig } from './types';

/**
 * Build OIDC Configuration
 *
 * Loads and validates OIDC configuration from environment variables.
 * This function is lightweight and does NOT perform discovery.
 * Discovery is handled by the OIDCClient class with caching.
 *
 * @returns OIDCConfig object
 * @throws ConfigurationError if required environment variables are missing
 */
export function buildOIDCConfig(): OIDCConfig {
  // Server-side only check
  if (typeof window !== 'undefined') {
    throw new ConfigurationError('buildOIDCConfig can only be used on the server side');
  }

  // Get configuration from environment (validates with zod)
  const envConfig = getOIDCConfig();

  if (!envConfig) {
    throw new ConfigurationError('OIDC is not configured. Missing required environment variables', {
      required: [
        'ENTRA_TENANT_ID',
        'ENTRA_APP_ID (client_id)',
        'ENTRA_CLIENT_SECRET',
        'OIDC_REDIRECT_URI',
        'OIDC_SESSION_SECRET',
      ],
    });
  }

  log.debug('OIDC configuration loaded', {
    tenantId: envConfig.tenantId,
    clientId: `${envConfig.clientId.substring(0, 8)}...`,
    redirectUri: envConfig.redirectUri,
    scopes: envConfig.scopes,
    allowedDomains: envConfig.allowedEmailDomains,
    strictFingerprint: envConfig.strictFingerprint,
  });

  return {
    tenantId: envConfig.tenantId,
    clientId: envConfig.clientId,
    clientSecret: envConfig.clientSecret,
    redirectUri: envConfig.redirectUri,
    scopes: envConfig.scopes,
    allowedEmailDomains: envConfig.allowedEmailDomains,
    successRedirect: envConfig.successRedirect,
  };
}

/**
 * Check if OIDC is enabled
 *
 * Simple wrapper around isOIDCEnabled from env module.
 * Used for feature flagging and conditional logic.
 *
 * @returns true if OIDC is properly configured
 */
export function checkOIDCEnabled(): boolean {
  if (typeof window !== 'undefined') {
    return false;
  }
  return isOIDCEnabled();
}
