/**
 * OIDC Discovery Document Cache
 *
 * Caches the OIDC discovery document (/.well-known/openid-configuration) in Redis/Valkey.
 * This eliminates ~200-300ms network latency on every login/callback request.
 *
 * CACHE STRATEGY:
 * - TTL: 24 hours (discovery documents are stable, rarely change)
 * - Key: oidc:discovery:{tenantId}
 * - Fallback: Network fetch if cache miss or Redis unavailable
 *
 * SECURITY:
 * - Discovery documents are public, cryptographically validated data
 * - No sensitive information is cached
 * - JWT signing keys (JWKS) are fetched separately by the library
 *
 * @module lib/oidc/discovery-cache
 */

import { log } from '@/lib/logger';
import { getRedisClient } from '@/lib/redis';

/**
 * Discovery document shape (subset of OpenID Connect Discovery 1.0)
 * Full spec: https://openid.net/specs/openid-connect-discovery-1_0.html
 */
export interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported: string[];
  response_modes_supported?: string[];
  grant_types_supported?: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  token_endpoint_auth_methods_supported?: string[];
  claims_supported?: string[];
  code_challenge_methods_supported?: string[];
  end_session_endpoint?: string;
  // Microsoft-specific extensions
  frontchannel_logout_supported?: boolean;
  request_uri_parameter_supported?: boolean;
  [key: string]: unknown; // Allow additional properties
}

/**
 * Cache configuration
 */
const CACHE_CONFIG = {
  namespace: 'oidc',
  ttlSeconds: 86400, // 24 hours
  wellKnownSuffix: '.well-known/openid-configuration',
} as const;

/**
 * Build cache key for discovery document
 */
function buildCacheKey(tenantId: string): string {
  return `${CACHE_CONFIG.namespace}:discovery:${tenantId}`;
}

/**
 * Fetch discovery document from network
 *
 * @param issuerUrl - The issuer URL (e.g., https://login.microsoftonline.com/{tenantId}/v2.0)
 * @returns Discovery document JSON
 * @throws Error if fetch fails
 */
async function fetchFromNetwork(issuerUrl: URL): Promise<DiscoveryDocument> {
  // Ensure issuer URL ends with / before appending well-known path
  const baseUrl = issuerUrl.href.endsWith('/') ? issuerUrl.href : `${issuerUrl.href}/`;
  const discoveryUrl = new URL(CACHE_CONFIG.wellKnownSuffix, baseUrl);

  const response = await fetch(discoveryUrl.href, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Discovery fetch failed: ${response.status} ${response.statusText}`);
  }

  const document = (await response.json()) as DiscoveryDocument;

  // Basic validation
  if (!document.issuer || !document.authorization_endpoint || !document.token_endpoint) {
    throw new Error('Invalid discovery document: missing required fields');
  }

  return document;
}

/**
 * Get cached discovery document from Redis
 *
 * @param tenantId - Microsoft Entra tenant ID
 * @returns Cached document or null if not found/error
 */
async function getFromCache(tenantId: string): Promise<DiscoveryDocument | null> {
  const client = getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const key = buildCacheKey(tenantId);
    const cached = await client.get(key);

    if (!cached) {
      return null;
    }

    return JSON.parse(cached) as DiscoveryDocument;
  } catch (error) {
    log.error('Failed to read OIDC discovery from cache', error instanceof Error ? error : new Error(String(error)), {
      component: 'oidc',
      operation: 'cache_get',
      tenantId,
    });
    return null;
  }
}

/**
 * Store discovery document in Redis cache
 *
 * @param tenantId - Microsoft Entra tenant ID
 * @param document - Discovery document to cache
 * @returns true if cached successfully
 */
async function setInCache(tenantId: string, document: DiscoveryDocument): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    const key = buildCacheKey(tenantId);
    await client.setex(key, CACHE_CONFIG.ttlSeconds, JSON.stringify(document));
    return true;
  } catch (error) {
    log.error('Failed to cache OIDC discovery document', error instanceof Error ? error : new Error(String(error)), {
      component: 'oidc',
      operation: 'cache_set',
      tenantId,
    });
    return false;
  }
}

/**
 * Get OIDC Discovery Document
 *
 * Attempts to read from Redis cache first, falls back to network fetch.
 * Automatically caches network responses for 24 hours.
 *
 * @param tenantId - Microsoft Entra tenant ID
 * @returns Discovery document and cache hit status
 */
export async function getDiscoveryDocument(
  tenantId: string
): Promise<{ document: DiscoveryDocument; cacheHit: boolean; duration: number }> {
  const startTime = Date.now();

  // 1. Try cache first
  const cached = await getFromCache(tenantId);
  if (cached) {
    const duration = Date.now() - startTime;
    log.debug('OIDC discovery cache hit', {
      component: 'oidc',
      tenantId,
      cacheHit: true,
      duration,
    });
    return { document: cached, cacheHit: true, duration };
  }

  // 2. Cache miss - fetch from network
  const issuerUrl = new URL(`https://login.microsoftonline.com/${tenantId}/v2.0`);

  log.debug('OIDC discovery cache miss - fetching from network', {
    component: 'oidc',
    tenantId,
    issuerUrl: issuerUrl.href,
  });

  const document = await fetchFromNetwork(issuerUrl);
  const fetchDuration = Date.now() - startTime;

  // 3. Cache for future requests (fire-and-forget)
  setInCache(tenantId, document).then((success) => {
    if (success) {
      log.debug('OIDC discovery document cached', {
        component: 'oidc',
        tenantId,
        ttlSeconds: CACHE_CONFIG.ttlSeconds,
      });
    }
  });

  log.info('OIDC discovery document fetched from network', {
    component: 'oidc',
    tenantId,
    cacheHit: false,
    duration: fetchDuration,
    issuer: document.issuer,
  });

  return { document, cacheHit: false, duration: fetchDuration };
}

/**
 * Invalidate cached discovery document
 *
 * Use when tenant configuration changes or for testing.
 *
 * @param tenantId - Microsoft Entra tenant ID
 * @returns true if invalidated successfully
 */
export async function invalidateDiscoveryCache(tenantId: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    const key = buildCacheKey(tenantId);
    await client.del(key);
    log.info('OIDC discovery cache invalidated', {
      component: 'oidc',
      tenantId,
    });
    return true;
  } catch (error) {
    log.error('Failed to invalidate OIDC discovery cache', error instanceof Error ? error : new Error(String(error)), {
      component: 'oidc',
      tenantId,
    });
    return false;
  }
}

